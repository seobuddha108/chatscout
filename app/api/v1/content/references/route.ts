import { z } from "zod";
import { apiRoute, dateSchema, pageSchema, periodSchema } from "@/api/handler";
import { contentReferences } from "@/analytics/queries";

export const dynamic = "force-dynamic";

const schema = z.object({
  about: z.string().max(64).optional(), by: z.string().max(64).optional(),
  minMentions: z.coerce.number().int().min(1).max(1000).default(3),
  period: periodSchema, date: dateSchema, ...pageSchema,
}).refine((q) => q.about || q.by, { message: "Provide 'about' (creator talked about) and/or 'by' (streamer)." });

/** GET /api/v1/content/references?about=<creator>|by=<streamer>&period=week — where a creator was the topic. */
export const GET = apiRoute(schema, ({ db, query: q, maxLimit }) =>
  contentReferences(db, { ...q, at: q.date, limit: Math.min(q.limit, maxLimit) }));
