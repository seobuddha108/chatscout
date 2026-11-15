import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type DB } from "@/db";
import { creators } from "@/db/schema";
import { buildAuthorizeUrl, exchangeCode, fetchUser, TikTokAuthError, type TikTokConfig } from "@/auth/tiktok";
import { linkTikTokAccount } from "@/auth/link";
import { createSession, creatorForSession, destroySession } from "@/auth/session";
import { authenticate, createApiKey } from "@/api/keys";
import { ingestEvents } from "@/ingest/ingest";

const cfg: TikTokConfig = { clientKey: "ck", clientSecret: "cs", redirectUri: "https://app.example/api/auth/tiktok/callback", scopes: "user.info.basic,user.info.profile" };
const fakeFetch = (status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []) =>
  (async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

describe("TikTok OAuth client", () => {
  it("builds the authorize URL", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "st4te"));
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_key: "ck", scope: "user.info.basic,user.info.profile", response_type: "code", redirect_uri: cfg.redirectUri, state: "st4te",
    });
  });

  it("exchanges the code with a form-encoded POST", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const t = await exchangeCode(cfg, "c0de", fakeFetch(200, { access_token: "at", open_id: "oid", scope: "user.info.basic" }, seen));
    expect(t).toEqual({ accessToken: "at", openId: "oid", scope: "user.info.basic" });
    const body = new URLSearchParams(String(seen[0].init?.body));
    expect(Object.fromEntries(body)).toMatchObject({ code: "c0de", grant_type: "authorization_code", client_secret: "cs" });
    await expect(exchangeCode(cfg, "x", fakeFetch(400, { error: "invalid_grant" }))).rejects.toThrow(/invalid_grant/);
  });

  it("reads the user and requires a username", async () => {
    const ok = { data: { user: { open_id: "oid", username: "Anna.Live", display_name: "Anna", avatar_url: "https://x/a.jpg" } }, error: { code: "ok" } };
    expect(await fetchUser("at", fakeFetch(200, ok))).toEqual({ openId: "oid", username: "Anna.Live", displayName: "Anna", avatarUrl: "https://x/a.jpg" });
    const noName = { data: { user: { open_id: "oid", display_name: "Anna" } }, error: { code: "ok" } };
    await expect(fetchUser("at", fakeFetch(200, noName))).rejects.toMatchObject({ code: "missing_username" });
    const err = { data: {}, error: { code: "access_token_invalid", message: "bad" } };
    await expect(fetchUser("at", fakeFetch(401, err))).rejects.toBeInstanceOf(TikTokAuthError);
  });
});

describe("account linking", () => {
  let db: DB;
  beforeEach(async () => { db = await createPgliteDb("memory://"); });
  const user = (openId: string, username: string) => ({ openId, username, displayName: username, avatarUrl: null });
  const byName = async (u: string) => (await db.select().from(creators).where(eq(creators.uniqueId, u)))[0];

  it("claims an existing unverified creator row (keeps its history)", async () => {
    await ingestEvents(db, [{ type: "live_start", roomId: "r", creator: { uniqueId: "anna", nickname: "A", country: "DE", category: "general" }, at: new Date() }]);
    const before = await byName("anna");
    const id = await linkTikTokAccount(db, user("oid-a", "@Anna"));
    expect(id).toBe(before.id);
    expect(await byName("anna")).toMatchObject({ tiktokOpenId: "oid-a", country: "DE" });
    expect((await byName("anna")).verifiedAt).not.toBeNull();
  });

  it("follows username changes by open_id and moves stale rows aside", async () => {
    const id = await linkTikTokAccount(db, user("oid-a", "anna"));
    await ingestEvents(db, [{ type: "live_start", roomId: "r", creator: { uniqueId: "anna_new", nickname: "?", category: "general" }, at: new Date() }]);
    expect(await linkTikTokAccount(db, user("oid-a", "anna_new"))).toBe(id);
    expect((await byName("anna_new")).id).toBe(id);
    expect(await byName("anna")).toBeUndefined();
  });

  it("never hands a verified username to a different TikTok account without moving the old one", async () => {
    const a = await linkTikTokAccount(db, user("oid-a", "anna"));
    const b = await linkTikTokAccount(db, user("oid-b", "anna")); // username was reassigned by TikTok
    expect(b).not.toBe(a);
    expect((await byName("anna")).tiktokOpenId).toBe("oid-b");
    const [old] = await db.select().from(creators).where(eq(creators.id, a));
    expect(old.uniqueId).toBe(`anna#stale-${a}`);
  });
});

describe("sessions and key gating", () => {
  let db: DB;
  beforeEach(async () => { db = await createPgliteDb("memory://"); });

  it("creates, reads, expires and destroys sessions", async () => {
    const id = await linkTikTokAccount(db, { openId: "o", username: "anna", displayName: "Anna", avatarUrl: null });
    const now = new Date("2026-11-15T12:00:00Z");
    const { token } = await createSession(db, id, now);
    expect(await creatorForSession(db, token, now)).toMatchObject({ id, uniqueId: "anna" });
    expect(await creatorForSession(db, token, new Date(now.getTime() + 31 * 86_400_000))).toBeNull();
    expect(await creatorForSession(db, "forged", now)).toBeNull();
    await destroySession(db, token);
    expect(await creatorForSession(db, token, now)).toBeNull();
  });

  it("only grants chat access (creatorId) once the creator is verified", async () => {
    const { key } = await createApiKey(db, { name: "k", plan: "pro", creator: "anna" });
    expect(await authenticate(db, key)).toMatchObject({ ok: true, creatorId: null });
    const id = await linkTikTokAccount(db, { openId: "o", username: "anna", displayName: "Anna", avatarUrl: null });
    expect(await authenticate(db, key)).toMatchObject({ ok: true, creatorId: id });
  });
});
