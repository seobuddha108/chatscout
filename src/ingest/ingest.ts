import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { creators, giftEvents, gifters, liveSessions } from "@/db/schema";
import type { CreatorInfo, GifterInfo, LiveEvent, LiveSource } from "./types";
import { MockSource } from "./mock-source";

const CHUNK = 1000;

export interface IngestResult {
  sessionsStarted: number;
  sessionsEnded: number;
  gifts: number;
  skipped: number; // events for rooms we have never seen a live_start for
}

/** Writes a batch of normalized events using bulk statements. Idempotent for starts/ends. */
export async function ingestEvents(db: DB, events: LiveEvent[]): Promise<IngestResult> {
  const starts = new Map<string, Extract<LiveEvent, { type: "live_start" }>>();
  const ends = new Map<string, Date>();
  const peak = new Map<string, number>();
  const gifts: Extract<LiveEvent, { type: "gift" }>[] = [];
  const creatorInfo = new Map<string, CreatorInfo>();
  const gifterInfo = new Map<string, GifterInfo>();

  for (const e of events) {
    switch (e.type) {
      case "live_start": starts.set(e.roomId, e); creatorInfo.set(e.creator.uniqueId, e.creator); break;
      case "live_end": ends.set(e.roomId, e.at); break;
      case "viewers": peak.set(e.roomId, Math.max(peak.get(e.roomId) ?? 0, e.viewers)); break;
      case "gift": gifts.push(e); gifterInfo.set(e.gifter.uniqueId, e.gifter); break;
    }
  }

  // 1. Upsert creators and gifters (deduplicated, so ON CONFLICT never sees a key twice).
  const creatorIds = new Map<string, number>();
  for (const batch of chunks([...creatorInfo.values()])) {
    const rows = await db.insert(creators).values(batch).onConflictDoUpdate({
      target: creators.uniqueId,
      set: {
        nickname: sql`excluded.nickname`, country: sql`excluded.country`,
        category: sql`excluded.category`, avatarUrl: sql`coalesce(excluded.avatar_url, ${creators.avatarUrl})`,
      },
    }).returning({ id: creators.id, uniqueId: creators.uniqueId });
    for (const r of rows) creatorIds.set(r.uniqueId, r.id);
  }
  const gifterIds = new Map<string, number>();
  for (const batch of chunks([...gifterInfo.values()])) {
    const rows = await db.insert(gifters).values(batch).onConflictDoUpdate({
      target: gifters.uniqueId,
      set: { nickname: sql`excluded.nickname`, country: sql`coalesce(excluded.country, ${gifters.country})` },
    }).returning({ id: gifters.id, uniqueId: gifters.uniqueId });
    for (const r of rows) gifterIds.set(r.uniqueId, r.id);
  }

  // 2. Insert new sessions.
  let sessionsStarted = 0;
  for (const batch of chunks([...starts.values()])) {
    const rows = await db.insert(liveSessions).values(batch.map((s) => ({
      externalRoomId: s.roomId, creatorId: creatorIds.get(s.creator.uniqueId)!, title: s.title, startedAt: s.at,
    }))).onConflictDoNothing({ target: liveSessions.externalRoomId }).returning({ id: liveSessions.id });
    sessionsStarted += rows.length;
  }

  // 3. Resolve every room referenced in this batch.
  const roomIds = [...new Set([...starts.keys(), ...ends.keys(), ...peak.keys(), ...gifts.map((g) => g.roomId)])];
  const rooms = new Map<string, { id: number; creatorId: number }>();
  for (const batch of chunks(roomIds)) {
    const rows = await db.select({ id: liveSessions.id, creatorId: liveSessions.creatorId, room: liveSessions.externalRoomId })
      .from(liveSessions).where(inArray(liveSessions.externalRoomId, batch));
    for (const r of rows) rooms.set(r.room, r);
  }

  // 4. Gifts.
  let skipped = 0;
  const giftRows = [];
  for (const g of gifts) {
    const room = rooms.get(g.roomId);
    if (!room) { skipped++; continue; }
    giftRows.push({
      sessionId: room.id, creatorId: room.creatorId, gifterId: gifterIds.get(g.gifter.uniqueId)!,
      giftName: g.giftName, diamonds: g.diamonds, createdAt: g.at,
    });
  }
  for (const batch of chunks(giftRows)) await db.insert(giftEvents).values(batch);

  // 5. Peak viewers and session ends, one UPDATE ... FROM (VALUES ...) per chunk.
  const peakRows = [...peak].filter(([room]) => rooms.has(room));
  skipped += peak.size - peakRows.length;
  for (const batch of chunks(peakRows)) {
    const values = sql.join(batch.map(([room, v]) => sql`(${room}, ${v}::int)`), sql`, `);
    await db.execute(sql`update live_sessions s set peak_viewers = greatest(s.peak_viewers, v.viewers)
      from (values ${values}) as v(room, viewers) where s.external_room_id = v.room`);
  }
  let sessionsEnded = 0;
  const endRows = [...ends].filter(([room]) => rooms.has(room));
  skipped += ends.size - endRows.length;
  for (const batch of chunks(endRows)) {
    const values = sql.join(batch.map(([room, at]) => sql`(${room}, ${at.toISOString()}::timestamptz)`), sql`, `);
    const res = await db.execute(sql`update live_sessions s set ended_at = v.at
      from (values ${values}) as v(room, at) where s.external_room_id = v.room and s.ended_at is null
      returning s.id`);
    sessionsEnded += rowCount(res);
  }

  return { sessionsStarted, sessionsEnded, gifts: giftRows.length, skipped };
}

/** One pipeline run: ask the source for new events given what is live, then store them. */
export async function runIngest(db: DB, source: LiveSource, now = new Date()) {
  const open = await db.select({
    roomId: liveSessions.externalRoomId, creatorUniqueId: creators.uniqueId, startedAt: liveSessions.startedAt,
  }).from(liveSessions).innerJoin(creators, eq(creators.id, liveSessions.creatorId))
    .where(isNull(liveSessions.endedAt));
  const events = await source.poll({ now, openSessions: open });
  return { source: source.name, events: events.length, ...(await ingestEvents(db, events)) };
}

/** Closes sessions that have been "live" implausibly long (lost live_end events). */
export async function closeStaleSessions(db: DB, maxHours = 12, now = new Date()) {
  const cutoff = new Date(now.getTime() - maxHours * 3_600_000);
  const rows = await db.update(liveSessions).set({ endedAt: now })
    .where(and(isNull(liveSessions.endedAt), sql`${liveSessions.startedAt} < ${cutoff.toISOString()}::timestamptz`))
    .returning({ id: liveSessions.id });
  return rows.length;
}

export function sourceFromEnv(): LiveSource {
  const name = process.env.LIVE_SOURCE ?? "mock";
  switch (name) {
    case "mock": return new MockSource();
    default: throw new Error(`Unknown LIVE_SOURCE "${name}"`);
  }
}

function* chunks<T>(arr: T[], size = CHUNK): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// postgres-js returns an array, PGlite returns { rows }.
function rowCount(res: unknown): number {
  if (Array.isArray(res)) return res.length;
  return (res as { rows?: unknown[] }).rows?.length ?? 0;
}
