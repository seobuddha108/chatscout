import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type DB } from "@/db";
import { ingestEvents, purgeOldChat, runIngest } from "@/ingest/ingest";
import { MockSource } from "@/ingest/mock-source";
import type { LiveEvent } from "@/ingest/types";
import { createApiKey, revokeApiKey } from "@/api/keys";
import { deleteChatterMessages, searchChat, toTsQuery, topChatters } from "@/chat/queries";
import { creators } from "@/db/schema";
import { eq } from "drizzle-orm";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 11, h, m));
let db: DB;
let annaId: number;

const chat = (roomId: string, user: string, text: string, m: number): LiveEvent =>
  ({ type: "chat", roomId, user: { uniqueId: user, nickname: user.toUpperCase() }, text, at: at(10, m) });

beforeEach(async () => {
  db = await createPgliteDb("memory://");
  await createApiKey(db, { name: "anna", plan: "pro", creator: "@Anna", now: at(9) });
  annaId = (await db.select().from(creators).where(eq(creators.uniqueId, "anna")))[0].id;
  await ingestEvents(db, [
    { type: "live_start", roomId: "r1", creator: { uniqueId: "anna", nickname: "Anna", country: "DE", category: "general" }, at: at(10) },
    { type: "live_start", roomId: "r2", creator: { uniqueId: "ben", nickname: "Ben", category: "general" }, at: at(10) },
    chat("r1", "Max_99", "Wann ist das Giveaway?", 1),
    chat("r1", "lena", "giveaway pls 🙏", 2),
    chat("r1", "spam.bot", "scam link: free-coins.example giveaway", 3),
    chat("r1", "max_99", "hallo @anna", 4),
    chat("r2", "max_99", "giveaway bei ben?", 5),
  ]);
});

describe("chat ingest", () => {
  it("stores chat only for opted-in creators and fills in stub creator data", async () => {
    const all = await searchChat(db, { creatorId: annaId, limit: 50, offset: 0 });
    expect(all.items).toHaveLength(4);
    expect(all.items[0]).toMatchObject({ user: "max_99", text: "hallo @anna", roomId: "r1" });
    const [anna] = await db.select().from(creators).where(eq(creators.id, annaId));
    expect(anna).toMatchObject({ nickname: "Anna", country: "DE" });
  });

  it("drops chat after the key is revoked", async () => {
    const { id } = await createApiKey(db, { name: "ben", plan: "basic", creator: "ben", now: at(9) });
    expect((await ingestEvents(db, [chat("r2", "x", "hi", 6)])).chats).toBe(1);
    await revokeApiKey(db, id);
    expect(await ingestEvents(db, [chat("r2", "x", "hi", 7)])).toMatchObject({ chats: 0, chatsDropped: 1 });
  });

  it("mock source produces chat that gets stored for the opted-in creator", async () => {
    const src = new MockSource({ creatorsPerCountry: 2, giftersPerCountry: 5 });
    src.reseed(3);
    await createApiKey(db, { name: "m", plan: "pro", creator: src.creators[0].uniqueId });
    const ev = src.history(7, new Date()); // 7 days so creator 0 surely streamed
    const res = await ingestEvents(db, ev);
    expect(res.chats).toBeGreaterThan(0);
    expect(res.chatsDropped).toBeGreaterThan(res.chats);
    expect((await runIngest(db, src)).events).toBeGreaterThan(0);
  });
});

describe("chat search", () => {
  const search = (q: Record<string, string>) => searchChat(db, { creatorId: annaId, limit: 50, offset: 0, ...q });

  it("finds words with prefix match, case-insensitive, never across creators", async () => {
    const r = await search({ q: "GIVE" });
    expect(r.items.map((i) => i.user)).toEqual(["spam.bot", "lena", "max_99"]);
  });

  it("supports AND, exclusion and user filters", async () => {
    expect((await search({ q: "giveaway -scam" })).items.map((i) => i.user)).toEqual(["lena", "max_99"]);
    expect((await search({ q: "wann giveaway" })).items).toHaveLength(1);
    expect((await search({ user: "@MAX_99" })).items.map((i) => i.text)).toEqual(["hallo @anna", "Wann ist das Giveaway?"]);
    expect((await search({ q: "anna" })).items.map((i) => i.text)).toEqual(["hallo @anna"]);
  });

  it("treats hostile input as plain words", async () => {
    expect(toTsQuery("a' | b:* & !c")).toBe("a:* & b:* & c:*");
    expect(toTsQuery("-only")).toBeNull();
    expect((await search({ q: "') or 1=1 --" })).items).toEqual([]);
    expect((await search({ q: "-scam" })).items).toEqual([]);
  });

  it("filters by time window", async () => {
    const r = await searchChat(db, { creatorId: annaId, from: at(10, 2), to: at(10, 4), limit: 50, offset: 0 });
    expect(r.items.map((i) => i.user)).toEqual(["spam.bot", "lena"]);
  });
});

describe("chatters, erasure, retention", () => {
  it("lists top chatters with prefix filter", async () => {
    const r = await topChatters(db, { creatorId: annaId, from: at(0), to: at(23), limit: 10, offset: 0 });
    expect(r.items[0]).toMatchObject({ user: "max_99", messages: 2, sessions: 1 });
    const p = await topChatters(db, { creatorId: annaId, from: at(0), to: at(23), prefix: "@SPAM", limit: 10, offset: 0 });
    expect(p.items.map((i) => i.user)).toEqual(["spam.bot"]);
    const lit = await topChatters(db, { creatorId: annaId, from: at(0), to: at(23), prefix: "%", limit: 10, offset: 0 });
    expect(lit.items).toEqual([]);
  });

  it("erases one chatter and purges old chat", async () => {
    expect(await deleteChatterMessages(db, annaId, "@Max_99")).toBe(2);
    expect((await searchChat(db, { creatorId: annaId, limit: 50, offset: 0 })).items).toHaveLength(2);
    expect(await purgeOldChat(db, 30, new Date(at(10).getTime() + 31 * 86_400_000))).toBe(2);
  });
});
