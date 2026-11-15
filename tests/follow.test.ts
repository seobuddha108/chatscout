import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type DB } from "@/db";
import { createApiKey, revokeApiKey } from "@/api/keys";
import { linkTikTokAccount } from "@/auth/link";
import { ingestEvents } from "@/ingest/ingest";
import { canView, followCreator, listFollows, setNoTracking, unfollowCreator } from "@/follow/follows";
import { recordingModes } from "@/live/policy";
import { runLiveWindow } from "@/live/runner";
import { searchChat } from "@/chat/queries";
import { eq } from "drizzle-orm";
import { creators } from "@/db/schema";

const at = (m: number) => new Date(Date.UTC(2026, 10, 11, 20, m));
const verify = (db: DB, u: string) => linkTikTokAccount(db, { openId: `o-${u}`, username: u, displayName: u, avatarUrl: null });
const idOf = async (db: DB, u: string) => (await db.select({ id: creators.id }).from(creators).where(eq(creators.uniqueId, u)))[0].id;

let db: DB;
let me: number;
let keyId: number;
beforeEach(async () => {
  db = await createPgliteDb("memory://");
  keyId = (await createApiKey(db, { name: "me", plan: "trial", creator: "me" })).id;
  me = await verify(db, "me");
});

describe("following", () => {
  it("follows within plan limits and lists followed creators", async () => {
    expect(await followCreator(db, me, "@Star.One")).toEqual({ ok: true, uniqueId: "star.one" });
    expect(await followCreator(db, me, "two")).toMatchObject({ ok: true });
    expect(await followCreator(db, me, "three")).toMatchObject({ ok: true });
    expect(await followCreator(db, me, "four")).toMatchObject({ ok: false, error: expect.stringContaining("3") }); // trial = 3
    expect(await followCreator(db, me, "two")).toMatchObject({ ok: true }); // idempotent
    expect((await listFollows(db, me)).map((f) => f.uniqueId)).toEqual(["star.one", "three", "two"]);
    expect(await followCreator(db, me, "bad name!")).toMatchObject({ ok: false });
  });

  it("requires an active package", async () => {
    await revokeApiKey(db, keyId);
    expect(await followCreator(db, me, "star")).toMatchObject({ ok: false, error: expect.stringContaining("Paket") });
  });

  it("controls access: own streams and followed creators only", async () => {
    await followCreator(db, me, "star");
    const star = await idOf(db, "star");
    await db.insert(creators).values({ uniqueId: "other", nickname: "o" });
    expect(await canView(db, me, me)).toBe(true);
    expect(await canView(db, me, star)).toBe(true);
    expect(await canView(db, me, await idOf(db, "other"))).toBe(false);
    await unfollowCreator(db, me, star);
    expect(await canView(db, me, star)).toBe(false);
  });
});

describe("recording policy", () => {
  const stream = (room: string, u: string, msgs: [string, string][]) => [
    { type: "live_start" as const, roomId: room, creator: { uniqueId: u, nickname: u, category: "general" as const }, at: at(0) },
    ...msgs.map(([user, text], i) => ({ type: "chat" as const, roomId: room, user: { uniqueId: user, nickname: user }, text, at: at(i + 1), msgId: `${room}-${i}` })),
  ];

  it("stores followed streams with per-stream pseudonyms and own streams with names", async () => {
    await followCreator(db, me, "star");
    const star = await idOf(db, "star");
    await ingestEvents(db, [...stream("s1", "star", [["lena", "giveaway?"], ["lena", "hallo"]]), ...stream("s2", "star", [["lena", "giveaway!"]]),
      ...stream("m1", "me", [["lena", "giveaway bei mir"]]), ...stream("x1", "stranger", [["lena", "giveaway"]])]);
    expect([...(await recordingModes(db, [me, star, await idOf(db, "stranger")])).entries()].sort())
      .toEqual([[me, "named"], [star, "pseudonymous"]].sort());

    const starChat = (await searchChat(db, { creatorId: star, q: "giveaway", limit: 10, offset: 0 })).items;
    expect(starChat).toHaveLength(2);
    expect(starChat.every((m) => m.user.startsWith("anon-") && m.nickname.startsWith("Zuschauer #"))).toBe(true);
    expect(starChat[0].user).not.toBe(starChat[1].user); // same person, different streams: unlinkable
    const s1 = (await searchChat(db, { creatorId: star, session: "s1", limit: 10, offset: 0 })).items;
    expect(new Set(s1.map((m) => m.user)).size).toBe(1); // same person within one stream: same pseudonym

    const mine = (await searchChat(db, { creatorId: me, limit: 10, offset: 0 })).items;
    expect(mine.map((m) => m.user)).toEqual(["lena"]);
    const stranger = (await searchChat(db, { creatorId: await idOf(db, "stranger"), limit: 10, offset: 0 })).items;
    expect(stranger).toEqual([]); // neither own nor followed: not stored
  });

  it("opt-out stops recording, removes follows and pseudonymous chat", async () => {
    await followCreator(db, me, "star");
    const star = await idOf(db, "star");
    await ingestEvents(db, stream("s1", "star", [["lena", "hi"]]));
    await setNoTracking(db, star, true);
    expect(await listFollows(db, me)).toEqual([]);
    expect((await searchChat(db, { creatorId: star, limit: 10, offset: 0 })).items).toEqual([]);
    expect(await followCreator(db, me, "star")).toMatchObject({ ok: false, error: expect.stringContaining("deaktiviert") });
    await ingestEvents(db, stream("s2", "star", [["lena", "again"]]));
    expect((await searchChat(db, { creatorId: star, limit: 10, offset: 0 })).items).toEqual([]);
  });
});

describe("worker candidates", () => {
  class Offline extends EventEmitter {
    async connect(): Promise<{ roomId: string }> { const e = new Error("offline"); e.name = "UserOfflineError"; throw e; }
    async disconnect() {}
  }
  it("watches own and followed creators, not opted-out or unfollowed ones", async () => {
    await followCreator(db, me, "star");
    await followCreator(db, me, "quiet");
    await setNoTracking(db, await idOf(db, "quiet"), true);
    const seen: string[] = [];
    await runLiveWindow(db, { windowMs: 100, factory: (u) => { seen.push(u); return new Offline(); } });
    expect(seen.sort()).toEqual(["me", "star"]);
  });
});
