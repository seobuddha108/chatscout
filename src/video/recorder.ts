import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { recordingSegments } from "@/db/schema";
import { parsePlaylist, pickVariant, segmentKey } from "./hls";
import type { ObjectStore } from "./storage";

export interface RecordResult { segments: number; bytes: number; failed: number; reason: "deadline" | "stopped" | "ended" | "error"; error?: string }

/**
 * Records an HLS live stream into object storage until the deadline, an abort or #EXT-X-ENDLIST.
 * Each new segment is claimed in the database first (unique per session), so overlapping
 * recorders never upload the same segment twice.
 */
export async function recordHls(opts: {
  db: DB;
  sessionId: number;
  playlistUrl: string;
  store: ObjectStore;
  deadline: Date;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  minPollMs?: number;
}): Promise<RecordResult> {
  const f = opts.fetchImpl ?? fetch;
  const res: RecordResult = { segments: 0, bytes: 0, failed: 0, reason: "deadline" };
  const seen = new Set<string>();
  let url = opts.playlistUrl;
  const stopped = () => opts.signal?.aborted || Date.now() >= opts.deadline.getTime();
  const sleep = (ms: number) => new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    opts.signal?.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
  });

  try {
    while (!stopped()) {
      const r = await f(url, { signal: opts.signal });
      if (!r.ok) throw new Error(`playlist ${r.status}`);
      const pl = parsePlaylist(await r.text(), url);
      if (pl.isMaster) {
        const v = pickVariant(pl.variants);
        if (!v) throw new Error("no variants");
        url = v.url;
        continue;
      }
      for (const s of pl.segments) {
        const key = segmentKey(s);
        if (seen.has(key)) continue;
        seen.add(key);
        const path = `${opts.sessionId}/${key}`;
        const [claimed] = await opts.db.insert(recordingSegments).values({
          sessionId: opts.sessionId, segmentKey: key, seq: s.seq, duration: s.duration,
          programTime: s.programTime, capturedAt: new Date(), storagePath: path,
        }).onConflictDoNothing().returning({ id: recordingSegments.id });
        if (!claimed) continue; // another recorder has it
        try {
          const body = await f(s.url, { signal: opts.signal });
          if (!body.ok) throw new Error(`segment ${body.status}`);
          const bytes = new Uint8Array(await body.arrayBuffer());
          await opts.store.put(path, bytes, "video/mp2t");
          await opts.db.update(recordingSegments).set({ status: "stored", bytes: bytes.length }).where(eq(recordingSegments.id, claimed.id));
          res.segments++;
          res.bytes += bytes.length;
        } catch (err) {
          res.failed++;
          await opts.db.update(recordingSegments).set({ status: "failed" }).where(eq(recordingSegments.id, claimed.id));
          if (opts.signal?.aborted) break;
          console.warn("segment failed:", (err as Error).message);
        }
      }
      if (pl.endList) { res.reason = "ended"; return res; }
      await sleep(Math.max(opts.minPollMs ?? 1000, (pl.targetDuration * 1000) / 2));
    }
    res.reason = opts.signal?.aborted ? "stopped" : "deadline";
  } catch (err) {
    if (opts.signal?.aborted) { res.reason = "stopped"; return res; }
    res.reason = "error";
    res.error = (err as Error).message;
  }
  return res;
}
