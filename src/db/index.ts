import type { PgDatabase } from "drizzle-orm/pg-core";
import path from "node:path";
import * as schema from "./schema";

// Both drivers (postgres-js in production, PGlite locally/in tests) share this type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<any, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __db?: Promise<DB> };

/** Returns a process-wide database handle. */
export function getDb(): Promise<DB> {
  g.__db ??= connect();
  return g.__db;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false keeps it compatible with transaction-mode poolers (Neon, Supabase).
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzle({ client, schema }) as unknown as DB;
  }
  // On Vercel the filesystem is read-only and ephemeral: a real database is required.
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add your Supabase pooler URL in the Vercel project settings.");
  // No DATABASE_URL: embedded Postgres (PGlite), auto-migrated.
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  return createPgliteDb(dir);
}

/** Creates a migrated PGlite database. Use "memory://" for an in-memory one. */
export async function createPgliteDb(dataDir: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!dataDir.includes("://")) (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

/** Applies migrations to the configured database (used by `npm run db:migrate`). */
export async function migrateConfiguredDb(): Promise<void> {
  // DIRECT_URL: a non-pooled connection (e.g. Supabase port 5432) for DDL; falls back to DATABASE_URL.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    await getDb(); // PGlite migrates on connect
    return;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS });
  await client.end();
}

export { schema };
