import { getDb } from "../src/db";
import { ingestEvents, runIngest } from "../src/ingest/ingest";
import { MockSource } from "../src/ingest/mock-source";

// Usage: npm run db:seed [-- days]
const days = Number(process.argv[2] ?? 7);
const db = await getDb();
const source = new MockSource();
const now = new Date();

const t0 = Date.now();
const history = source.history(days, now);
const res = await ingestEvents(db, history);
console.log(`History: ${history.length} events over ${days} days`, res);
// Put some creators live right now.
console.log("Live tick:", await runIngest(db, source, now));
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
