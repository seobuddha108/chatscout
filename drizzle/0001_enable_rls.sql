-- Supabase exposes the public schema through its Data API (anon/authenticated roles).
-- RLS without policies blocks that access entirely; the app's own connection
-- (postgres role / table owner) bypasses RLS. Harmless on plain Postgres.
ALTER TABLE "creators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gifters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "live_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gift_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_usage" ENABLE ROW LEVEL SECURITY;
