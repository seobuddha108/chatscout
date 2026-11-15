/**
 * TikTok LIVE watcher built on the unofficial `tiktok-live-connector` (signing via Euler Stream,
 * free tier unless EULER_API_KEY is set). Translates platform events into our LiveEvent format.
 */
import type { CreatorInfo, LiveEvent } from "@/ingest/types";

/** The subset of TikTokLiveConnection we use; injectable for tests. */
export interface LiveConnection {
  connect(): Promise<{ roomId: string; roomInfo?: unknown }>;
  disconnect(): Promise<void>;
  on(event: string, cb: (data: any) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export type ConnectionFactory = (uniqueId: string) => Promise<LiveConnection> | LiveConnection;

export const defaultFactory: ConnectionFactory = async (uniqueId) => {
  const { TikTokLiveConnection } = await import("tiktok-live-connector");
  return new TikTokLiveConnection(uniqueId, {
    signApiKey: process.env.EULER_API_KEY || undefined,
    processInitialData: false, // don't replay history; overlap is handled by msg-id de-duplication
    fetchRoomInfoOnConnect: true, // rejects with UserOfflineError when not live
  }) as unknown as LiveConnection;
};

export type WatchResult =
  | { status: "offline" }
  | { status: "ended" | "deadline" | "disconnected"; roomId: string; events: number }
  | { status: "error"; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
const msgAt = (d: any): Date => {
  const t = Number(d?.common?.createTime);
  return Number.isFinite(t) && t > 1e12 && t < Date.now() + 60_000 ? new Date(t) : new Date();
};
const msgId = (d: any): string | undefined => (d?.common?.msgId ? String(d.common.msgId) : undefined);
const user = (u: any) => ({
  uniqueId: String(u?.uniqueId || u?.userId || "unknown"),
  nickname: String(u?.nickname || u?.uniqueId || "unknown"),
});

export function mapChat(roomId: string, d: any): LiveEvent | null {
  if (!d?.comment) return null;
  return { type: "chat", roomId, user: user(d.user), text: String(d.comment), at: msgAt(d), msgId: msgId(d) };
}

export function mapGift(roomId: string, d: any): LiveEvent | null {
  const g = d?.giftDetails;
  // Streakable gifts (type 1) fire repeatedly while the streak runs; only count the final event.
  if (g?.giftType === 1 && !d?.repeatEnd) return null;
  const diamonds = Number(g?.diamondCount ?? 0) * Math.max(1, Number(d?.repeatCount ?? 1));
  if (!diamonds) return null;
  return { type: "gift", roomId, gifter: user(d.user), giftName: String(g?.giftName || `gift ${d?.giftId ?? ""}`), diamonds, at: msgAt(d), msgId: msgId(d) };
}

export function mapPoll(roomId: string, d: any): LiveEvent | null {
  const content = d?.startContent ?? d?.updateContent ?? d?.endContent;
  const pollId = String(d?.pollId || d?.pollBasicInfo?.pollIdStr || "");
  if (!content?.OptionList?.length || !pollId || pollId === "0") return null;
  const options = content.OptionList.map((o: any) => ({ id: String(o.OptionIdx), text: String(o.DisplayContent ?? ""), votes: Number(o.Votes ?? 0) }));
  const voters = content.OptionList.flatMap((o: any) => (o.VoteUserList ?? []).map((v: any) => ({
    optionId: String(o.OptionIdx), userId: String(v.UserId), nickname: String(v.NickName ?? v.UserId),
  })));
  return {
    type: "poll_tally", roomId, pollId: `tt-${pollId}`,
    question: d?.startContent?.Title || d?.pollBasicInfo?.title || undefined,
    options, voters, ended: Boolean(d?.endContent), at: msgAt(d),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Watches one creator until the stream ends, the connection drops or the deadline passes.
 * Events are handed to `flush` in batches (never concurrently).
 */
export async function watchLive(opts: {
  creator: CreatorInfo;
  deadline: Date;
  flush: (events: LiveEvent[]) => Promise<unknown>;
  factory?: ConnectionFactory;
  flushMs?: number;
  onLive?: (roomId: string) => Promise<unknown> | void;
}): Promise<WatchResult> {
  const { creator, deadline, flush } = opts;
  let conn: LiveConnection;
  try {
    conn = await (opts.factory ?? defaultFactory)(creator.uniqueId);
  } catch (err) {
    return { status: "error", error: String(err) };
  }

  let roomId = "";
  let buffer: LiveEvent[] = [];
  let total = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const drain = () => {
    if (!buffer.length) return chain;
    const batch = buffer;
    buffer = [];
    total += batch.length;
    chain = chain.then(() => flush(batch)).catch((e) => console.error("live flush failed:", e));
    return chain;
  };
  const push = (e: LiveEvent | null) => { if (e && roomId) buffer.push(e); };

  let finish!: (s: "ended" | "deadline" | "disconnected") => void;
  const done = new Promise<"ended" | "deadline" | "disconnected">((r) => (finish = r));

  conn.on("chat", (d) => push(mapChat(roomId, d)));
  conn.on("gift", (d) => push(mapGift(roomId, d)));
  conn.on("roomUser", (d) => push(d?.viewerCount != null ? { type: "viewers", roomId, viewers: Number(d.viewerCount), at: new Date() } : null));
  conn.on("pollMessage", (d) => push(mapPoll(roomId, d)));
  conn.on("streamEnd", () => { push({ type: "live_end", roomId, at: new Date() }); finish("ended"); });
  conn.on("disconnected", () => finish("disconnected"));
  conn.on("error", (e) => console.warn(`live connection error for @${creator.uniqueId}:`, e?.message ?? e));

  try {
    const state = await conn.connect();
    roomId = String(state.roomId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = state.roomInfo as any;
    const nickname = info?.owner?.nickname || creator.nickname;
    buffer.unshift({ type: "live_start", roomId, creator: { ...creator, nickname }, title: info?.title || undefined, at: new Date() });
    await opts.onLive?.(roomId);
  } catch (err) {
    const e = err as Error;
    if (e?.name === "UserOfflineError" || /offline|not live/i.test(e?.message ?? "")) return { status: "offline" };
    return { status: "error", error: e?.message ?? String(err) };
  }

  const timer = setInterval(drain, opts.flushMs ?? 3000);
  const deadlineTimer = setTimeout(() => finish("deadline"), Math.max(0, deadline.getTime() - Date.now()));
  const status = await done;
  clearInterval(timer);
  clearTimeout(deadlineTimer);
  await drain();
  await conn.disconnect().catch(() => {});
  return { status, roomId, events: total };
}
