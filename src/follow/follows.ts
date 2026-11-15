import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { allRows } from "@/db/rows";
import { creators, follows } from "@/db/schema";
import { PLANS, type Plan } from "@/api/plans";

const RANK: Plan[] = ["trial", "basic", "pro", "business"];
export const normalizeHandle = (u: string) => u.trim().replace(/^@/, "").toLowerCase();
export const isHandle = (u: string) => /^[\w.]{2,24}$/.test(u);

/** The best plan among the account's active keys, or null without an active package. */
export async function activePlan(db: DB, accountId: number, now = new Date()): Promise<Plan | null> {
  const rows = allRows<{ plan: string }>(await db.execute(sql`select plan from api_keys
    where creator_id = ${accountId} and revoked_at is null and expires_at > ${now.toISOString()}::timestamptz`));
  const plans = rows.map((r) => r.plan as Plan).filter((p) => p in PLANS);
  return plans.length ? plans.sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0] : null;
}

export type FollowResult = { ok: true; uniqueId: string } | { ok: false; error: string };

export async function followCreator(db: DB, accountId: number, raw: string): Promise<FollowResult> {
  const uniqueId = normalizeHandle(raw);
  if (!isHandle(uniqueId)) return { ok: false, error: "Ungültiger TikTok-Name." };
  const plan = await activePlan(db, accountId);
  if (!plan) return { ok: false, error: "Du brauchst ein aktives Paket (z. B. den Testschlüssel), um Creatorn zu folgen." };
  const [{ n, already }] = allRows<{ n: number; already: boolean }>(await db.execute(sql`select count(*)::int as n,
    bool_or(c.unique_id = ${uniqueId}) as already
    from follows f join creators c on c.id = f.creator_id where f.follower_id = ${accountId}`));
  if (already) return { ok: true, uniqueId };
  if (n >= PLANS[plan].followLimit) return { ok: false, error: `Dein Paket erlaubt ${PLANS[plan].followLimit} verfolgte Creator.` };

  await db.insert(creators).values({ uniqueId, nickname: uniqueId }).onConflictDoNothing();
  const [c] = await db.select({ id: creators.id, noTracking: creators.noTracking }).from(creators).where(eq(creators.uniqueId, uniqueId));
  if (c.noTracking) return { ok: false, error: `@${uniqueId} hat Aufzeichnungen durch andere deaktiviert.` };
  await db.insert(follows).values({ followerId: accountId, creatorId: c.id }).onConflictDoNothing();
  return { ok: true, uniqueId };
}

export async function unfollowCreator(db: DB, accountId: number, creatorId: number) {
  await db.delete(follows).where(and(eq(follows.followerId, accountId), eq(follows.creatorId, creatorId)));
}

export async function listFollows(db: DB, accountId: number) {
  const rows = allRows<{ id: number; unique_id: string; nickname: string; no_tracking: boolean; live: boolean; last_started: string | null; sessions: number }>(
    await db.execute(sql`select c.id, c.unique_id, c.nickname, c.no_tracking,
        exists (select 1 from live_sessions s where s.creator_id = c.id and s.ended_at is null) as live,
        (select max(started_at) from live_sessions s where s.creator_id = c.id) as last_started,
        (select count(*)::int from live_sessions s where s.creator_id = c.id) as sessions
      from follows f join creators c on c.id = f.creator_id
      where f.follower_id = ${accountId} order by c.unique_id`));
  return rows.map((r) => ({
    creatorId: r.id, uniqueId: r.unique_id, nickname: r.nickname, noTracking: r.no_tracking, isLive: r.live,
    lastStartedAt: r.last_started ? new Date(r.last_started) : null, sessions: Number(r.sessions),
  }));
}

/** An account may view a creator's recorded data if it is that creator or follows them. */
export async function canView(db: DB, accountId: number, creatorId: number): Promise<boolean> {
  if (accountId === creatorId) return true;
  const [row] = await db.select({ x: follows.creatorId }).from(follows)
    .where(and(eq(follows.followerId, accountId), eq(follows.creatorId, creatorId))).limit(1);
  return Boolean(row);
}

/** Opt-out: stops recording by followers, removes their follows and the pseudonymous chat recorded for them. */
export async function setNoTracking(db: DB, creatorId: number, value: boolean) {
  await db.update(creators).set({ noTracking: value }).where(eq(creators.id, creatorId));
  if (value) {
    await db.delete(follows).where(eq(follows.creatorId, creatorId));
    await db.execute(sql`delete from chat_messages where creator_id = ${creatorId} and chatter_unique_id like 'anon-%'`);
  }
}
