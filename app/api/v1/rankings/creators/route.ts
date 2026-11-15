import { z } from "zod";
import { apiRoute, countrySchema, dateSchema, pageSchema, periodSchema } from "@/api/handler";
import { creatorRanking } from "@/rankings/queries";

export const dynamic = "force-dynamic";

const schema = z.object({
  period: periodSchema,
  date: dateSchema,
  country: countrySchema,
  category: z.enum(["general", "gaming"]).optional(),
  league: z.enum(["S", "A", "B", "C", "D"]).optional(),
  ...pageSchema,
});

/** GET /api/v1/rankings/creators?country=DE&period=week&category=gaming&league=A */
export const GET = apiRoute(schema, ({ db, query: q, maxLimit }) =>
  creatorRanking(db, { ...q, at: q.date, limit: Math.min(q.limit, maxLimit) }));
