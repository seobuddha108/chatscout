import { z } from "zod";
import { apiRoute, countrySchema, dateSchema, pageSchema, periodSchema } from "@/api/handler";
import { listPolls } from "@/analytics/queries";

export const dynamic = "force-dynamic";

const schema = z.object({
  creator: z.string().max(64).optional(), country: countrySchema, q: z.string().max(100).optional(),
  period: periodSchema, date: dateSchema, ...pageSchema,
});

/** GET /api/v1/polls?creator=&country=&q=&period=week — poll results, aggregated (no voter names). */
export const GET = apiRoute(schema, ({ db, query: q, maxLimit }) =>
  listPolls(db, { ...q, search: q.q, at: q.date, limit: Math.min(q.limit, maxLimit) }));
