import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { authenticate } from "./keys";
import { PLANS, type Plan } from "./plans";

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export const errorJson = (status: number, error: string, extra: object = {}) => json({ error, ...extra }, status);

interface Ctx<Q> { db: DB; query: Q; plan: Plan; creatorId: number | null; maxLimit: number; req: Request }

/** Wraps a v1 route: API key auth + quota, query validation, uniform errors. */
/** Chat endpoints need a key that is bound to a creator account. */
export const needsCreator = () =>
  errorJson(403, "This key is not linked to a creator account. Chat search only works for your own streams.");

export function apiRoute<S extends z.ZodType, P = unknown>(
  schema: S,
  handler: (ctx: Ctx<z.infer<S>>, params: P) => Promise<unknown>,
) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    try {
      const db = await getDb();
      const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
      const auth = await authenticate(db, raw);
      if (!auth.ok) return errorJson(auth.status, auth.error);
      const rate = {
        "x-ratelimit-limit": String(auth.limit),
        "x-ratelimit-remaining": String(auth.remaining),
        "x-key-expires-at": auth.expiresAt.toISOString(),
      };

      const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
      if (!parsed.success) {
        return json({ error: "Invalid query parameters.", issues: z.flattenError(parsed.error).fieldErrors }, 400, rate);
      }
      const maxLimit = PLANS[auth.plan].maxLimit;
      const params = (await routeCtx?.params) as P;
      const data = await handler({ db, query: parsed.data, plan: auth.plan, creatorId: auth.creatorId, maxLimit, req }, params);
      if (data === null) return json({ error: "Not found." }, 404, rate);
      if (data instanceof Response) {
        for (const [k, v] of Object.entries(rate)) data.headers.set(k, v);
        return data;
      }
      return json({ data }, 200, rate);
    } catch (err) {
      console.error(err);
      return errorJson(500, "Internal error.");
    }
  };
}

/** Constant-time check of "Authorization: Bearer <secret>". */
export function hasBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

// Shared query schemas
export const periodSchema = z.enum(["day", "week", "month"]).default("day");
export const countrySchema = z.string().regex(/^[A-Za-z]{2}$/, "ISO 3166-1 alpha-2 code").transform((s) => s.toUpperCase()).optional();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").transform((s) => new Date(`${s}T12:00:00Z`)).optional();
export const pageSchema = {
  limit: z.coerce.number().int().min(1).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
};
