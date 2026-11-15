# ChatScout

Creators search the chat of their **own** TikTok LIVE streams by keywords and users.
Typical uses are finding giveaway entries, spotting spam or scam links, seeing who
the regulars are, and reviewing moderation cases. It also offers LIVE rankings and
gifter leaderboards. It currently runs on **mock data**. A real source is connected
by implementing a single interface (see below).

## Stream analytics

- **Polls:** results per option and minute, from any public stream. Names of voters are stored only
  for verified creators' own streams and are visible only to them (same retention and erasure as chat).
- **Content tracking:** detects streams in which a creator was the topic, from a title mention
  (e.g. "Reaktion auf @x") or at least `minMentions` @-mentions in chat. It reports reach (peak viewers),
  diamonds, chat volume, and a rough sentiment score (DE/EN word list plus emoji, `src/analytics/text.ts`).
- Only counts are stored (`session_minute_stats`, `session_mentions`, `poll_vote_buckets`). Message
  texts from non-customer streams are never written. By design there is no cross-stream lookup of individual viewers.

## Privacy model

- Chat is **only stored for creators with an active key** (`api_keys.creator_id`).
  Chat from every other stream is dropped during ingest and never written.
- A key only ever sees its own creator's chat. There is no search across creators.
- Retention: chat older than `CHAT_RETENTION_DAYS` (default 30) is deleted by the cron job.
- Erasure: `DELETE /api/v1/chat/chatters/:user` removes one chatter's messages.
- **Ownership is proven with TikTok Login.** Chat is only collected and searchable for
  creators with `verified_at` set. A key that an admin binds to an unverified username
  gets no chat access.

## Quick start

```bash
npm install
npm run db:seed            # 7 days of mock history; prints a demo creator key
npm run key:create -- me pro 7 <tiktok_username>   # key bound to a creator
npm run dev
curl -G -H "x-api-key: <key>" localhost:3000/api/v1/chat/search --data-urlencode "q=giveaway -scam"
```

Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) that migrates
itself. With `DATABASE_URL` set, it uses real Postgres. Run `npm run db:migrate` once.

## Architecture

```
LiveSource.poll()  ──►  ingestEvents()  (chat filtered to opted-in creators)  ──►  Postgres  ──►  /api/v1/*  (API key + daily quota)
 (mock | connector)     batched upserts      gift_events      rankings computed with SQL
        ▲
  /api/cron/ingest (Vercel Cron, every 5 min)
```

- `src/ingest/types.ts`: normalized events (`live_start`, `gift`, `viewers`, `live_end`) and the `LiveSource` interface.
- `src/ingest/mock-source.ts`: a deterministic fake source with 12 countries and heavy-tailed gift amounts.
- `src/ingest/ingest.ts`: a bulk writer that deduplicates its input. Repeating start and end events is safe.
- `src/chat/queries.ts`: chat search using Postgres full-text search (`tsvector`, config `simple`, GIN index), chatter stats, and erasure.
- `src/rankings/`: calendar periods in UTC, league thresholds, and the ranking queries.
- `src/api/`: API keys (only the SHA-256 hash is stored), plans, and the route wrapper.

## Legal pages

`/impressum`, `/datenschutz` and `/agb` are generated from `src/legal/config.ts`. Fill in every `[...]`
placeholder. Until you do, the pages show a draft banner. The texts describe the app's real behavior
(cookies, chat retention, token revocation). They are drafts, so have a lawyer review them before launch.
Still open: payment provider details, a withdrawal notice for consumers, a DPA (AVV) for creators, and the
retention period for ranking data.

## TikTok Login

Flow: `/login`, then `/api/auth/tiktok/start` (sets a state cookie), then TikTok, then
`/api/auth/tiktok/callback`. The callback checks the state, exchanges the code, reads
`open_id` and `username`, **revokes the TikTok token immediately** (none is stored),
links the creator by `open_id` (so username changes are followed), starts a session
cookie, and redirects to `/dashboard`.

The dashboard offers chat search in the browser, a self-service 7-day trial key, and key revocation.

Setup:
1. Create an app on developers.tiktok.com and add the Login Kit product.
2. Register the redirect URI `https://<APP_URL>/api/auth/tiktok/callback` (must be https).
3. Request a scope that returns `username` (default `user.info.basic,user.info.profile`;
   override with `TIKTOK_SCOPES`). The app needs TikTok's review before it works for any account.
4. Set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `APP_URL`.

