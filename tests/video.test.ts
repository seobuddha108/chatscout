import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createPgliteDb, type DB } from "@/db";
import { allRows } from "@/db/rows";
import { creators, liveSessions } from "@/db/schema";
import { createApiKey } from "@/api/keys";
import { linkTikTokAccount } from "@/auth/link";
import { followCreator } from "@/follow/follows";
import { ingestEvents } from "@/ingest/ingest";
import { parsePlaylist, pickVariant } from "@/video/hls";
import { findHlsUrl } from "@/video/stream-url";
import { recordHls } from "@/video/recorder";
import { MemoryStore } from "@/video/storage";
import { buildPlaylist, purgeOldVideo, seekIndex, sessionSegments } from "@/video/playback";
import { runLiveWindow } from "@/live/runner";

const media = (seqStart: number, n: number, end = false) => [
  "#EXTM3U", "#EXT-X-TARGETDURATION:2", `#EXT-X-MEDIA-SEQUENCE:${seqStart}`,
  ...Array.from({ length: n }, (_, i) => [`#EXT-X-PROGRAM-DATE-TIME:${new Date(Date.UTC(2026, 10, 15, 20, 0, (seqStart + i) * 2)).toISOString()}`, "#EXTINF:2.000,", `seg_${seqStart + i}.ts?token=abc`]).flat(),
  ...(end ? ["#EXT-X-ENDLIST"] : []),
].join("\n");

