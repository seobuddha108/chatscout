import { z } from "zod";
import { apiRoute } from "@/api/handler";
import { sessionTimeline } from "@/analytics/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/sessions/:roomId/timeline — chat volume, sentiment, diamonds per minute; mentions; polls. */
export const GET = apiRoute(z.object({}), ({ db }, params: { roomId: string }) =>
  sessionTimeline(db, decodeURIComponent(params.roomId)));
