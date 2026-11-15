"use client";

import { useEffect, useRef } from "react";

type Idx = { t: number; o: number; d: number };
const SEEK = "chatscout:seek";

/** HLS player (native on Safari, hls.js elsewhere). Listens for seek requests by wall-clock time. */
export function Player({ src, index }: { src: string; index: Idx[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destroy = () => {};
    if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
    else {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      });
    }
    const onSeek = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      // Last segment starting at or before t; clamp into it.
      let seg = index[0];
      for (const s of index) { if (s.t <= t) seg = s; else break; }
      if (!seg) return;
      video.currentTime = seg.o + Math.min(seg.d, Math.max(0, (t - seg.t) / 1000));
      void video.play().catch(() => {});
      video.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(SEEK, onSeek);
    return () => { window.removeEventListener(SEEK, onSeek); destroy(); };
  }, [src, index]);
  return <video ref={ref} controls playsInline style={{ width: "100%", maxHeight: 480, background: "#000", borderRadius: 8 }} />;
}

/** A timestamp that jumps the player to that moment (falls back to plain text without video). */
export function SeekTime({ t, label }: { t: number; label: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SEEK, { detail: t }))}
      style={{ background: "none", border: 0, padding: 0, color: "var(--link)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
      {label}
    </button>
  );
}
