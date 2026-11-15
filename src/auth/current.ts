import { cookies } from "next/headers";
import { getDb } from "@/db";
import { SESSION_COOKIE, creatorForSession } from "./session";

/** The logged-in creator for the current request (server components / actions only). */
export async function currentCreator() {
  // Read the cookie first: it marks the route as dynamic and avoids a DB call for anonymous visitors.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return creatorForSession(await getDb(), token);
}
