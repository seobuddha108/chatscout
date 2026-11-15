import { getDb } from "../src/db";
import { createApiKey } from "../src/api/keys";
import { linkTikTokAccount } from "../src/auth/link";
import { ingestEvents, runIngest } from "../src/ingest/ingest";
import { MockSource } from "../src/ingest/mock-source";

// Usage: npm run db:seed [-- days]
const days = Number(process.argv[2] ?? 7);
const db = await getDb();
const source = new MockSource();
const now = new Date();

// Opt in the first creator so their chat gets stored (others' chat is dropped).
// Verified with the same fake open_id the local dev login uses, so you can log in as them.
// The most popular German creator, so the demo also shows reaction streams about them.
const demo = [...source.creators].filter((c) => c.country === "DE").sort((a, b) => b.popularity - a.popularity)[0].uniqueId;
const { key } = await createApiKey(db, { name: "demo creator", plan: "pro", creator: demo });
await linkTikTokAccount(db, { openId: `dev:${demo}`, username: demo, displayName: demo, avatarUrl: null });
console.log(`Demo creator @${demo} (dev login), API key: ${key}`);

const t0 = Date.now();
const history = source.history(days, now);
const res = await ingestEvents(db, history);
console.log(`History: ${history.length} events over ${days} days`, res);
// Put some creators live right now.
console.log("Live tick:", await runIngest(db, source, now));
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
