import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPgliteDb, type DB } from "@/db";
import { allRows } from "@/db/rows";
import { createApiKey } from "@/api/keys";
import { linkTikTokAccount } from "@/auth/link";
import { ingestEvents } from "@/ingest/ingest";
import { mapGift, mapPoll, watchLive, type LiveConnection } from "@/live/tiktok";
import { runLiveWindow } from "@/live/runner";
import { pollDetail } from "@/analytics/queries";
import { searchChat } from "@/chat/queries";

/** Fake TikTokLiveConnection: tests drive it by emitting events. */
class FakeConn extends EventEmitter implements LiveConnection {
  disconnected = false;
  constructor(private live = true, public roomId = "room-1") { super(); }
  async connect() {
    if (!this.live) { const e = new Error("The requested user isn't online :("); e.name = "UserOfflineError"; throw e; }
    return { roomId: this.roomId, roomInfo: { title: "Abendstream", owner: { nickname: "Anna Live" } } };
  }
  async disconnect() { this.disconnected = true; }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const chat = (id: string, u: string, text: string) => ({ common: { msgId: id, createTime: String(Date.now()) }, user: { uniqueId: u, nickname: u }, comment: text });

let db: DB;
let annaId: number;
beforeEach(async () => {
  db = await createPgliteDb("memory://");
  await createApiKey(db, { name: "anna", plan: "pro", creator: "anna" });
  annaId = await linkTikTokAccount(db, { openId: "o-anna", username: "anna", displayName: "Anna", avatarUrl: null });
});

describe("event mapping", () => {
  it("counts streak gifts once, at the end", () => {
    const base = { user: { uniqueId: "g" }, giftDetails: { giftType: 1, diamondCount: 5, giftName: "Heart" }, common: { msgId: "m" } };
    expect(mapGift("r", { ...base, repeatCount: 3, repeatEnd: 0 })).toBeNull();
    expect(mapGift("r", { ...base, repeatCount: 7, repeatEnd: 1 })).toMatchObject({ diamonds: 35, giftName: "Heart" });
    expect(mapGift("r", { user: { uniqueId: "g" }, giftDetails: { giftType: 2, diamondCount: 1000 }, repeatCount: 1 })).toMatchObject({ diamonds: 1000 });
  });
  it("maps poll messages to tallies", () => {
    const e = mapPoll("r", { pollId: "77", startContent: { Title: "Wer gewinnt?", OptionList: [
      { OptionIdx: 0, DisplayContent: "A", Votes: 2, VoteUserList: [{ UserId: "u1", NickName: "Uno" }] },
      { OptionIdx: 1, DisplayContent: "B", Votes: 1, VoteUserList: [] },
    ] } });
    expect(e).toMatchObject({ type: "poll_tally", pollId: "tt-77", question: "Wer gewinnt?", ended: false,
      options: [{ id: "0", text: "A", votes: 2 }, { id: "1", text: "B", votes: 1 }], voters: [{ optionId: "0", userId: "u1" }] });
  });
});

describe("watchLive", () => {
  it("streams events until the stream ends and flushes them into the database", async () => {
    const conn = new FakeConn();
    const p = watchLive({ creator: { uniqueId: "anna", nickname: "Anna", category: "general" }, deadline: new Date(Date.now() + 5000),
      factory: () => conn, flushMs: 10, flush: (ev) => ingestEvents(db, ev) });
    await tick();
    conn.emit("chat", chat("c1", "max", "wann ist das giveaway?"));
    conn.emit("chat", chat("c1", "max", "wann ist das giveaway?")); // duplicate delivery
    conn.emit("roomUser", { viewerCount: 321 });
    conn.emit("gift", { common: { msgId: "g1" }, user: { uniqueId: "fan" }, giftDetails: { giftType: 2, diamondCount: 100, giftName: "Hand Hearts" }, repeatCount: 1 });
    conn.emit("pollMessage", { pollId: "9", startContent: { Title: "Fake oder echt?", OptionList: [{ OptionIdx: 0, DisplayContent: "Fake", Votes: 1 }, { OptionIdx: 1, DisplayContent: "Echt", Votes: 0 }] } });
    await tick();
    conn.emit("pollMessage", { pollId: "9", endContent: { OptionList: [{ OptionIdx: 0, DisplayContent: "Fake", Votes: 4, VoteUserList: [{ UserId: "u7", NickName: "Sieben" }] }, { OptionIdx: 1, DisplayContent: "Echt", Votes: 2 }] } });
    conn.emit("streamEnd", { action: 3 });
    const res = await p;
    expect(res).toMatchObject({ status: "ended", roomId: "room-1" });
    expect(conn.disconnected).toBe(true);

    const found = await searchChat(db, { creatorId: annaId, q: "giveaway", limit: 10, offset: 0 });
    expect(found.items).toHaveLength(1); // de-duplicated
    const [s] = allRows<{ title: string; peak_viewers: number; ended: boolean }>(await db.execute(sql`select title, peak_viewers, ended_at is not null as ended from live_sessions where external_room_id = 'room-1'`));
    expect(s).toMatchObject({ title: "Abendstream", peak_viewers: 321, ended: true });
    const poll = await pollDetail(db, "tt-9", annaId);
    expect(poll).toMatchObject({ question: "Fake oder echt?", totalVotes: 6, endedAt: expect.any(Date) });
    expect(poll?.voters?.map((v) => v.user)).toEqual(["u7"]);
  });

  it("reports offline creators without touching the database", async () => {
    const res = await watchLive({ creator: { uniqueId: "anna", nickname: "Anna", category: "general" }, deadline: new Date(Date.now() + 1000),
      factory: () => new FakeConn(false), flush: async () => { throw new Error("should not flush"); } });
    expect(res).toEqual({ status: "offline" });
  });

  it("de-duplicates across two overlapping watchers", async () => {
    const a = new FakeConn(), b = new FakeConn();
    const opts = (conn: FakeConn) => ({ creator: { uniqueId: "anna", nickname: "Anna", category: "general" as const }, deadline: new Date(Date.now() + 5000),
      factory: () => conn, flushMs: 10, flush: (ev: Parameters<typeof ingestEvents>[1]) => ingestEvents(db, ev) });
    const pa = watchLive(opts(a)), pb = watchLive(opts(b));
    await tick();
    for (const c of [a, b]) { c.emit("chat", chat("x1", "lena", "hallo")); c.emit("gift", { common: { msgId: "gx" }, user: { uniqueId: "f" }, giftDetails: { giftType: 2, diamondCount: 30 }, repeatCount: 1 }); }
    await tick(50);
    a.emit("streamEnd", {}); b.emit("streamEnd", {});
    await Promise.all([pa, pb]);
    const [n] = allRows<{ chats: number; gifts: number }>(await db.execute(sql`select (select count(*)::int from chat_messages) as chats, (select count(*)::int from gift_events) as gifts`));
    expect(n).toEqual({ chats: 1, gifts: 1 });
  });
});

describe("runLiveWindow", () => {
  it("only watches verified creators with an active key, and leases them", async () => {
    await createApiKey(db, { name: "ben", plan: "pro", creator: "ben" }); // key but never verified
    const seen: string[] = [];
    const res = await runLiveWindow(db, { windowMs: 200, factory: (u) => { seen.push(u); return new FakeConn(false); } });
    expect(seen).toEqual(["anna"]);
    expect(res.results).toEqual([{ creator: "anna", status: "offline" }]);
    // Offline creators are not re-checked within checkEveryMs.
    const again = await runLiveWindow(db, { windowMs: 200, factory: (u) => { seen.push(u); return new FakeConn(false); } });
    expect(again.watched).toBe(0);
  });

  it("hands over a live creator shortly before the lease ends", async () => {
    const t0 = new Date();
    const live = new FakeConn(true, "room-x");
    const first = runLiveWindow(db, { now: t0, windowMs: 300, handoverMs: 100, factory: () => live });
    await tick(50);
    // A second tick right away must not take the creator (lease still far from ending).
    const second = await runLiveWindow(db, { now: new Date(t0.getTime() + 10), windowMs: 300, handoverMs: 100, factory: () => new FakeConn(true, "room-x") });
    expect(second.watched).toBe(0);
    // A tick within the handover window takes over.
    const third = runLiveWindow(db, { now: new Date(t0.getTime() + 250), windowMs: 300, handoverMs: 100, factory: () => new FakeConn(true, "room-x") });
    expect((await first).results[0]).toMatchObject({ status: "deadline" });
    live.emit("streamEnd", {});
    const t = await third;
    expect(t.watched).toBe(1);
  });
});

describe("purgeMockData", () => {
  it("removes mock sessions and orphaned mock creators, keeps real creators", async () => {
    const { MockSource } = await import("@/ingest/mock-source");
    const { purgeMockData } = await import("@/ingest/ingest");
    const src = new MockSource({ creatorsPerCountry: 2, giftersPerCountry: 5 });
    src.reseed(5);
    await ingestEvents(db, src.history(2, new Date()));
    await ingestEvents(db, [{ type: "live_start", roomId: "real-1", creator: { uniqueId: "anna", nickname: "Anna", category: "general" }, at: new Date() },
      { type: "gift", roomId: "real-1", gifter: { uniqueId: "realfan", nickname: "R" }, giftName: "Rose", diamonds: 1, at: new Date() }]);
    expect(await purgeMockData(db)).toBeGreaterThan(0);
    const [r] = allRows<{ mock: number; sessions: number; creators: string[]; gifters: number }>(await db.execute(sql`select
      (select count(*)::int from live_sessions where external_room_id like 'mock-%') as mock,
      (select count(*)::int from live_sessions) as sessions,
      (select array_agg(unique_id order by unique_id) from creators) as creators,
      (select count(*)::int from gifters) as gifters`));
    expect(r).toMatchObject({ mock: 0, sessions: 1, creators: ["anna"], gifters: 1 });
    expect(await purgeMockData(db)).toBe(0);
  });
});
