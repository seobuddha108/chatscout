import { z } from "zod";
import { apiRoute, needsCreator, pageSchema } from "@/api/handler";
import { searchChat } from "@/chat/queries";
import { eq } from "drizzle-orm";
import { creators } from "@/db/schema";
import { canView, normalizeHandle } from "@/follow/follows";
import { errorJson } from "@/api/handler";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().max(200).optional(),
  creator: z.string().max(64).optional(), // a followed creator; default: your own streams
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
  let target = creatorId;
  if (q.creator) {
    const [c] = await db.select({ id: creators.id }).from(creators).where(eq(creators.uniqueId, normalizeHandle(q.creator)));
    if (!c || !(await canView(db, creatorId, c.id))) return errorJson(403, "You can only search your own streams and creators you follow.");
    target = c.id;
  }
  return searchChat(db, { ...q, creatorId: target, limit: Math.min(q.limit, maxLimit) });
});
