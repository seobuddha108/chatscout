import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { apiKeys, apiUsage, creators } from "@/db/schema";
import { PLANS, type Plan } from "./plans";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Creates a key; the raw key is returned once and only its hash is stored. */
export async function createApiKey(db: DB, opts: { name: string; plan: Plan; creator?: string; days?: number; now?: Date }) {
  const key = `cs_${randomBytes(24).toString("base64url")}`;
  let creatorId: number | null = null;
  if (opts.creator) {
    // The creator may not have been seen live yet; create a stub that ingest fills in later.
    const uniqueId = opts.creator.replace(/^@/, "").toLowerCase();
    await db.insert(creators).values({ uniqueId, nickname: uniqueId }).onConflictDoNothing();
    const [c] = await db.select({ id: creators.id }).from(creators).where(eq(creators.uniqueId, uniqueId));
    creatorId = c.id;
  }
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (opts.days ?? 7) * 86_400_000);
  const [row] = await db.insert(apiKeys).values({
    name: opts.name, plan: opts.plan, creatorId, prefix: key.slice(0, 10), keyHash: hashKey(key), expiresAt,
  }).returning({ id: apiKeys.id });
  return { id: row.id, key, plan: opts.plan, creator: opts.creator ?? null, expiresAt };
}

export type AuthResult =
  | { ok: true; keyId: number; plan: Plan; creatorId: number | null; limit: number; remaining: number; expiresAt: Date }
  | { ok: false; status: 401 | 403 | 429; error: string; limit?: number };

/** Validates a raw key and counts one request against today's quota (UTC). */
export async function authenticate(db: DB, rawKey: string | null, now = new Date()): Promise<AuthResult> {
  if (!rawKey) return { ok: false, status: 401, error: "Missing API key. Send 'Authorization: Bearer <key>' or 'x-api-key'." };
  const [key] = await db.select({
    id: apiKeys.id, plan: apiKeys.plan, expiresAt: apiKeys.expiresAt,
    // Chat access only counts once the bound creator has verified via TikTok Login.
    creatorId: sql<number | null>`case when ${creators.verifiedAt} is not null then ${creators.id} end`,
  }).from(apiKeys).leftJoin(creators, eq(creators.id, apiKeys.creatorId))
    .where(and(eq(apiKeys.keyHash, hashKey(rawKey)), isNull(apiKeys.revokedAt))).limit(1);
  if (!key) return { ok: false, status: 401, error: "Invalid API key." };
  if (key.expiresAt <= now) return { ok: false, status: 403, error: "API key expired. Buy a new package." };

  const plan = key.plan as Plan;
  const limit = PLANS[plan]?.dailyRequests ?? 0;
  const day = now.toISOString().slice(0, 10);
  const [usage] = await db.insert(apiUsage).values({ keyId: key.id, day, count: 1 })
    .onConflictDoUpdate({ target: [apiUsage.keyId, apiUsage.day], set: { count: sql`${apiUsage.count} + 1` } })
    .returning({ count: apiUsage.count });
  if (usage.count > limit) return { ok: false, status: 429, error: "Daily request limit reached.", limit };
  return { ok: true, keyId: key.id, plan, creatorId: key.creatorId, limit, remaining: limit - usage.count, expiresAt: key.expiresAt };
}

export async function revokeApiKey(db: DB, id: number) {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
}
