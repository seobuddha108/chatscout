# Live Rankings API

Data pipeline and REST API for LIVE creator rankings, leagues and gifter
leaderboards per country. It currently runs on **mock data**. A real source is
connected by implementing a single interface (see below).

## Quick start

```bash
npm install
npm run db:seed            # 7 days of mock history, stored in ./.data/pglite
npm run key:create -- me pro 7
npm run dev
curl -H "Authorization: Bearer <key>" "localhost:3000/api/v1/rankings/creators?country=DE&period=week"
```

Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) that migrates
itself. With `DATABASE_URL` set, it uses real Postgres. Run `npm run db:migrate` once.

## Architecture

```
LiveSource.poll()  ──►  ingestEvents()  ──►  Postgres  ──►  /api/v1/*  (API key + daily quota)
 (mock | connector)     batched upserts      gift_events      rankings computed with SQL
        ▲
  /api/cron/ingest (Vercel Cron, every 5 min)
```

- `src/ingest/types.ts`: normalized events (`live_start`, `gift`, `viewers`, `live_end`) and the `LiveSource` interface.
- `src/ingest/mock-source.ts`: a deterministic fake source with 12 countries and heavy-tailed gift amounts.
- `src/ingest/ingest.ts`: a bulk writer that deduplicates its input. Repeating start and end events is safe.
- `src/rankings/`: calendar periods in UTC, league thresholds, and the ranking queries.
- `src/api/`: API keys (only the SHA-256 hash is stored), plans, and the route wrapper.

## Endpoints

| Endpoint | Query |
|---|---|
| `GET /api/v1/rankings/creators` | `country`, `period` (day/week/month), `date` (YYYY-MM-DD), `category` (general/gaming), `league` (S–D), `limit`, `offset` |
| `GET /api/v1/rankings/gifters` | `country`, `period`, `date`, `creator`, `limit`, `offset` |
| `GET /api/v1/creators/:uniqueId` | `date` |
| `GET /api/v1/countries` | `period`, `date` |
| `GET /api/v1/leagues` | `period` |
| `GET /api/cron/ingest` | needs `Authorization: Bearer $CRON_SECRET` |
| `POST /api/admin/keys` | needs `Authorization: Bearer $ADMIN_TOKEN`, body `{name, plan, days}` |

Plans are defined in `src/api/plans.ts` (basic/pro/business: requests per day and maximum `limit`).

## Connecting real data

Implement `LiveSource` in `src/ingest/`, then register it in `sourceFromEnv()`.
WebSocket connectors are push-based and need a long-running worker that buffers
events and calls `ingestEvents()`. They do not fit serverless cron. Check the
platform's terms of service before scraping.

## Deploying to Vercel

Set `DATABASE_URL` (for example a pooled Neon URL), `CRON_SECRET` and `ADMIN_TOKEN`.
PGlite does not persist on Vercel. A cron job that runs every 5 minutes needs a Pro plan, because Hobby only allows daily cron jobs.

## Supabase

1. Create a project. Under **Connect**, copy two connection strings:
   - **Transaction pooler** (port 6543): set as `DATABASE_URL` for the app and Vercel.
   - **Session pooler / Direct** (port 5432): set as `DIRECT_URL` for migrations.
2. Run `DIRECT_URL=... npm run db:migrate` once.
3. Row Level Security is enabled on every table with no policies (migration 0001). The
   Supabase Data API therefore exposes nothing, including `api_keys`. The app's own
   connection uses the `postgres` role and is not affected by RLS.
4. Optional: trigger the ingest from inside Supabase instead of Vercel Cron, so it also runs every 5 minutes on Vercel Hobby.
   Enable the `pg_cron` and `pg_net` extensions, then run:
   ```sql
   select cron.schedule('ingest', '*/5 * * * *', $$
     select net.http_get(
       url := 'https://<your-app>.vercel.app/api/cron/ingest',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
   $$);
   ```
   Then remove the `crons` entry from `vercel.json`.
