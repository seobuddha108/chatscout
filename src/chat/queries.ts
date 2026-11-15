import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { chatMessages, liveSessions, pollVoters, polls } from "@/db/schema";

export interface ChatSearchParams {
  creatorId: number;
  q?: string; // words, all must appear; prefix match ("give" finds "giveaway"); "-word" excludes
  user?: string; // chatter uniqueId (case-insensitive, leading @ optional)
  session?: string; // roomId
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * Turns user input into a safe tsquery: words are reduced to letters/digits/_/.,
 * joined with AND, prefix-matched; "-word" becomes NOT. Returns null if nothing usable.
 */
export function toTsQuery(input: string): string | null {
  const parts: string[] = [];
  for (const raw of input.trim().split(/\s+/)) {
    const neg = raw.startsWith("-");
    const word = raw.replace(/^[-@#]+/, "").toLowerCase().replace(/[^\p{L}\p{N}_.]/gu, "");
    if (!word) continue;
    parts.push(`${neg ? "!" : ""}${word}:*`);
  }
  if (!parts.some((p) => !p.startsWith("!"))) return null; // need at least one positive term
  return parts.join(" & ");
}

export async function searchChat(db: DB, p: ChatSearchParams) {
  const where: (SQL | undefined)[] = [eq(chatMessages.creatorId, p.creatorId)];
  const tsq = p.q ? toTsQuery(p.q) : null;
  if (p.q && !tsq) return { items: [], hasMore: false };
  if (tsq) where.push(sql`${chatMessages.tsv} @@ to_tsquery('simple', ${tsq})`);
  if (p.user) where.push(eq(chatMessages.chatterUniqueId, normalizeUser(p.user)));
  if (p.from) where.push(gte(chatMessages.createdAt, p.from));
  if (p.to) where.push(lt(chatMessages.createdAt, p.to));
  if (p.session) where.push(eq(liveSessions.externalRoomId, p.session));

  const rows = await db.select({
    id: chatMessages.id,
    at: chatMessages.createdAt,
    user: chatMessages.chatterUniqueId,
    nickname: chatMessages.chatterNickname,
    text: chatMessages.text,
    roomId: liveSessions.externalRoomId,
    sessionStartedAt: liveSessions.startedAt,
  }).from(chatMessages)
    .innerJoin(liveSessions, eq(liveSessions.id, chatMessages.sessionId))
    .where(and(...where))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(p.limit + 1).offset(p.offset);

  return { items: rows.slice(0, p.limit), hasMore: rows.length > p.limit };
}

/** Most active chatters in the creator's own streams, optionally filtered by name prefix. */
export async function topChatters(db: DB, p: { creatorId: number; from: Date; to: Date; prefix?: string; limit: number; offset: number }) {
  const where: (SQL | undefined)[] = [
    eq(chatMessages.creatorId, p.creatorId), gte(chatMessages.createdAt, p.from), lt(chatMessages.createdAt, p.to),
  ];
  if (p.prefix) where.push(sql`${chatMessages.chatterUniqueId} like ${escapeLike(normalizeUser(p.prefix)) + "%"}`);
  const rows = await db.select({
    user: chatMessages.chatterUniqueId,
    nickname: sql<string>`max(${chatMessages.chatterNickname})`,
    messages: sql<string>`count(*)`,
    sessions: sql<string>`count(distinct ${chatMessages.sessionId})`,
    firstSeen: sql<string>`min(${chatMessages.createdAt})`,
    lastSeen: sql<string>`max(${chatMessages.createdAt})`,
  }).from(chatMessages).where(and(...where))
    .groupBy(chatMessages.chatterUniqueId)
    .orderBy(desc(sql`count(*)`), chatMessages.chatterUniqueId)
    .limit(p.limit + 1).offset(p.offset);
  return {
    items: rows.slice(0, p.limit).map((r) => ({
      ...r, messages: Number(r.messages), sessions: Number(r.sessions),
      firstSeen: new Date(r.firstSeen), lastSeen: new Date(r.lastSeen),
    })),
    hasMore: rows.length > p.limit,
  };
}

/** GDPR erasure: removes all stored messages of one chatter from the creator's data. */
export async function deleteChatterMessages(db: DB, creatorId: number, user: string) {
  const u = normalizeUser(user);
  const rows = await db.delete(chatMessages)
    .where(and(eq(chatMessages.creatorId, creatorId), eq(chatMessages.chatterUniqueId, u)))
    .returning({ id: chatMessages.id });
  // Also erase their named poll votes in this creator's streams.
  const votes = await db.delete(pollVoters).where(and(
    eq(pollVoters.voterUniqueId, u),
    sql`${pollVoters.pollId} in (select ${polls.id} from ${polls} where ${polls.creatorId} = ${creatorId})`,
  )).returning({ id: pollVoters.pollId });
  return rows.length + votes.length;
}

const normalizeUser = (u: string) => u.trim().replace(/^@/, "").toLowerCase();
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
