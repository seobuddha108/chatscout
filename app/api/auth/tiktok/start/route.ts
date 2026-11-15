import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, tiktokConfig } from "@/auth/tiktok";
import { STATE_COOKIE, cookieBase } from "@/auth/session";
import { devLoginEnabled } from "@/auth/dev";

export const dynamic = "force-dynamic";

/** Starts TikTok Login: sets a CSRF state cookie and redirects to TikTok. */
export async function GET(req: Request) {
  const cfg = tiktokConfig();
  if (!cfg) {
    if (devLoginEnabled()) return NextResponse.redirect(new URL("/login?dev=1", req.url));
    return NextResponse.redirect(new URL("/login?error=not_configured", req.url));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, state));
  res.cookies.set(STATE_COOKIE, state, { ...cookieBase(), maxAge: 600 });
  return res;
}
