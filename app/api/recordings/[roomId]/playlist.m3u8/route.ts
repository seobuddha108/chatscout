import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { liveSessions } from "@/db/schema";
import { SESSION_COOKIE, creatorForSession } from "@/auth/session";
import { buildPlaylist, sessionSegments } from "@/video/playback";
import { storeFromEnv } from "@/video/storage";

export const dynamic = "force-dynamic";

/** HLS playlist of a recorded stream. Only the creator who owns the stream can play it. */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const db = await getDb();
  const viewer = await creatorForSession(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const roomId = decodeURIComponent((await params).roomId);
  const [s] = await db.select({ id: liveSessions.id, creatorId: liveSessions.creatorId, endedAt: liveSessions.endedAt })
    .from(liveSessions).where(eq(liveSessions.externalRoomId, roomId));
  if (!s || s.creatorId !== viewer.id) return new Response("Not found", { status: 404 });
  const store = storeFromEnv();
  if (!store) return new Response("Video storage not configured", { status: 503 });
  const segs = await sessionSegments(db, s.id);
  const urls = await store.sign(segs.map((x) => x.path), 4 * 3600);
  return new Response(buildPlaylist(segs, urls, Boolean(s.endedAt)), {
    headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
  });
}