/** Fake CDN: the playlist advances by one segment per request. */
function fakeCdn(total = 5) {
  let req = 0;
  const hits: string[] = [];
  const f = (async (input: string | URL) => {
    const url = String(input);
    hits.push(url);
    if (url.includes("master")) return new Response(["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080", "hi/index.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720", "mid/index.m3u8", "#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360", "lo/index.m3u8"].join("\n"));
    if (url.includes("index.m3u8")) { const start = Math.min(req++, total - 3); return new Response(media(start, 3, start >= total - 3)); }
    if (url.includes("seg_")) return new Response(new Uint8Array([1, 2, 3, 4]));
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, hits };
}

let db: DB;
beforeEach(async () => { db = await createPgliteDb("memory://"); });

describe("hls", () => {
  it("parses media and master playlists and picks ~720p", () => {
    const pl = parsePlaylist(media(10, 2), "https://cdn.example/live/index.m3u8");
    expect(pl.segments.map((s) => [s.seq, s.url, s.duration])).toEqual([
      [10, "https://cdn.example/live/seg_10.ts?token=abc", 2], [11, "https://cdn.example/live/seg_11.ts?token=abc", 2]]);
    expect(pl.segments[0].programTime?.toISOString()).toBe("2026-11-15T20:00:20.000Z");
    const v = [{ url: "a", bandwidth: 4e6, height: 1080 }, { url: "b", bandwidth: 1.5e6, height: 720 }, { url: "c", bandwidth: 4e5, height: 360 }];
    expect(pickVariant(v)?.url).toBe("b");
    expect(pickVariant([{ url: "x", bandwidth: 9e6, height: 2160 }, { url: "y", bandwidth: 5e6, height: 1440 }])?.url).toBe("y");
  });

  it("finds the HLS url in room info", () => {
    const sdk = JSON.stringify({ data: { origin: { main: { hls: "https://p/origin.m3u8" } }, hd: { main: { hls: "https://p/hd.m3u8" } } } });
    expect(findHlsUrl({ stream_url: { live_core_sdk_data: { pull_data: { stream_data: sdk } } } })).toBe("https://p/hd.m3u8");
    expect(findHlsUrl({ data: { stream_url: { hls_pull_url: "https://p/x.m3u8" } } })).toBe("https://p/x.m3u8");
    expect(findHlsUrl({ deep: { nested: ["https://p/fallback.m3u8?x=1"] } })).toBe("https://p/fallback.m3u8?x=1");
    expect(findHlsUrl({ nothing: true })).toBeNull();
  });
});

describe("recorder", () => {
  async function session() {
    await ingestEvents(db, [{ type: "live_start", roomId: "r1", creator: { uniqueId: "anna", nickname: "Anna", category: "general" }, at: new Date() }]);
    return (await db.select({ id: liveSessions.id }).from(liveSessions))[0].id;
  }

  it("records each segment once, via the 720p variant, until ENDLIST", async () => {
    const sid = await session();
    const store = new MemoryStore();
    const { f, hits } = fakeCdn(5);
    const res = await recordHls({ db, sessionId: sid, playlistUrl: "https://cdn/master.m3u8", store, deadline: new Date(Date.now() + 10_000), fetchImpl: f, minPollMs: 1 });
    expect(res).toMatchObject({ reason: "ended", segments: 5, failed: 0, bytes: 20 });
    expect([...store.objects.keys()].sort()).toEqual([0, 1, 2, 3, 4].map((i) => `${sid}/seg_${i}.ts`).sort());
    expect(hits.some((h) => h.includes("/mid/"))).toBe(true);
    expect(hits.some((h) => h.includes("/hi/"))).toBe(false);
  });

  it("never uploads a segment twice with overlapping recorders", async () => {
    const sid = await session();
    const store = new MemoryStore();
    let puts = 0;
    const counting = { ...store, put: async (p: string, b: Uint8Array) => { puts++; await store.put(p, b); }, sign: store.sign.bind(store), remove: store.remove.bind(store) };
    const opts = (f: typeof fetch) => ({ db, sessionId: sid, playlistUrl: "https://cdn/x/index.m3u8", store: counting, deadline: new Date(Date.now() + 10_000), fetchImpl: f, minPollMs: 1 });
    await Promise.all([recordHls(opts(fakeCdn(6).f)), recordHls(opts(fakeCdn(6).f))]);
    expect(puts).toBe(6);
  });

  it("stops on abort", async () => {
    const sid = await session();
    const ctrl = new AbortController();
    const never = (async (u: string | URL) => String(u).includes("seg_") ? new Response(new Uint8Array([1])) : new Response(media(0, 1))) as typeof fetch;
    const p = recordHls({ db, sessionId: sid, playlistUrl: "https://cdn/i.m3u8", store: new MemoryStore(), deadline: new Date(Date.now() + 60_000), signal: ctrl.signal, fetchImpl: never, minPollMs: 50 });
    setTimeout(() => ctrl.abort(), 100);
    expect((await p).reason).toBe("stopped");
  });
});

describe("playback", () => {
  it("builds a playlist with discontinuities and a seek index; purges old recordings", async () => {
    const t = (s: number) => new Date(Date.UTC(2026, 10, 15, 20, 0, s));
    const segs = [{ path: "1/a", duration: 2, wall: t(0) }, { path: "1/b", duration: 2, wall: t(2) }, { path: "1/c", duration: 2, wall: t(60) }];
    const pl = buildPlaylist(segs, new Map(segs.map((s) => [s.path, `https://signed/${s.path}`])), true);
    expect(pl).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(pl.match(/#EXT-X-DISCONTINUITY/g)).toHaveLength(1);
    expect(pl.trim().endsWith("#EXT-X-ENDLIST")).toBe(true);
    expect(seekIndex(segs)).toEqual([{ t: t(0).getTime(), o: 0, d: 2 }, { t: t(2).getTime(), o: 2, d: 2 }, { t: t(60).getTime(), o: 4, d: 2 }]);

    await ingestEvents(db, [{ type: "live_start", roomId: "old", creator: { uniqueId: "anna", nickname: "A", category: "general" }, at: new Date(Date.now() - 20 * 86_400_000) }]);
    const sid = (await db.select({ id: liveSessions.id }).from(liveSessions))[0].id;
    const store = new MemoryStore();
    await recordHls({ db, sessionId: sid, playlistUrl: "https://cdn/x/index.m3u8", store, deadline: new Date(Date.now() + 10_000), fetchImpl: fakeCdn(3).f, minPollMs: 1 });
    expect((await sessionSegments(db, sid))).toHaveLength(3);
    expect(await purgeOldVideo(db, store, 14)).toBe(3);
    expect(store.objects.size).toBe(0);
    expect(await sessionSegments(db, sid)).toEqual([]);
  });
});

describe("runner integration", () => {
  class LiveConn extends EventEmitter {
    constructor(private room: string) { super(); }
    async connect() { return { roomId: this.room, roomInfo: { stream_url: { hls_pull_url: "https://cdn/x/index.m3u8" } } }; }
    async disconnect() {}
  }
  it("records video only for own streams with recording switched on", async () => {
    await createApiKey(db, { name: "me", plan: "pro", creator: "me" });
    const me = await linkTikTokAccount(db, { openId: "o-me", username: "me", displayName: "Me", avatarUrl: null });
    await followCreator(db, me, "star");
    await db.update(creators).set({ recordVideo: true }).where(eq(creators.uniqueId, "me"));
    await db.update(creators).set({ recordVideo: true }).where(eq(creators.uniqueId, "star")); // not own: must be ignored
    const store = new MemoryStore();
    await runLiveWindow(db, { windowMs: 1500, store, fetchImpl: fakeCdn(4).f, factory: (u) => new LiveConn(`room-${u}`) });
    const rows = allRows<{ room: string; n: number }>(await db.execute(sql`select s.external_room_id as room, count(r.id)::int as n
      from live_sessions s left join recording_segments r on r.session_id = s.id group by 1 order by 1`));
    expect(rows).toEqual([{ room: "room-me", n: 4 }, { room: "room-star", n: 0 }]);
  });
});
