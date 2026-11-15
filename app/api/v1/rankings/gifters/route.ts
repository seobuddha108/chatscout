import { z } from "zod";
import { apiRoute, countrySchema, dateSchema, pageSchema, periodSchema } from "@/api/handler";
import { gifterRanking } from "@/rankings/queries";

export const dynamic = "force-dynamic";

const schema = z.object({
  period: periodSchema,
  date: dateSchema,
  country: countrySchema,
  creator: z.string().min(1).max(64).optional(),
  ...pageSchema,
});

/** GET /api/v1/rankings/gifters?country=DE&period=week[&creator=<uniqueId>] */
export const GET = apiRoute(schema, ({ db, query: q, maxLimit }) =>
  gifterRanking(db, { ...q, at: q.date, limit: Math.min(q.limit, maxLimit) }));
