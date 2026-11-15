import { z } from "zod";
import { apiRoute, needsCreator } from "@/api/handler";
import { deleteChatterMessages } from "@/chat/queries";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/chat/chatters/:user — erase one chatter's messages (e.g. GDPR request). */
export const DELETE = apiRoute(z.object({}), async ({ db, creatorId }, params: { user: string }) => {
  if (creatorId === null) return needsCreator();
  return { deleted: await deleteChatterMessages(db, creatorId, decodeURIComponent(params.user)) };
});
