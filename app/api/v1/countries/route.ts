import { z } from "zod";
import { apiRoute, dateSchema, periodSchema } from "@/api/handler";
import { countryOverview } from "@/rankings/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/countries?period=day — creators, diamonds and live count per country. */
export const GET = apiRoute(z.object({ period: periodSchema, date: dateSchema }), ({ db, query }) =>
  countryOverview(db, query.period, query.date));
