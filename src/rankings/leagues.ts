import type { Period } from "./periods";

/** League thresholds in diamonds per week; day and month are scaled. Tune to real data later. */
export const WEEKLY_LEAGUES = [
  { league: "S", min: 1_000_000 },
  { league: "A", min: 200_000 },
  { league: "B", min: 50_000 },
  { league: "C", min: 10_000 },
  { league: "D", min: 0 },
] as const;
export type League = (typeof WEEKLY_LEAGUES)[number]["league"];

const SCALE: Record<Period, number> = { day: 1 / 7, week: 1, month: 30 / 7 };

export function leagueTable(period: Period) {
  return WEEKLY_LEAGUES.map((l) => ({ league: l.league, min: Math.round(l.min * SCALE[period]) }));
}

export function leagueFor(diamonds: number, period: Period) {
  const table = leagueTable(period);
  const i = table.findIndex((l) => diamonds >= l.min);
  const next = i > 0 ? table[i - 1] : null;
  return {
    league: table[i].league as League,
    nextLeague: (next?.league ?? null) as League | null,
    diamondsToNext: next ? next.min - diamonds : null,
  };
}

/** [min, max) diamond range of a league for the period; max is null for the top league. */
export function leagueRange(league: League, period: Period) {
  const table = leagueTable(period);
  const i = table.findIndex((l) => l.league === league);
  return { min: table[i].min, max: i > 0 ? table[i - 1].min : null };
}
