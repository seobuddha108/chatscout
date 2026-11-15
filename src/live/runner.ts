import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { allRows } from "@/db/rows";
import { ingestEvents } from "@/ingest/ingest";
import type { Category } from "@/ingest/types";
import { watchLive, type ConnectionFactory, type WatchResult } from "./tiktok";

export interface RunOptions {
  /** How long this invocation may watch (keep below the function's maxDuration). */
  windowMs?: number;
  /** A creator is taken over this long before the current watcher's lease ends (overlap, de-duplicated). */
  handoverMs?: number;
  /** Offline creators are re-checked at most this often. */
  checkEveryMs?: number;
  maxCreators?: number;
  factory?: ConnectionFactory;
  now?: Date;
}

/**
 * One cron tick: lease every opted-in creator that nobody is (or soon will stop) watching,
 * connect to those that are live and stream their events into the database until the window ends.
 * Watched: the own streams of verified creators with an active package, and creators followed by
 * an account with an active package (unless they opted out). See src/live/policy.ts for what is stored.
 */
export async function runLiveWindow(db: DB, o: RunOptions = {}) {
  const now = o.now ?? new Date();
  const windowMs = o.windowMs ?? 270_000;
  const handoverMs = o.handoverMs ?? 75_000;
  const checkEveryMs = o.checkEveryMs ?? 120_000;
  const owner = randomBytes(6).toString("hex");
  const leaseUntil = new Date(now.getTime() + windowMs);
  const takeoverBefore = new Date(now.getTime() + handoverMs);
  const recheckAfter = new Date(now.getTime() - checkEveryMs);

  // Lease candidates atomically (concurrent invocations can't grab the same creator).
  const leased = allRows<{ id: number; unique_id: string; nickname: string; country: string | null; category: string }>(await db.execute(sql`
    with candidates as (
      select c.id from creators c
      left join live_watch w on w.creator_id = c.id
      where (
          -- own streams: verified creator with an active package
          (c.verified_at is not null and exists (select 1 from api_keys k where k.creator_id = c.id
            and k.revoked_at is null and k.expires_at > ${now.toISOString()}::timestamptz))
          -- followed streams: followed by an account with an active package, unless opted out
          or (not c.no_tracking and exists (select 1 from follows f join api_keys k on k.creator_id = f.follower_id
            and k.revoked_at is null and k.expires_at > ${now.toISOString()}::timestamptz where f.creator_id = c.id))
        )
        and (w.creator_id is null
          or (w.lease_until is not null and w.lease_until < ${takeoverBefore.toISOString()}::timestamptz)
          or (w.lease_until is null and (w.last_checked_at is null or w.last_checked_at < ${recheckAfter.toISOString()}::timestamptz)))
      group by c.id
      order by c.id
      limit ${o.maxCreators ?? 25}
    ), upserted as (
      insert into live_watch (creator_id, lease_owner, lease_until, last_checked_at)
      select id, ${owner}, ${leaseUntil.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz from candidates
      on conflict (creator_id) do update set lease_owner = excluded.lease_owner, lease_until = excluded.lease_until,
        last_checked_at = excluded.last_checked_at
      where live_watch.lease_until is null or live_watch.lease_until < ${takeoverBefore.toISOString()}::timestamptz
        or live_watch.lease_owner = excluded.lease_owner
      returning creator_id
    )
    select c.id, c.unique_id, c.nickname, c.country, c.category from creators c join upserted u on u.creator_id = c.id`));

  const results = await Promise.all(leased.map(async (c): Promise<{ creator: string } & WatchResult> => {
    const res = await watchLive({
      creator: { uniqueId: c.unique_id, nickname: c.nickname, country: c.country ?? undefined, category: c.category as Category },
      deadline: leaseUntil,
      factory: o.factory,
      flush: (events) => ingestEvents(db, events),
      onLive: () => db.execute(sql`update live_watch set last_live_at = now(), last_error = null where creator_id = ${c.id}`),
    });
    if (res.status !== "deadline") {
      // Offline, ended, dropped or failed: release so the next tick re-checks (offline ones after checkEveryMs).
      await db.execute(sql`update live_watch set lease_until = null, lease_owner = null,
        last_error = ${res.status === "error" ? res.error.slice(0, 500) : null}
        where creator_id = ${c.id} and lease_owner = ${owner}`);
    }
    return { creator: c.unique_id, ...res };
  }));

  return { owner, watched: results.length, results };
}
