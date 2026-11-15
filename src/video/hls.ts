/** Minimal HLS (m3u8) parser: enough for live media playlists and master playlists. */
export interface HlsVariant { url: string; bandwidth: number; height: number | null }
export interface HlsSegment { uri: string; url: string; duration: number; seq: number; programTime: Date | null }
export interface HlsPlaylist {
  isMaster: boolean;
  variants: HlsVariant[];
  targetDuration: number;
  mediaSequence: number;
  segments: HlsSegment[];
  endList: boolean;
}

export function parsePlaylist(text: string, baseUrl: string): HlsPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("Not an HLS playlist");
  const out: HlsPlaylist = { isMaster: false, variants: [], targetDuration: 2, mediaSequence: 0, segments: [], endList: false };
  let pendingDuration: number | null = null;
  let pendingTime: Date | null = null;
  let pendingVariant: { bandwidth: number; height: number | null } | null = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      out.isMaster = true;
      const bw = /BANDWIDTH=(\d+)/.exec(line);
      const res = /RESOLUTION=\d+x(\d+)/.exec(line);
      pendingVariant = { bandwidth: bw ? Number(bw[1]) : 0, height: res ? Number(res[1]) : null };
    } else if (line.startsWith("#EXT-X-TARGETDURATION:")) out.targetDuration = Number(line.split(":")[1]) || 2;
    else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) out.mediaSequence = Number(line.split(":")[1]) || 0;
    else if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      const d = new Date(line.slice("#EXT-X-PROGRAM-DATE-TIME:".length));
      pendingTime = Number.isNaN(d.getTime()) ? null : d;
    } else if (line.startsWith("#EXTINF:")) pendingDuration = parseFloat(line.slice(8)) || 0;
    else if (line === "#EXT-X-ENDLIST") out.endList = true;
    else if (!line.startsWith("#")) {
      const url = new URL(line, baseUrl).toString();
      if (pendingVariant) {
        out.variants.push({ url, ...pendingVariant });
        pendingVariant = null;
      } else if (pendingDuration !== null) {
        out.segments.push({ uri: line, url, duration: pendingDuration, seq: out.mediaSequence + out.segments.length, programTime: pendingTime });
        pendingDuration = null;
        pendingTime = null;
      }
    }
  }
  return out;
}

/** Highest variant up to `maxHeight` (default 720p); otherwise the lowest available. */
export function pickVariant(variants: HlsVariant[], maxHeight = 720): HlsVariant | null {
  if (!variants.length) return null;
  const fit = variants.filter((v) => v.height !== null && v.height <= maxHeight).sort((a, b) => b.bandwidth - a.bandwidth);
  return fit[0] ?? [...variants].sort((a, b) => a.bandwidth - b.bandwidth)[0];
}

/** Stable id of a segment across playlist refreshes and recorders: its file name without query string. */
export const segmentKey = (s: HlsSegment) => s.uri.split("?")[0].split("/").pop() || `seq-${s.seq}`;
