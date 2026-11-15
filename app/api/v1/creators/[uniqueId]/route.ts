import { z } from "zod";
import { apiRoute, dateSchema } from "@/api/handler";
import { creatorProfile } from "@/rankings/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/creators/:uniqueId — totals, country rank, league, recent sessions, top gifters. */
export const GET = apiRoute(z.object({ date: dateSchema }), ({ db, query }, params: { uniqueId: string }) =>
  creatorProfile(db, decodeURIComponent(params.uniqueId), query.date));
