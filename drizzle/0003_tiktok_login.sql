CREATE TABLE "web_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"creator_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "tiktok_open_id" text;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "web_sessions_token_idx" ON "web_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_tiktok_open_id_idx" ON "creators" USING btree ("tiktok_open_id");--> statement-breakpoint
ALTER TABLE "web_sessions" ENABLE ROW LEVEL SECURITY;
