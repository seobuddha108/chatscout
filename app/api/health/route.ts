import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { json } from "@/api/handler";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
