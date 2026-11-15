import { getDb } from "../src/db";
import { createApiKey } from "../src/api/keys";
import { isPlan } from "../src/api/plans";

// Usage: npm run key:create -- <name> [plan=basic] [days=7] [creatorUsername]
const [name = "dev", plan = "basic", days = "7", creator] = process.argv.slice(2);
if (!isPlan(plan)) throw new Error(`Unknown plan "${plan}"`);
const key = await createApiKey(await getDb(), { name, plan, days: Number(days), creator });
console.log(key);
process.exit(0);
