/**
 * Finds an HLS URL in TikTok room info. The shape is undocumented and changes, so we look in the
 * known places first and fall back to any .m3u8 string, preferring ~720p ("hd") quality.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const QUALITY = ["hd", "hd1", "sd", "sd1", "sd2", "ld", "ld1", "origin", "uhd", "fullhd1"];

export function findHlsUrl(roomInfo: any): string | null {
  if (!roomInfo || typeof roomInfo !== "object") return null;
  const candidates: { url: string; rank: number }[] = [];
  const add = (url: unknown, quality?: string) => {
    if (typeof url !== "string" || !/^https?:\/\/.+\.m3u8/i.test(url)) return;
    const i = quality ? QUALITY.indexOf(quality.toLowerCase()) : -1;
    candidates.push({ url, rank: i === -1 ? 50 : i });
  };
  const roots = [roomInfo, roomInfo.data, roomInfo.room, roomInfo.data?.room, roomInfo.liveRoom].filter(Boolean);
  for (const r of roots) {
    const su = r.stream_url ?? r.streamUrl;
    if (su) {
      add(su.hls_pull_url ?? su.hlsPullUrl, "hd");
      for (const [q, u] of Object.entries(su.hls_pull_url_map ?? su.hlsPullUrlMap ?? {})) add(u, q);
      const sdk = su.live_core_sdk_data ?? su.liveCoreSdkData;
      const raw = sdk?.pull_data?.stream_data ?? sdk?.pullData?.streamData;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          for (const [q, v] of Object.entries<any>(parsed?.data ?? {})) add(v?.main?.hls, q);
        } catch { /* ignore */ }
      }
    }
  }
  if (!candidates.length) {
    const seen = new Set<unknown>();
    const walk = (v: any, depth: number) => {
      if (depth > 8 || v == null || seen.has(v)) return;
      if (typeof v === "string") return add(v);
      if (typeof v !== "object") return;
      seen.add(v);
      for (const x of Object.values(v)) walk(x, depth + 1);
    };
    walk(roomInfo, 0);
  }
  return candidates.sort((a, b) => a.rank - b.rank)[0]?.url ?? null;
}
