import { migrateConfiguredDb } from "../src/db";

// On Vercel this runs before every build. Skip (don't fail) until the database is configured.
if (process.env.VERCEL && !process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  console.warn("No DIRECT_URL/DATABASE_URL set: skipping migrations.");
  process.exit(0);
}
await migrateConfiguredDb();
console.log("Migrations applied.");
process.exit(0);
