import { getDb } from "@/db";
import { errorJson, hasBearer, json } from "@/api/handler";
import { purgeOldVideo } from "@/video/playback";
import { storeFromEnv } from "@/video/storage";
import { closeStaleSessions, purgeExpiredSessions, purgeMockData, purgeOldChat, purgeOldGifts, runIngest, sourceFromEnv } from "@/ingest/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return errorJson(401, "Unauthorized.");
  const db = await getDb();
  const source = sourceFromEnv();
  // With mock data switched off, clear out what the mock source left behind (no-op once empty).
  const result = source ? await runIngest(db, source) : { source: "none", mockSessionsPurged: await purgeMockData(db) };
  const staleClosed = await closeStaleSessions(db);
  const chatPurged = await purgeOldChat(db);
  const sessionsPurged = await purgeExpiredSessions(db);
  const giftsPurged = await purgeOldGifts(db);
  const videoSegmentsPurged = await purgeOldVideo(db, storeFromEnv());
  return json({ ok: true, ...result, staleClosed, chatPurged, sessionsPurged, giftsPurged, videoSegmentsPurged });
}
