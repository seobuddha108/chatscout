import { getDb } from "@/db";
import { errorJson, hasBearer, json } from "@/api/handler";
import { closeStaleSessions, purgeOldChat, runIngest, sourceFromEnv } from "@/ingest/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return errorJson(401, "Unauthorized.");
  const db = await getDb();
  const result = await runIngest(db, sourceFromEnv());
  const staleClosed = await closeStaleSessions(db);
  const chatPurged = await purgeOldChat(db);
  return json({ ok: true, ...result, staleClosed, chatPurged });
}
