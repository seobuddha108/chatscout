import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { liveSessions, recordingSegments } from "@/db/schema";
import type { ObjectStore } from "./storage";

export interface StoredSegment { path: string; duration: number; wall: Date }

/** Stored segments of a session in playback order, with an estimated wall-clock start per segment. */
export async function sessionSegments(db: DB, sessionId: number): Promise<StoredSegment[]> {
  const rows = await db.select({
    path: recordingSegments.storagePath, duration: recordingSegments.duration,
    programTime: recordingSegments.programTime, capturedAt: recordingSegments.capturedAt,
  }).from(recordingSegments)
    .where(and(eq(recordingSegments.sessionId, sessionId), eq(recordingSegments.status, "stored")))
    .orderBy(asc(sql`coalesce(${recordingSegments.programTime}, ${recordingSegments.capturedAt})`), asc(recordingSegments.seq));
  // Without PROGRAM-DATE-TIME, a segment was downloaded roughly one segment after it was produced.
  return rows.map((r) => ({ path: r.path, duration: r.duration, wall: r.programTime ?? new Date(r.capturedAt.getTime() - r.duration * 1000) }));
}

/** VOD/EVENT playlist with signed segment URLs, program date-times and discontinuities at gaps. */
export function buildPlaylist(segs: StoredSegment[], urls: Map<string, string>, ended: boolean): string {
  const target = Math.max(1, ...segs.map((s) => Math.ceil(s.duration)));
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", `#EXT-X-TARGETDURATION:${target}`, "#EXT-X-MEDIA-SEQUENCE:0",
    `#EXT-X-PLAYLIST-TYPE:${ended ? "VOD" : "EVENT"}`];
  let prevEnd: number | null = null;
  for (const s of segs) {
    const url = urls.get(s.path);
    if (!url) continue;
    if (prevEnd !== null && s.wall.getTime() - prevEnd > 5000) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(`#EXT-X-PROGRAM-DATE-TIME:${s.wall.toISOString()}`, `#EXTINF:${s.duration.toFixed(3)},`, url);
    prevEnd = s.wall.getTime() + s.duration * 1000;
  }
  if (ended) lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

/** Maps wall-clock time to player offset: [{ t: wall ms, o: offset s, d: duration s }]. */
export function seekIndex(segs: StoredSegment[]) {
  let o = 0;
  return segs.map((s) => { const e = { t: s.wall.getTime(), o, d: s.duration }; o += s.duration; return e; });
}

/** Deletes recordings of sessions that started more than `days` ago (storage objects and rows). */
export async function purgeOldVideo(db: DB, store: ObjectStore | null, days = Number(process.env.VIDEO_RETENTION_DAYS ?? 14), now = new Date()) {
  if (!store) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const old = await db.select({ id: recordingSegments.id, path: recordingSegments.storagePath })
    .from(recordingSegments).innerJoin(liveSessions, eq(liveSessions.id, recordingSegments.sessionId))
    .where(lt(liveSessions.startedAt, cutoff)).limit(5000);
  if (!old.length) return 0;
  await store.remove(old.map((r) => r.path));
  await db.delete(recordingSegments).where(inArray(recordingSegments.id, old.map((r) => r.id)));
  return old.length;
}
