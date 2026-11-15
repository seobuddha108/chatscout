import { migrateConfiguredDb } from "../src/db";

await migrateConfiguredDb();
console.log("Migrations applied.");
process.exit(0);
