import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { apiKeys, chatMessages, creators, giftEvents, gifters, liveSessions, pollVoters, webSessions } from "@/db/schema";
import type { CreatorInfo, GifterInfo, LiveEvent, LiveSource } from "./types";
import { MockSource } from "./mock-source";
import { ingestAnalytics, type AnalyticsResult } from "@/analytics/ingest";

const CHUNK = 1000;

export interface IngestResult extends AnalyticsResult {
  sessionsStarted: number;
  sessionsEnded: number;
  gifts: number;
  chats: number;
  chatsDropped: number; // chat from creators without an active ChatScout key (not stored)
  duplicates: number; // chat/gift events already stored (same TikTok message id)
  skipped: number; // events for rooms we have never seen a live_start for
}

/** Writes a batch of normalized events using bulk statements. Idempotent for starts/ends. */
export async function ingestEvents(db: DB, events: LiveEvent[]): Promise<IngestResult> {
  const starts = new Map<string, Extract<LiveEvent, { type: "live_start" }>>();
  const ends = new Map<string, Date>();
  const peak = new Map<string, number>();
  let gifts: Extract<LiveEvent, { type: "gift" }>[] = [];
  let chats: Extract<LiveEvent, { type: "chat" }>[] = [];
  const creatorInfo = new Map<string, CreatorInfo>();
  const gifterInfo = new Map<string, GifterInfo>();

  for (const e of events) {
    switch (e.type) {
      case "live_start": starts.set(e.roomId, e); creatorInfo.set(e.creator.uniqueId, e.creator); break;
      case "live_end": ends.set(e.roomId, e.at); break;
      case "viewers": peak.set(e.roomId, Math.max(peak.get(e.roomId) ?? 0, e.viewers)); break;
      case "gift": gifts.push(e); gifterInfo.set(e.gifter.uniqueId, e.gifter); break;
      case "chat": chats.push(e); break;
    }
  }

  // 1. Upsert creators and gifters (deduplicated, so ON CONFLICT never sees a key twice).
  const creatorIds = new Map<string, number>();
  for (const batch of chunks([...creatorInfo.values()])) {
    const rows = await db.insert(creators).values(batch).onConflictDoUpdate({
      target: creators.uniqueId,
      set: {
        nickname: sql`excluded.nickname`, country: sql`coalesce(excluded.country, ${creators.country})`,
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
  const roomIds = [...new Set([
    ...starts.keys(), ...ends.keys(), ...peak.keys(), ...gifts.map((g) => g.roomId), ...chats.map((c) => c.roomId),
    ...events.filter((e) => e.type.startsWith("poll_")).map((e) => e.roomId),
  ])];
  const rooms = new Map<string, { id: number; creatorId: number }>();
  for (const batch of chunks(roomIds)) {
    const rows = await db.select({ id: liveSessions.id, creatorId: liveSessions.creatorId, room: liveSessions.externalRoomId })
      .from(liveSessions).where(inArray(liveSessions.externalRoomId, batch));
    for (const r of rows) rooms.set(r.room, r);
  }

  // 3b. Drop chat/gift events already stored (overlapping watchers, retries), keyed by TikTok message id.
  const dupes = await knownMessageIds(db, rooms, chats, gifts);
  const seen = new Set<string>();
  const isFresh = (e: { type: string; roomId: string; msgId?: string }) => {
    if (!e.msgId) return true;
    const key = `${e.type}|${e.roomId}|${e.msgId}`;
    if (dupes.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const freshEvents = events.filter((e) => (e.type === "chat" || e.type === "gift") ? isFresh(e) : true);
  const duplicates = events.length - freshEvents.length;
  chats = freshEvents.filter((e): e is typeof chats[number] => e.type === "chat");
  gifts = freshEvents.filter((e): e is typeof gifts[number] => e.type === "gift");

  // 4. Gifts.
  let skipped = 0;
  const giftRows = [];
  for (const g of gifts) {
    const room = rooms.get(g.roomId);
    if (!room) { skipped++; continue; }
    giftRows.push({
      sessionId: room.id, creatorId: room.creatorId, gifterId: gifterIds.get(g.gifter.uniqueId)!,
      giftName: g.giftName, diamonds: g.diamonds, createdAt: g.at, externalMsgId: g.msgId ?? null,
    });
  }
  for (const batch of chunks(giftRows)) await db.insert(giftEvents).values(batch).onConflictDoNothing();

  // 4b. Chat — only for creators who opted in. Everyone else's chat is never written.
  let chatsDropped = 0;
  const chatRows = [];
  let optedInCache: Promise<Set<number>> | undefined;
  const getOptedIn = () => (optedInCache ??= optedInCreatorIds(db));
  if (chats.length) {
    const optedIn = await getOptedIn();
    for (const c of chats) {
      const room = rooms.get(c.roomId);
      if (!room) { skipped++; continue; }
      if (!optedIn.has(room.creatorId)) { chatsDropped++; continue; }
      chatRows.push({
        sessionId: room.id, creatorId: room.creatorId, chatterUniqueId: c.user.uniqueId.toLowerCase(),
        chatterNickname: c.user.nickname, text: c.text.slice(0, 500), createdAt: c.at, externalMsgId: c.msgId ?? null,
      });
    }
    for (const batch of chunks(chatRows)) await db.insert(chatMessages).values(batch).onConflictDoNothing();
  }

  // 4c. Aggregate analytics (chat volume/sentiment, mentions, polls).
  const analytics = await ingestAnalytics(db, freshEvents, rooms, getOptedIn);

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

  return { sessionsStarted, sessionsEnded, gifts: giftRows.length, chats: chatRows.length, chatsDropped, duplicates, skipped, ...analytics };
}

/** "type|roomId|msgId" keys of chat/gift events in this batch that are already in the database. */
async function knownMessageIds(
  db: DB, rooms: Map<string, { id: number; creatorId: number }>,
  chats: { roomId: string; msgId?: string }[], gifts: { roomId: string; msgId?: string }[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const roomById = new Map([...rooms].map(([room, r]) => [r.id, room]));
  const lookups = [
    { type: "chat", table: chatMessages, items: chats },
    { type: "gift", table: giftEvents, items: gifts },
  ] as const;
  for (const { type, table, items } of lookups) {
    const ids = [...new Set(items.filter((e) => e.msgId && rooms.has(e.roomId)).map((e) => e.msgId!))];
    const sessionIds = [...new Set(items.filter((e) => e.msgId && rooms.has(e.roomId)).map((e) => rooms.get(e.roomId)!.id))];
    for (const batch of chunks(ids)) {
      const rows = await db.select({ sessionId: table.sessionId, msgId: table.externalMsgId }).from(table)
        .where(and(inArray(table.sessionId, sessionIds), inArray(table.externalMsgId, batch)));
      for (const r of rows) out.add(`${type}|${roomById.get(r.sessionId)}|${r.msgId}`);
    }
  }
  return out;
}

/** Creators verified via TikTok Login that also hold an active (not revoked, not expired) key. */
export async function optedInCreatorIds(db: DB, now = new Date()): Promise<Set<number>> {
  const rows = await db.selectDistinct({ id: apiKeys.creatorId }).from(apiKeys)
    .innerJoin(creators, eq(creators.id, apiKeys.creatorId))
    .where(and(isNotNull(creators.verifiedAt), isNull(apiKeys.revokedAt), gt(apiKeys.expiresAt, now)));
  return new Set(rows.map((r) => r.id!));
}

/** Deletes single gift events (incl. gifter link) older than the retention period, then orphaned gifters. */
export async function purgeOldGifts(db: DB, days = Number(process.env.GIFT_RETENTION_DAYS ?? 90), now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.delete(giftEvents).where(lt(giftEvents.createdAt, cutoff)).returning({ id: giftEvents.id });
  if (rows.length) {
    await db.execute(sql`delete from gifters g where not exists (select 1 from gift_events e where e.gifter_id = g.id)`);
  }
  return rows.length;
}

/** Deletes expired dashboard sessions. */
export async function purgeExpiredSessions(db: DB, now = new Date()) {
  const rows = await db.delete(webSessions).where(lt(webSessions.expiresAt, now)).returning({ id: webSessions.id });
  return rows.length;
}

/** Deletes chat messages older than the retention period. */
export async function purgeOldChat(db: DB, days = Number(process.env.CHAT_RETENTION_DAYS ?? 30), now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.delete(chatMessages).where(lt(chatMessages.createdAt, cutoff)).returning({ id: chatMessages.id });
  // Named poll votes follow the same retention as chat.
  const votes = await db.delete(pollVoters).where(lt(pollVoters.votedAt, cutoff)).returning({ id: pollVoters.pollId });
  return rows.length + votes.length;
}

/** One pipeline run: ask the source for new events given what is live, then store them. */
export async function runIngest(db: DB, source: LiveSource, now = new Date()) {
  const open = await db.select({
    roomId: liveSessions.externalRoomId, creatorUniqueId: creators.uniqueId, startedAt: liveSessions.startedAt,
    title: liveSessions.title,
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

/** LIVE_SOURCE: "mock" (fake data via the ingest cron), "tiktok" (real data via /api/cron/live), or "none". */
export const liveSources = () => new Set((process.env.LIVE_SOURCE ?? "mock").split(",").map((s) => s.trim()).filter(Boolean));

/** The pull-based source for /api/cron/ingest, or null if mock data is switched off. */
export function sourceFromEnv(): LiveSource | null {
  return liveSources().has("mock") ? new MockSource() : null;
}

/** Removes everything generated by MockSource (rooms named "mock-…"), e.g. after switching to real data. */
export async function purgeMockData(db: DB): Promise<number> {
  const rows = allRowsOf<{ id: number }>(await db.execute(sql`select id from live_sessions where external_room_id like 'mock-%' limit 5000`));
  if (!rows.length) return 0;
  const ids = sql.join(rows.map((r) => sql`${r.id}`), sql`, `);
  await db.execute(sql`delete from poll_voters where poll_id in (select id from polls where session_id in (${ids}))`);
  await db.execute(sql`delete from poll_vote_buckets where poll_id in (select id from polls where session_id in (${ids}))`);
  await db.execute(sql`delete from polls where session_id in (${ids})`);
  await db.execute(sql`delete from session_mentions where session_id in (${ids})`);
  await db.execute(sql`delete from session_minute_stats where session_id in (${ids})`);
  await db.execute(sql`delete from chat_messages where session_id in (${ids})`);
  await db.execute(sql`delete from gift_events where session_id in (${ids})`);
  await db.execute(sql`delete from live_sessions where id in (${ids})`);
  // Orphans: mock gifters, and mock creators that never verified or got a key.
  await db.execute(sql`delete from gifters g where not exists (select 1 from gift_events e where e.gifter_id = g.id)`);
  await db.execute(sql`delete from session_mentions m where exists (select 1 from creators c where c.id = m.mentioned_creator_id
    and c.verified_at is null and not exists (select 1 from live_sessions s where s.creator_id = c.id)
    and not exists (select 1 from api_keys k where k.creator_id = c.id))`);
  await db.execute(sql`delete from creators c where c.verified_at is null
    and not exists (select 1 from live_sessions s where s.creator_id = c.id)
    and not exists (select 1 from api_keys k where k.creator_id = c.id)
    and not exists (select 1 from session_mentions m where m.mentioned_creator_id = c.id)`);
  return rows.length;
}

function allRowsOf<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}

function* chunks<T>(arr: T[], size = CHUNK): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// postgres-js returns an array, PGlite returns { rows }.
function rowCount(res: unknown): number {
  if (Array.isArray(res)) return res.length;
  return (res as { rows?: unknown[] }).rows?.length ?? 0;
}
