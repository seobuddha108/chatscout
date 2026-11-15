import { z } from "zod";
import { apiRoute } from "@/api/handler";
import { pollDetail } from "@/analytics/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/polls/:pollId — results + timeline; voter names only for the stream owner's own polls. */
export const GET = apiRoute(z.object({}), ({ db, creatorId }, params: { pollId: string }) =>
  pollDetail(db, decodeURIComponent(params.pollId), creatorId));
