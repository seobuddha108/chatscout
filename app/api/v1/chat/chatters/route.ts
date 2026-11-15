import { z } from "zod";
import { apiRoute, dateSchema, needsCreator, pageSchema, periodSchema } from "@/api/handler";
import { topChatters } from "@/chat/queries";
import { periodWindow } from "@/rankings/periods";

export const dynamic = "force-dynamic";

const schema = z.object({ period: periodSchema, date: dateSchema, prefix: z.string().max(64).optional(), ...pageSchema });

/** GET /api/v1/chat/chatters?period=week&prefix=max — most active chatters in your streams. */
export const GET = apiRoute(schema, async ({ db, query: q, creatorId, maxLimit }) => {
  if (creatorId === null) return needsCreator();
  const { from, to } = periodWindow(q.period, q.date);
  return { period: q.period, from, to, ...(await topChatters(db, { ...q, creatorId, from, to, limit: Math.min(q.limit, maxLimit) })) };
});