For local development without TikTok, set `ALLOW_DEV_LOGIN=1` and run `npm run dev`. The login page then shows a
username form. This form is never available in production builds.

The endpoint URLs are defaults in `src/auth/tiktok.ts` and can be overridden via env.
They were written without access to TikTok's docs, so check them against the current Login Kit docs before launch.

## Endpoints

| Endpoint | Query |
|---|---|
| `GET /api/v1/chat/search` | `q` (all words must match, prefix match, `-word` excludes), `user`, `session` (roomId), `from`, `to`, `limit`, `offset` |
| `GET /api/v1/chat/chatters` | `period`, `date`, `prefix`, `limit`, `offset`: most active chatters |
| `DELETE /api/v1/chat/chatters/:user` | erases that chatter's messages |
| `GET /api/v1/polls` | `creator`, `country`, `q` (question text), `period`, `date`, `limit`, `offset`: aggregated results |
| `GET /api/v1/polls/:pollId` | results + per-minute timeline; voter names only for the stream owner's own polls |
| `GET /api/v1/content/references` | `about` (creator talked about) and/or `by` (streamer), `minMentions` (default 3), `period`, `date` |
| `GET /api/v1/sessions/:roomId/timeline` | chat volume, sentiment and diamonds per minute, peaks, mentioned creators, polls |
| `GET /api/v1/rankings/creators` | `country`, `period` (day/week/month), `date` (YYYY-MM-DD), `category` (general/gaming), `league` (S–D), `limit`, `offset` |
| `GET /api/v1/rankings/gifters` | `country`, `period`, `date`, `creator`, `limit`, `offset` |
| `GET /api/v1/creators/:uniqueId` | `date` |
| `GET /api/v1/countries` | `period`, `date` |
| `GET /api/v1/leagues` | `period` |
| `GET /api/cron/ingest` | needs `Authorization: Bearer $CRON_SECRET` |
| `POST /api/admin/keys` | needs `Authorization: Bearer $ADMIN_TOKEN`, body `{name, plan, days, creator}` |

Plans are defined in `src/api/plans.ts` (basic/pro/business: requests per day and maximum `limit`).

## Tracking creators

Accounts with an active package can follow any public creator (`follows`, limits per plan in `src/api/plans.ts`).
Followed creators are watched by the live worker like the account's own streams. `src/live/policy.ts` decides what is stored:

| Stream | Chat, gifts, poll votes |
|---|---|
| the account's own (verified + active key) | with usernames |
| followed by an account with an active package | **per-stream pseudonyms** (`Zuschauer #a3f9`, HMAC with `PSEUDONYM_SECRET`, fallback `CRON_SECRET`) |
| anything else | chat not stored, gifters pseudonymous |

Pseudonyms are stable within one stream and unlinkable across streams, so there is no way to follow a viewer across
streams. Creators can opt out in the dashboard (`creators.no_tracking`). This deletes their follows and pseudonymous chat.
The dashboard pages `/dashboard/c/:creator` (search, streams, polls) and `/dashboard/s/:room` (timeline, polls, chat)
are only visible to the creator and their followers. In the API, use `GET /api/v1/chat/search?creator=…`.

## Real LIVE data (TikTok)

`/api/cron/live` runs every minute (Vercel Pro, `maxDuration` 300 s) when `LIVE_SOURCE` includes `tiktok`:

- It leases every **verified creator with an active key** (`live_watch` table), connects to those who are
  live via the unofficial `tiktok-live-connector` (signing by Euler Stream, free tier unless `EULER_API_KEY`
  is set) and streams chat, gifts, viewer counts, polls and stream end into the database every 3 s.
- Each tick watches for about 4.5 minutes. The next tick takes a creator over about 75 s before that ends. Overlapping
  deliveries are de-duplicated by TikTok message id (`chat_messages` / `gift_events.external_msg_id`).
- Offline creators are re-checked every 2 minutes.
- `src/live/tiktok.ts` maps the events and `src/live/runner.ts` handles leasing. Both are tested with a fake connection.

The connector is reverse-engineered and not production-ready by its authors' own account. Reading streams may
conflict with TikTok's terms.

## Deploying to Vercel

Set `DATABASE_URL` (for example a pooled Neon URL), `CRON_SECRET` and `ADMIN_TOKEN`.
PGlite does not persist on Vercel. Functions run in `lhr1` (London), next to the Supabase database (eu-west-2). A cron job that runs every 5 minutes needs a Pro plan, because Hobby only allows daily cron jobs.

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
