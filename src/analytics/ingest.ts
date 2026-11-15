import { inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { creators, pollVoteBuckets, pollVoters, polls, sessionMentions, sessionMinuteStats } from "@/db/schema";
import type { LiveEvent } from "@/ingest/types";
import { mentions, minuteOf, sentiment } from "./text";

type Room = { id: number; creatorId: number };
const CHUNK = 1000;

export interface AnalyticsResult { polls: number; pollVotes: number; namedVotes: number; mentionLinks: number }

/**
 * Derives aggregate analytics from a batch. Stores counts only. Named poll votes are
 * kept solely for streams of opted-in (verified, active key) creators.
 */
export async function ingestAnalytics(
  db: DB, events: LiveEvent[], rooms: Map<string, Room>, optedIn: () => Promise<Set<number>>,
): Promise<AnalyticsResult> {
  // --- chat minute stats + mentions -------------------------------------------------
  const minutes = new Map<string, { sessionId: number; minute: Date; messages: number; positive: number; negative: number }>();
  type M = { sessionId: number; ownerId: number; handle: string; mentions: number; positive: number; negative: number; inTitle: boolean; firstAt: Date; lastAt: Date };
  const ment = new Map<string, M>();
  const addMention = (room: Room, handle: string, at: Date, s: number, inTitle: boolean) => {
    const k = `${room.id}|${handle}`;
    const m = ment.get(k) ?? { sessionId: room.id, ownerId: room.creatorId, handle, mentions: 0, positive: 0, negative: 0, inTitle: false, firstAt: at, lastAt: at };
    if (!inTitle) { m.mentions++; if (s > 0) m.positive++; if (s < 0) m.negative++; }
    m.inTitle ||= inTitle;
    if (at < m.firstAt) m.firstAt = at;
    if (at > m.lastAt) m.lastAt = at;
    ment.set(k, m);
  };

  const pollStarts: Extract<LiveEvent, { type: "poll_start" }>[] = [];
  const votes: Extract<LiveEvent, { type: "poll_vote" }>[] = [];
  const pollEnds = new Map<string, Date>();
  const tallies: Extract<LiveEvent, { type: "poll_tally" }>[] = [];

  for (const e of events) {
    const room = rooms.get(e.roomId);
    if (!room) continue;
    if (e.type === "chat") {
      const s = sentiment(e.text);
      const minute = minuteOf(e.at);
      const k = `${room.id}|${minute.getTime()}`;
      const r = minutes.get(k) ?? { sessionId: room.id, minute, messages: 0, positive: 0, negative: 0 };
      r.messages++; if (s > 0) r.positive++; if (s < 0) r.negative++;
      minutes.set(k, r);
      for (const h of mentions(e.text)) addMention(room, h, e.at, s, false);
    } else if (e.type === "live_start" && e.title) {
      for (const h of mentions(e.title)) addMention(room, h, e.at, 0, true);
    } else if (e.type === "poll_start") pollStarts.push(e);
    else if (e.type === "poll_vote") votes.push(e);
    else if (e.type === "poll_end") pollEnds.set(e.pollId, e.at);
    else if (e.type === "poll_tally") { tallies.push(e); if (e.ended) pollEnds.set(e.pollId, e.at); }
  }

  for (const batch of chunks([...minutes.values()])) {
    await db.insert(sessionMinuteStats).values(batch).onConflictDoUpdate({
      target: [sessionMinuteStats.sessionId, sessionMinuteStats.minute],
      set: {
        messages: sql`${sessionMinuteStats.messages} + excluded.messages`,
        positive: sql`${sessionMinuteStats.positive} + excluded.positive`,
        negative: sql`${sessionMinuteStats.negative} + excluded.negative`,
      },
    });
  }

  // Resolve @handles to known creators; ignore unknown handles and self-mentions.
  const handleIds = new Map<string, number>();
  for (const batch of chunks([...new Set([...ment.values()].map((m) => m.handle))])) {
    const rows = await db.select({ id: creators.id, u: creators.uniqueId }).from(creators).where(inArray(creators.uniqueId, batch));
    for (const r of rows) handleIds.set(r.u, r.id);
  }
  const mentionRows = [...ment.values()].flatMap((m) => {
    const id = handleIds.get(m.handle);
    if (!id || id === m.ownerId) return [];
    return [{ sessionId: m.sessionId, mentionedCreatorId: id, mentions: m.mentions, positive: m.positive, negative: m.negative, inTitle: m.inTitle, firstAt: m.firstAt, lastAt: m.lastAt }];
  });
  for (const batch of chunks(mentionRows)) {
    await db.insert(sessionMentions).values(batch).onConflictDoUpdate({
      target: [sessionMentions.sessionId, sessionMentions.mentionedCreatorId],
      set: {
        mentions: sql`${sessionMentions.mentions} + excluded.mentions`,
        positive: sql`${sessionMentions.positive} + excluded.positive`,
        negative: sql`${sessionMentions.negative} + excluded.negative`,
        inTitle: sql`${sessionMentions.inTitle} or excluded.in_title`,
        firstAt: sql`least(${sessionMentions.firstAt}, excluded.first_at)`,
        lastAt: sql`greatest(${sessionMentions.lastAt}, excluded.last_at)`,
      },
    });
  }

  // --- polls ------------------------------------------------------------------------
  let pollsCreated = 0;
  const newPolls = dedupe([
    ...pollStarts.map((p) => ({ ...p })),
    // A tally can arrive without a start event (e.g. watcher joined mid-poll).
    ...tallies.map((t) => ({ roomId: t.roomId, pollId: t.pollId, question: t.question ?? "Poll", options: t.options.map(({ id, text }) => ({ id, text })), at: t.at })),
  ], (p) => p.pollId).flatMap((p) => {
    const room = rooms.get(p.roomId);
    if (!room) return [];
    return [{ externalPollId: p.pollId, sessionId: room.id, creatorId: room.creatorId, question: p.question, options: p.options, startedAt: p.at }];
  });
  for (const batch of chunks(newPolls)) {
    pollsCreated += (await db.insert(polls).values(batch).onConflictDoNothing({ target: polls.externalPollId }).returning({ id: polls.id })).length;
  }

  const pollIds = [...new Set([...votes.map((v) => v.pollId), ...pollEnds.keys(), ...tallies.map((t) => t.pollId)])];
  const pollMap = new Map<string, { id: number; creatorId: number; options: Set<string> }>();
  for (const batch of chunks(pollIds)) {
    const rows = await db.select({ id: polls.id, ext: polls.externalPollId, creatorId: polls.creatorId, options: polls.options })
      .from(polls).where(inArray(polls.externalPollId, batch));
    for (const r of rows) pollMap.set(r.ext, { id: r.id, creatorId: r.creatorId, options: new Set(r.options.map((o) => o.id)) });
  }

  const buckets = new Map<string, { pollId: number; optionId: string; minute: Date; votes: number }>();
  const named: { pollId: number; voterUniqueId: string; voterNickname: string; optionId: string; votedAt: Date }[] = [];
  const opted = votes.length ? await optedIn() : new Set<number>();
  let pollVotes = 0;
  for (const v of votes) {
    const p = pollMap.get(v.pollId);
    if (!p || !p.options.has(v.optionId)) continue;
    pollVotes++;
    const minute = minuteOf(v.at);
    const k = `${p.id}|${v.optionId}|${minute.getTime()}`;
    const b = buckets.get(k) ?? { pollId: p.id, optionId: v.optionId, minute, votes: 0 };
    b.votes++;
    buckets.set(k, b);
    if (opted.has(p.creatorId)) {
      named.push({ pollId: p.id, voterUniqueId: v.user.uniqueId.toLowerCase(), voterNickname: v.user.nickname, optionId: v.optionId, votedAt: v.at });
    }
  }
  // Tallies: turn absolute totals into per-minute increments against what is already stored.
  if (tallies.length) {
    const tallyPolls = [...new Set(tallies.map((t) => pollMap.get(t.pollId)?.id).filter((x): x is number => x !== undefined))];
    const stored = new Map<string, number>(); // "pollId|optionId" -> votes already counted
    if (tallyPolls.length) {
      const rows = await db.select({ pollId: pollVoteBuckets.pollId, optionId: pollVoteBuckets.optionId, votes: sql<string>`sum(${pollVoteBuckets.votes})` })
        .from(pollVoteBuckets).where(inArray(pollVoteBuckets.pollId, tallyPolls))
        .groupBy(pollVoteBuckets.pollId, pollVoteBuckets.optionId);
      for (const r of rows) stored.set(`${r.pollId}|${r.optionId}`, Number(r.votes));
    }
    for (const b of buckets.values()) stored.set(`${b.pollId}|${b.optionId}`, (stored.get(`${b.pollId}|${b.optionId}`) ?? 0) + b.votes);
    for (const t of [...tallies].sort((a, b) => a.at.getTime() - b.at.getTime())) {
      const p = pollMap.get(t.pollId);
      if (!p) continue;
      const minute = minuteOf(t.at);
      for (const o of t.options) {
        if (!p.options.has(o.id)) continue;
        const k = `${p.id}|${o.id}`;
        const delta = o.votes - (stored.get(k) ?? 0);
        if (delta <= 0) continue;
        stored.set(k, o.votes);
        pollVotes += delta;
        const bk = `${p.id}|${o.id}|${minute.getTime()}`;
        const b = buckets.get(bk) ?? { pollId: p.id, optionId: o.id, minute, votes: 0 };
        b.votes += delta;
        buckets.set(bk, b);
      }
      if (t.voters?.length && (await optedIn()).has(p.creatorId)) {
        for (const v of t.voters) {
          if (!p.options.has(v.optionId)) continue;
          named.push({ pollId: p.id, voterUniqueId: v.userId, voterNickname: v.nickname, optionId: v.optionId, votedAt: t.at });
        }
      }
    }
  }

  for (const batch of chunks([...buckets.values()])) {
    await db.insert(pollVoteBuckets).values(batch).onConflictDoUpdate({
      target: [pollVoteBuckets.pollId, pollVoteBuckets.optionId, pollVoteBuckets.minute],
      set: { votes: sql`${pollVoteBuckets.votes} + excluded.votes` },
    });
  }
  let namedVotes = 0;
  for (const batch of chunks(dedupe(named, (n) => `${n.pollId}|${n.voterUniqueId}`))) {
    namedVotes += (await db.insert(pollVoters).values(batch).onConflictDoNothing().returning({ id: pollVoters.pollId })).length;
  }

  for (const batch of chunks([...pollEnds].filter(([id]) => pollMap.has(id)))) {
    const values = sql.join(batch.map(([id, at]) => sql`(${id}, ${at.toISOString()}::timestamptz)`), sql`, `);
    await db.execute(sql`update polls p set ended_at = v.at from (values ${values}) as v(ext, at)
      where p.external_poll_id = v.ext and p.ended_at is null`);
  }

  return { polls: pollsCreated, pollVotes, namedVotes, mentionLinks: mentionRows.length };
}

function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of arr) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()];
}
function* chunks<T>(arr: T[], size = CHUNK): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
