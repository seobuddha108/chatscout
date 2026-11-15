import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { DB } from "@/db";
import { creators, webSessions } from "@/db/schema";

export const SESSION_COOKIE = "cs_session";
export const STATE_COOKIE = "cs_oauth_state";
const SESSION_DAYS = 30;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const cookieBase = () => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/",
});

export async function createSession(db: DB, creatorId: number, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(webSessions).values({ tokenHash: hash(token), creatorId, expiresAt });
  return { token, expiresAt };
}

export async function creatorForSession(db: DB, token: string | undefined, now = new Date()) {
  if (!token) return null;
  const [row] = await db.select({
    id: creators.id, uniqueId: creators.uniqueId, nickname: creators.nickname,
    avatarUrl: creators.avatarUrl, verifiedAt: creators.verifiedAt,
  }).from(webSessions).innerJoin(creators, eq(creators.id, webSessions.creatorId))
    .where(and(eq(webSessions.tokenHash, hash(token)), gt(webSessions.expiresAt, now))).limit(1);
  return row ?? null;
}

export async function destroySession(db: DB, token: string | undefined) {
  if (token) await db.delete(webSessions).where(eq(webSessions.tokenHash, hash(token)));
}
