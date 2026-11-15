import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPgliteDb, type DB } from "@/db";
import { ingestEvents } from "@/ingest/ingest";
import { MockSource } from "@/ingest/mock-source";
import type { LiveEvent } from "@/ingest/types";
import { createApiKey } from "@/api/keys";
import { linkTikTokAccount } from "@/auth/link";
import { contentReferences, listPolls, pollDetail, sessionTimeline } from "@/analytics/queries";
import { mentions, sentiment } from "@/analytics/text";
import { allRows } from "@/db/rows";
import { deleteChatterMessages } from "@/chat/queries";

const NOW = new Date("2026-11-11T15:00:00Z");
const at = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 10, 11, h, m, s));
const cr = (u: string) => ({ uniqueId: u, nickname: u.toUpperCase(), country: "DE", category: "general" as const });
const user = (u: string) => ({ uniqueId: u, nickname: u });

let db: DB;
beforeEach(async () => { db = await createPgliteDb("memory://"); });

function fixture(): LiveEvent[] {
  return [
    { type: "live_start", roomId: "orig", creator: cr("anna"), title: "Q&A", at: at(10) },
    { type: "live_start", roomId: "react", creator: cr("ben"), title: "Reaktion auf @Anna 👀", at: at(12) },
    { type: "live_start", roomId: "other", creator: cr("cleo"), title: "Just chatting", at: at(12) },
    { type: "chat", roomId: "react", user: user("v1"), text: "@anna ist so cringe 😂", at: at(12, 1) },
    { type: "chat", roomId: "react", user: user("v2"), text: "@anna hat voll recht", at: at(12, 1, 30) },
    { type: "chat", roomId: "react", user: user("v3"), text: "@anna lügner 🤡", at: at(12, 2) },
    { type: "chat", roomId: "react", user: user("v1"), text: "@ben bester stream", at: at(12, 2) }, // self-mention: ignored
    { type: "chat", roomId: "other", user: user("v4"), text: "kennt jemand @anna?", at: at(12, 5) }, // 1 mention < threshold
    { type: "chat", roomId: "react", user: user("v5"), text: "@unknown_person hi", at: at(12, 3) },
    { type: "poll_start", roomId: "react", pollId: "p1", question: "War @anna im Recht?", options: [{ id: "1", text: "Ja" }, { id: "2", text: "Nein" }], at: at(12, 10) },
    { type: "poll_vote", roomId: "react", pollId: "p1", optionId: "1", user: user("v1"), at: at(12, 10, 10) },
    { type: "poll_vote", roomId: "react", pollId: "p1", optionId: "2", user: user("v2"), at: at(12, 10, 20) },
    { type: "poll_vote", roomId: "react", pollId: "p1", optionId: "2", user: user("v3"), at: at(12, 11, 5) },
    { type: "poll_vote", roomId: "react", pollId: "p1", optionId: "9", user: user("v4"), at: at(12, 11, 6) }, // invalid option
    { type: "poll_end", roomId: "react", pollId: "p1", at: at(12, 12) },
    { type: "gift", roomId: "react", gifter: user("g1"), giftName: "Rose", diamonds: 50, at: at(12, 1, 10) },
  ];
}

describe("text signals", () => {
  it("detects sentiment and mentions", () => {
    expect(sentiment("das ist so cringe 😂")).toBe(0); // one each
    expect(sentiment("@anna lügner 🤡")).toBe(-1);
    expect(sentiment("respekt, mega stream 🔥")).toBe(1);
    expect(mentions("@Anna. und @ben_1 und @anna")).toEqual(["anna", "ben_1"]);
  });
});

describe("analytics ingest", () => {
  it("aggregates without storing chat or voter names for non-opted-in creators", async () => {
    const res = await ingestEvents(db, fixture());
    expect(res).toMatchObject({ chats: 0, polls: 1, pollVotes: 3, namedVotes: 0, mentionLinks: 2 });
    const count = async (t: string) => Number(allRows<{ n: string }>(await db.execute(sql.raw(`select count(*) as n from ${t}`)))[0].n);
    expect(await count("chat_messages")).toBe(0);
    expect(await count("poll_voters")).toBe(0);
  });

  it("is additive across batches", async () => {
    const ev = fixture();
    await ingestEvents(db, ev.slice(0, 5));
    await ingestEvents(db, ev.slice(5));
    const t = await sessionTimeline(db, "react");
    expect(t?.mentioned.find((m) => m.uniqueId === "anna")).toMatchObject({ mentions: 3, inTitle: true });
  });
});

