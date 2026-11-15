/** Paid 7-day packages, modeled on the one-time-weekly pricing of comparable services. */
export const PLANS = {
  // Self-service from the dashboard until payments exist.
  trial: { dailyRequests: 200, maxLimit: 20, priceUsdPerWeek: 0, followLimit: 3 },
  basic: { dailyRequests: 1_000, maxLimit: 50, priceUsdPerWeek: 5, followLimit: 5 },
  pro: { dailyRequests: 10_000, maxLimit: 100, priceUsdPerWeek: 10, followLimit: 20 },
  business: { dailyRequests: 100_000, maxLimit: 500, priceUsdPerWeek: 25, followLimit: 100 },
} as const;
export type Plan = keyof typeof PLANS;
export const isPlan = (p: string): p is Plan => p in PLANS;
