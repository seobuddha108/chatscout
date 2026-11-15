import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { devLoginEnabled } from "@/auth/dev";
import { linkTikTokAccount } from "@/auth/link";
import { SESSION_COOKIE, cookieBase, createSession } from "@/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/dev (form: username) — fake TikTok login for local dev only. */
export async function POST(req: Request) {
  if (!devLoginEnabled()) return new Response("Not found", { status: 404 });
  const username = String((await req.formData()).get("username") ?? "").trim().replace(/^@/, "");
  if (!/^[\w.]{2,24}$/.test(username)) return NextResponse.redirect(new URL("/login?dev=1&error=invalid_username", req.url), 303);
  const db = await getDb();
  const creatorId = await linkTikTokAccount(db, { openId: `dev:${username.toLowerCase()}`, username, displayName: username, avatarUrl: null });
  const session = await createSession(db, creatorId);
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set(SESSION_COOKIE, session.token, { ...cookieBase(), expires: session.expiresAt });
  return res;
}
