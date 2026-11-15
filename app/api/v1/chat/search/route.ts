import { z } from "zod";
import { apiRoute, needsCreator, pageSchema } from "@/api/handler";
import { searchChat } from "@/chat/queries";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().max(200).optional(),
  user: z.string().max(64).optional(),
  session: z.string().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...pageSchema,
});

/**
 * GET /api/v1/chat/search?q=giveaway -scam&user=@name&from=2026-11-01
 * Searches chat of the key owner's own streams only.
 */
export const GET = apiRoute(schema, async ({ db, query: q, creatorId, maxLimit }) => {
  if (creatorId === null) return needsCreator();
  return searchChat(db, { ...q, creatorId, limit: Math.min(q.limit, maxLimit) });
});
