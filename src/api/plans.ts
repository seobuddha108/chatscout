/** Paid 7-day packages, modeled on the one-time-weekly pricing of comparable services. */
export const PLANS = {
  basic: { dailyRequests: 1_000, maxLimit: 50, priceUsdPerWeek: 5 },
  pro: { dailyRequests: 10_000, maxLimit: 100, priceUsdPerWeek: 10 },
  business: { dailyRequests: 100_000, maxLimit: 500, priceUsdPerWeek: 25 },
} as const;
export type Plan = keyof typeof PLANS;
export const isPlan = (p: string): p is Plan => p in PLANS;
