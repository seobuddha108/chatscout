import { z } from "zod";
import { apiRoute, periodSchema } from "@/api/handler";
import { leagueTable } from "@/rankings/leagues";

export const dynamic = "force-dynamic";

/** GET /api/v1/leagues?period=week — league thresholds. Standings: /rankings/creators?league=A */
export const GET = apiRoute(z.object({ period: periodSchema }), async ({ query }) => ({
  period: query.period, leagues: leagueTable(query.period),
}));
