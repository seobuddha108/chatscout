import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE, destroySession } from "@/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await destroySession(await getDb(), (await cookies()).get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
