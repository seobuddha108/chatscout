import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { exchangeCode, fetchUser, revokeToken, tiktokConfig, TikTokAuthError } from "@/auth/tiktok";
import { linkTikTokAccount } from "@/auth/link";
import { SESSION_COOKIE, STATE_COOKIE, cookieBase, createSession } from "@/auth/session";

export const dynamic = "force-dynamic";

/** TikTok redirects here with ?code&state (or ?error). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, req.url));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const cfg = tiktokConfig();
  if (!cfg) return fail("not_configured");
  if (url.searchParams.get("error")) return fail("denied");

  const state = url.searchParams.get("state") ?? "";
  const expected = (await cookies()).get(STATE_COOKIE)?.value ?? "";
  if (!state || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return fail("invalid_state");
  }
  const code = url.searchParams.get("code");
  if (!code) return fail("missing_code");

  try {
    const token = await exchangeCode(cfg, code);
    const user = await fetchUser(token.accessToken);
    await revokeToken(cfg, token.accessToken);
    if (user.openId !== token.openId) throw new TikTokAuthError("open_id_mismatch", "open_id mismatch");

    const db = await getDb();
    const creatorId = await linkTikTokAccount(db, user);
    const session = await createSession(db, creatorId);
    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(SESSION_COOKIE, session.token, { ...cookieBase(), expires: session.expiresAt });
    return res;
  } catch (err) {
    console.error("TikTok login failed:", err);
    return fail(err instanceof TikTokAuthError ? err.code : "login_failed");
  }
}
