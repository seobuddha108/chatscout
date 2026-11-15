import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { allRows } from "@/db/rows";

/**
 * How a stream's viewer data may be stored:
 * - "named": the creator's own streams (verified + active key): chat and votes with usernames.
 * - "pseudonymous": streams of creators followed by an account with an active package, unless the
 *   creator opted out. Viewer identities are replaced by per-stream pseudonyms, so nobody can be
 *   followed across streams.
 */
export type RecordingMode = "named" | "pseudonymous";

export async function recordingModes(db: DB, creatorIds: number[], now = new Date()): Promise<Map<number, RecordingMode>> {
  const out = new Map<number, RecordingMode>();
  if (!creatorIds.length) return out;
  const ids = sql.join(creatorIds.map((i) => sql`${i}`), sql`, `);
  const ts = now.toISOString();
  const rows = allRows<{ id: number; named: boolean; followed: boolean }>(await db.execute(sql`
    select c.id,
      (c.verified_at is not null and exists (select 1 from api_keys k where k.creator_id = c.id
        and k.revoked_at is null and k.expires_at > ${ts}::timestamptz)) as named,
      (not c.no_tracking and exists (select 1 from follows f
        join api_keys k on k.creator_id = f.follower_id and k.revoked_at is null and k.expires_at > ${ts}::timestamptz
        where f.creator_id = c.id)) as followed
    from creators c where c.id in (${ids})`));
  for (const r of rows) {
    if (r.named) out.set(r.id, "named");
    else if (r.followed) out.set(r.id, "pseudonymous");
  }
  return out;
}

const secret = () => process.env.PSEUDONYM_SECRET || process.env.CRON_SECRET || "dev-pseudonym-secret";

/** Stable within one stream, unlinkable across streams. */
export function pseudonym(sessionId: number, uniqueId: string): string {
  return createHmac("sha256", secret()).update(`${sessionId}:${uniqueId.toLowerCase()}`).digest("hex").slice(0, 10);
}
