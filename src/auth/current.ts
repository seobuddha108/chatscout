import { cookies } from "next/headers";
import { getDb } from "@/db";
import { SESSION_COOKIE, creatorForSession } from "./session";

/** The logged-in creator for the current request (server components / actions only). */
export async function currentCreator() {
  return creatorForSession(await getDb(), (await cookies()).get(SESSION_COOKIE)?.value);
}
