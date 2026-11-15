CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"plan" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"key_id" integer NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_key_id_day_pk" PRIMARY KEY("key_id","day")
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" serial PRIMARY KEY NOT NULL,
	"unique_id" text NOT NULL,
	"nickname" text NOT NULL,
	"country" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"gifter_id" integer NOT NULL,
	"gift_name" text NOT NULL,
	"diamonds" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gifters" (
	"id" serial PRIMARY KEY NOT NULL,
	"unique_id" text NOT NULL,
	"nickname" text NOT NULL,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_room_id" text NOT NULL,
	"creator_id" integer NOT NULL,
	"title" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"peak_viewers" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_events" ADD CONSTRAINT "gift_events_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_events" ADD CONSTRAINT "gift_events_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_events" ADD CONSTRAINT "gift_events_gifter_id_gifters_id_fk" FOREIGN KEY ("gifter_id") REFERENCES "public"."gifters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_unique_id_idx" ON "creators" USING btree ("unique_id");--> statement-breakpoint
CREATE INDEX "creators_country_idx" ON "creators" USING btree ("country","category");--> statement-breakpoint
CREATE INDEX "gift_events_created_idx" ON "gift_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gift_events_creator_idx" ON "gift_events" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_events_gifter_idx" ON "gift_events" USING btree ("gifter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gifters_unique_id_idx" ON "gifters" USING btree ("unique_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_room_idx" ON "live_sessions" USING btree ("external_room_id");--> statement-breakpoint
CREATE INDEX "live_sessions_creator_idx" ON "live_sessions" USING btree ("creator_id","started_at");