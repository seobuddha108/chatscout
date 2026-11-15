import { getDb } from "@/db";
import { errorJson, hasBearer, json } from "@/api/handler";
import { liveSources } from "@/ingest/ingest";
import { runLiveWindow } from "@/live/runner";

export const dynamic = "force-dynamic";
// Vercel Pro allows long-running functions; each tick watches for ~4.5 min, the next tick
// (every minute) takes over ~75 s before that ends, so streams are covered without gaps.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return errorJson(401, "Unauthorized.");
  if (!liveSources().has("tiktok")) return json({ ok: true, skipped: "LIVE_SOURCE does not include tiktok" });
  const result = await runLiveWindow(await getDb(), { windowMs: 270_000 });
  return json({ ok: true, ...result });
}
