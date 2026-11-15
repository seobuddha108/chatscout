/**
 * Local development without TikTok credentials (TikTok requires a registered https redirect URI).
 * Never active in production builds.
 */
export const devLoginEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "1";
