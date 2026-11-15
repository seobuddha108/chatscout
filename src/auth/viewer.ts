import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { creators, liveSessions } from "@/db/schema";
import { canView, normalizeHandle } from "@/follow/follows";
import { currentCreator } from "./current";

/** For dashboard pages about a creator: logged in, and own account or followed creator. */
export async function requireCreatorAccess(handle: string) {
  const viewer = await currentCreator();
  if (!viewer) redirect("/login");
  const db = await getDb();
  const [c] = await db.select().from(creators).where(eq(creators.uniqueId, normalizeHandle(decodeURIComponent(handle))));
  if (!c || !(await canView(db, viewer.id, c.id))) notFound();
  return { db, viewer, creator: c };
}

export async function requireSessionAccess(roomId: string) {
  const viewer = await currentCreator();
  if (!viewer) redirect("/login");
  const db = await getDb();
  const [s] = await db.select({ creatorId: liveSessions.creatorId, uniqueId: creators.uniqueId })
    .from(liveSessions).innerJoin(creators, eq(creators.id, liveSessions.creatorId))
    .where(eq(liveSessions.externalRoomId, decodeURIComponent(roomId)));
  if (!s || !(await canView(db, viewer.id, s.creatorId))) notFound();
  return { db, viewer, creatorId: s.creatorId, uniqueId: s.uniqueId };
}