describe("polls", () => {
  it("returns aggregated results, timeline, and hides voters from non-owners", async () => {
    await ingestEvents(db, fixture());
    const list = await listPolls(db, { creator: "@BEN", period: "day", at: NOW, limit: 10, offset: 0 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      pollId: "p1", totalVotes: 3, winner: "Nein",
      options: [{ text: "Ja", votes: 1, percent: 33.3 }, { text: "Nein", votes: 2, percent: 66.7 }],
    });
    const d = await pollDetail(db, "p1", null);
    expect(d?.timeline.map((x) => x.cumulative)).toEqual([{ "1": 1, "2": 1 }, { "1": 1, "2": 2 }]);
    expect(d).toMatchObject({ voters: null, votersVisible: false });
    expect((await listPolls(db, { search: "recht", period: "day", at: NOW, limit: 10, offset: 0 })).items).toHaveLength(1);
    expect(await pollDetail(db, "nope", null)).toBeNull();
  });

  it("shows voter names only to the verified stream owner, and erasure covers them", async () => {
    await createApiKey(db, { name: "ben", plan: "pro", creator: "ben" });
    const benId = await linkTikTokAccount(db, { openId: "o-ben", username: "ben", displayName: "Ben", avatarUrl: null });
    const annaId = await linkTikTokAccount(db, { openId: "o-anna", username: "anna", displayName: "Anna", avatarUrl: null });
    expect((await ingestEvents(db, fixture())).namedVotes).toBe(3);
    const own = await pollDetail(db, "p1", benId);
    expect(own?.voters?.map((v) => [v.user, v.optionId])).toEqual([["v1", "1"], ["v2", "2"], ["v3", "2"]]);
    expect((await pollDetail(db, "p1", annaId))?.voters).toBeNull(); // anna is talked about, but it's not her stream
    expect(await deleteChatterMessages(db, annaId, "v1")).toBe(0); // not anna's stream: nothing to erase
    expect(await deleteChatterMessages(db, benId, "@V1")).toBe(3); // 2 chat messages + 1 named vote
    expect((await pollDetail(db, "p1", benId))?.voters?.map((v) => v.user)).toEqual(["v2", "v3"]);
  });
});

describe("content tracking", () => {
  beforeEach(async () => { await ingestEvents(db, fixture()); });

  it("finds streams where a creator was the topic", async () => {
    const r = await contentReferences(db, { about: "anna", period: "day", at: NOW, minMentions: 3, limit: 10, offset: 0 });
    expect(r.items.map((i) => i.roomId)).toEqual(["react"]); // "other" has only 1 mention, no title
    expect(r.items[0]).toMatchObject({
      streamer: { uniqueId: "ben" }, inTitle: true, mentions: 3, positive: 1, negative: 1, diamonds: 50, chatMessages: 5,
    });
    expect(r.summary).toMatchObject({ references: 1, distinctStreamers: 1 });
    const loose = await contentReferences(db, { about: "anna", period: "day", at: NOW, minMentions: 1, limit: 10, offset: 0 });
    expect(loose.items.map((i) => i.roomId).sort()).toEqual(["other", "react"]);
    const by = await contentReferences(db, { by: "ben", period: "day", at: NOW, minMentions: 3, limit: 10, offset: 0 });
    expect(by.items.map((i) => i.about.uniqueId)).toEqual(["anna"]);
  });

  it("builds a per-minute session timeline", async () => {
    const t = await sessionTimeline(db, "react");
    expect(t?.minutes.slice(0, 2).map((m) => [m.minute.toISOString().slice(11, 16), m.messages, m.diamonds])).toEqual([["12:01", 2, 50], ["12:02", 2, 0]]);
    expect(t?.polls.map((p) => p.pollId)).toEqual(["p1"]);
    expect(t?.totals.chatMessages).toBe(5);
  });
});

describe("mock data", () => {
  it("produces reaction streams and polls that the analytics pick up", async () => {
    const src = new MockSource({ creatorsPerCountry: 6, giftersPerCountry: 20 });
    src.reseed(11);
    const res = await ingestEvents(db, src.history(3, NOW));
    expect(res.polls).toBeGreaterThan(5);
    expect(res.mentionLinks).toBeGreaterThan(0);
  });
});
