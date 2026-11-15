import { and, desc, eq, gte, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { creators, giftEvents, gifters, liveSessions } from "@/db/schema";
import { leagueFor, leagueRange, type League } from "./leagues";
import { periodWindow, type Period } from "./periods";

export interface RankingParams {
  period: Period;
  at?: Date;
  country?: string;
  category?: "general" | "gaming";
  league?: League;
  limit: number;
  offset: number;
}

const diamondsSum = sql<string>`sum(${giftEvents.diamonds})::bigint`;
const inWindow = (from: Date, to: Date) => and(gte(giftEvents.createdAt, from), lt(giftEvents.createdAt, to));

export async function creatorRanking(db: DB, p: RankingParams) {
  const { from, to } = periodWindow(p.period, p.at);
  const where: (SQL | undefined)[] = [inWindow(from, to)];
  if (p.country) where.push(eq(creators.country, p.country));
  if (p.category) where.push(eq(creators.category, p.category));
  let having: SQL | undefined;
  if (p.league) {
    const r = leagueRange(p.league, p.period);
    having = r.max === null ? sql`${diamondsSum} >= ${r.min}` : sql`${diamondsSum} >= ${r.min} and ${diamondsSum} < ${r.max}`;
  }

  const rows = await db.select({
    uniqueId: creators.uniqueId, nickname: creators.nickname, country: creators.country,
    category: creators.category, avatarUrl: creators.avatarUrl,
    diamonds: diamondsSum,
    gifts: sql<string>`count(*)`,
    uniqueGifters: sql<string>`count(distinct ${giftEvents.gifterId})`,
  }).from(giftEvents)
    .innerJoin(creators, eq(creators.id, giftEvents.creatorId))
    .where(and(...where))
    .groupBy(creators.id)
    .having(having)
    .orderBy(desc(diamondsSum), creators.uniqueId)
    .limit(p.limit + 1).offset(p.offset);

  const items = rows.slice(0, p.limit).map((r, i) => {
    const diamonds = Number(r.diamonds);
    return {
      rank: p.offset + i + 1, ...r, diamonds, gifts: Number(r.gifts), uniqueGifters: Number(r.uniqueGifters),
      ...leagueFor(diamonds, p.period),
    };
  });
  return { period: p.period, from, to, items, hasMore: rows.length > p.limit };
}

export async function gifterRanking(db: DB, p: Omit<RankingParams, "category" | "league"> & { creator?: string }) {
  const { from, to } = periodWindow(p.period, p.at);
  const where: (SQL | undefined)[] = [inWindow(from, to)];
  if (p.country) where.push(eq(gifters.country, p.country));
  if (p.creator) {
    where.push(sql`${giftEvents.creatorId} = (select cr.id from ${creators} cr where cr.unique_id = ${p.creator})`);
  }
  const rows = await db.select({
    uniqueId: gifters.uniqueId, nickname: gifters.nickname, country: gifters.country,
    diamonds: diamondsSum,
    gifts: sql<string>`count(*)`,
    creatorsSupported: sql<string>`count(distinct ${giftEvents.creatorId})`,
  }).from(giftEvents)
    .innerJoin(gifters, eq(gifters.id, giftEvents.gifterId))
    .where(and(...where))
    .groupBy(gifters.id)
    .orderBy(desc(diamondsSum), gifters.uniqueId)
    .limit(p.limit + 1).offset(p.offset);

  const items = rows.slice(0, p.limit).map((r, i) => ({
    rank: p.offset + i + 1, ...r,
    diamonds: Number(r.diamonds), gifts: Number(r.gifts), creatorsSupported: Number(r.creatorsSupported),
  }));
  return { period: p.period, from, to, items, hasMore: rows.length > p.limit };
}

export async function creatorProfile(db: DB, uniqueId: string, at = new Date()) {
  const [c] = await db.select().from(creators).where(eq(creators.uniqueId, uniqueId)).limit(1);
  if (!c) return null;

  const totals = {} as Record<Period, { diamonds: number; rankInCountry: number | null; league: string }>;
  for (const period of ["day", "week", "month"] as const) {
    const { from, to } = periodWindow(period, at);
    const [mine] = await db.select({ d: diamondsSum }).from(giftEvents)
      .where(and(eq(giftEvents.creatorId, c.id), inWindow(from, to)));
    const diamonds = Number(mine?.d ?? 0);
    let rankInCountry: number | null = null;
    if (diamonds > 0) {
      const res = await db.execute(sql`select count(*)::int as ahead from (
          select g.creator_id from ${giftEvents} g join ${creators} c on c.id = g.creator_id
          where c.country = ${c.country} and g.created_at >= ${from.toISOString()}::timestamptz
            and g.created_at < ${to.toISOString()}::timestamptz
          group by g.creator_id having sum(g.diamonds) > ${diamonds}) t`);
      rankInCountry = Number(firstRow<{ ahead: number }>(res)?.ahead ?? 0) + 1;
    }
    totals[period] = { diamonds, rankInCountry, league: leagueFor(diamonds, period).league };
  }

  // Aliased explicitly: drizzle leaves columns unqualified in single-table selects,
  // so a bare "id" here would bind to the subquery's table.
  const sessionDiamonds = sql<string>`coalesce((select sum(ge.diamonds) from ${giftEvents} ge
    where ge.session_id = ${liveSessions}.id), 0)::bigint`;
  const sessions = await db.select({
    roomId: liveSessions.externalRoomId, title: liveSessions.title, startedAt: liveSessions.startedAt,
    endedAt: liveSessions.endedAt, peakViewers: liveSessions.peakViewers, diamonds: sessionDiamonds,
  }).from(liveSessions).where(eq(liveSessions.creatorId, c.id))
    .orderBy(desc(liveSessions.startedAt)).limit(10);

  const [live] = await db.select({ id: liveSessions.id }).from(liveSessions)
    .where(and(eq(liveSessions.creatorId, c.id), isNull(liveSessions.endedAt))).limit(1);

  const topGifters = await gifterRanking(db, { period: "week", at, creator: uniqueId, limit: 10, offset: 0 });

  return {
    uniqueId: c.uniqueId, nickname: c.nickname, country: c.country, category: c.category, avatarUrl: c.avatarUrl,
    isLive: Boolean(live),
    totals,
    recentSessions: sessions.map((s) => ({ ...s, diamonds: Number(s.diamonds) })),
    topGiftersThisWeek: topGifters.items,
  };
}

export async function countryOverview(db: DB, period: Period, at = new Date()) {
  const { from, to } = periodWindow(period, at);
  const res = await db.execute(sql`
    select c.country,
      count(*)::int as creators,
      coalesce(sum(cd.d), 0)::bigint as diamonds,
      count(*) filter (where exists (
        select 1 from ${liveSessions} s where s.creator_id = c.id and s.ended_at is null))::int as live_now
    from ${creators} c
    left join (
      select creator_id, sum(diamonds) as d from ${giftEvents}
      where created_at >= ${from.toISOString()}::timestamptz and created_at < ${to.toISOString()}::timestamptz
      group by creator_id) cd on cd.creator_id = c.id
    group by c.country order by diamonds desc`);
  return {
    period, from, to,
    items: allRows<{ country: string; creators: number; diamonds: string; live_now: number }>(res).map((r) => ({
      country: r.country, creators: Number(r.creators), diamonds: Number(r.diamonds), liveNow: Number(r.live_now),
    })),
  };
}

// db.execute returns an array (postgres-js) or { rows } (PGlite).
function allRows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}
function firstRow<T>(res: unknown): T | undefined { return allRows<T>(res)[0]; }
