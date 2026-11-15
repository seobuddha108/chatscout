import { and, eq, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { creators } from "@/db/schema";
import type { TikTokUser } from "./tiktok";

/**
 * Binds a verified TikTok identity to a creator row and returns its id.
 * open_id is the stable identity; the username can change, so the row holding the
 * current username is always the verified one. Any other row that still holds that
 * username (stale/unverified) is renamed out of the way.
 */
export async function linkTikTokAccount(db: DB, u: TikTokUser, now = new Date()): Promise<number> {
  const username = u.username.replace(/^@/, "").toLowerCase();
  const fields = { nickname: u.displayName, avatarUrl: u.avatarUrl, tiktokOpenId: u.openId, verifiedAt: now };

  const [byOpenId] = await db.select({ id: creators.id }).from(creators).where(eq(creators.tiktokOpenId, u.openId));
  const [byName] = await db.select({ id: creators.id, openId: creators.tiktokOpenId })
    .from(creators).where(eq(creators.uniqueId, username));

  // Case 1: an unverified row with this username exists and nobody has claimed this open_id yet: claim it.
  if (!byOpenId && byName && !byName.openId) {
    await db.update(creators).set(fields).where(eq(creators.id, byName.id));
    return byName.id;
  }

  // Free up the username if another row holds it.
  const keepId = byOpenId?.id ?? -1;
  await db.update(creators)
    .set({ uniqueId: sql`${creators.uniqueId} || '#stale-' || ${creators.id}` })
    .where(and(eq(creators.uniqueId, username), ne(creators.id, keepId)));

  if (byOpenId) {
    await db.update(creators).set({ ...fields, uniqueId: username }).where(eq(creators.id, byOpenId.id));
    return byOpenId.id;
  }
  const [row] = await db.insert(creators).values({ uniqueId: username, ...fields }).returning({ id: creators.id });
  return row.id;
}
