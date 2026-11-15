export type Period = "day" | "week" | "month";

/** Calendar period in UTC containing `at`. Weeks start on Monday. Returns [from, to). */
export function periodWindow(period: Period, at = new Date()): { from: Date; to: Date } {
  const y = at.getUTCFullYear(), m = at.getUTCMonth(), d = at.getUTCDate();
  if (period === "day") return { from: new Date(Date.UTC(y, m, d)), to: new Date(Date.UTC(y, m, d + 1)) };
  if (period === "month") return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
  const dow = (at.getUTCDay() + 6) % 7; // Monday = 0
  return { from: new Date(Date.UTC(y, m, d - dow)), to: new Date(Date.UTC(y, m, d - dow + 7)) };
}
