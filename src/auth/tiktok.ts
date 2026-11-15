/**
 * TikTok Login Kit for Web (OAuth 2.0, v2 endpoints).
 * We only use it to prove account ownership: read open_id + username, then revoke the token.
 * Endpoints/scopes are overridable via env in case TikTok changes them.
 */
export const TIKTOK_ENDPOINTS = {
  authorize: process.env.TIKTOK_AUTHORIZE_URL ?? "https://www.tiktok.com/v2/auth/authorize/",
  token: process.env.TIKTOK_TOKEN_URL ?? "https://open.tiktokapis.com/v2/oauth/token/",
  revoke: process.env.TIKTOK_REVOKE_URL ?? "https://open.tiktokapis.com/v2/oauth/revoke/",
  userInfo: process.env.TIKTOK_USERINFO_URL ?? "https://open.tiktokapis.com/v2/user/info/",
};

export class TikTokAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface TikTokConfig { clientKey: string; clientSecret: string; redirectUri: string; scopes: string }

export function tiktokConfig(): TikTokConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const redirectUri = process.env.TIKTOK_REDIRECT_URI ?? (appUrl ? `${appUrl}/api/auth/tiktok/callback` : undefined);
  if (!clientKey || !clientSecret || !redirectUri) return null;
  // username (the @handle) is needed to match the account to its LIVE streams.
  const scopes = process.env.TIKTOK_SCOPES ?? "user.info.basic,user.info.profile";
  return { clientKey, clientSecret, redirectUri, scopes };
}

export function buildAuthorizeUrl(cfg: TikTokConfig, state: string): string {
  const u = new URL(TIKTOK_ENDPOINTS.authorize);
  u.search = new URLSearchParams({
    client_key: cfg.clientKey, scope: cfg.scopes, response_type: "code", redirect_uri: cfg.redirectUri, state,
  }).toString();
  return u.toString();
}

type Fetch = typeof fetch;

export async function exchangeCode(cfg: TikTokConfig, code: string, f: Fetch = fetch) {
  const res = await f(TIKTOK_ENDPOINTS.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({
      client_key: cfg.clientKey, client_secret: cfg.clientSecret, code,
      grant_type: "authorization_code", redirect_uri: cfg.redirectUri,
    }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== "string" || typeof body.open_id !== "string") {
    throw new TikTokAuthError("token_exchange_failed", `Token exchange failed: ${String(body.error ?? res.status)} ${String(body.error_description ?? "")}`.trim());
  }
  return { accessToken: body.access_token, openId: body.open_id, scope: String(body.scope ?? "") };
}

export interface TikTokUser { openId: string; username: string; displayName: string; avatarUrl: string | null }

export async function fetchUser(accessToken: string, f: Fetch = fetch): Promise<TikTokUser> {
  const u = new URL(TIKTOK_ENDPOINTS.userInfo);
  u.searchParams.set("fields", "open_id,username,display_name,avatar_url");
  const res = await f(u, { headers: { authorization: `Bearer ${accessToken}` } });
  const body = await res.json().catch(() => ({})) as {
    data?: { user?: { open_id?: string; username?: string; display_name?: string; avatar_url?: string } };
    error?: { code?: string; message?: string };
  };
  const user = body.data?.user;
  if (!res.ok || (body.error?.code && body.error.code !== "ok") || !user?.open_id) {
    throw new TikTokAuthError("user_info_failed", `User info failed: ${body.error?.code ?? res.status} ${body.error?.message ?? ""}`.trim());
  }
  if (!user.username) {
    throw new TikTokAuthError("missing_username", "TikTok did not return a username. Check that the profile scope is approved and granted.");
  }
  return { openId: user.open_id, username: user.username, displayName: user.display_name ?? user.username, avatarUrl: user.avatar_url ?? null };
}

/** Best effort: we don't keep TikTok tokens, so revoke right after reading the profile. */
export async function revokeToken(cfg: TikTokConfig, token: string, f: Fetch = fetch) {
  try {
    await f(TIKTOK_ENDPOINTS.revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: cfg.clientKey, client_secret: cfg.clientSecret, token }),
    });
  } catch { /* ignore */ }
}
