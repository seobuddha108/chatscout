import { z } from "zod";
import { getDb } from "@/db";
import { errorJson, hasBearer, json } from "@/api/handler";
import { createApiKey } from "@/api/keys";

export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(["basic", "pro", "business"]),
  days: z.number().int().min(1).max(365).default(7),
});

/** POST /api/admin/keys {name, plan, days} — later called by the payment webhook. */
export async function POST(req: Request) {
  if (!hasBearer(req, process.env.ADMIN_TOKEN)) return errorJson(401, "Unauthorized.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "Invalid body.", { issues: z.flattenError(parsed.error).fieldErrors });
  const key = await createApiKey(await getDb(), parsed.data);
  return json(key, 201);
}
