CREATE TABLE "live_watch" (
	"creator_id" integer PRIMARY KEY NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_live_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "external_msg_id" text;--> statement-breakpoint
ALTER TABLE "gift_events" ADD COLUMN "external_msg_id" text;--> statement-breakpoint
ALTER TABLE "live_watch" ADD CONSTRAINT "live_watch_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_msg_idx" ON "chat_messages" USING btree ("session_id","external_msg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_events_msg_idx" ON "gift_events" USING btree ("session_id","external_msg_id");--> statement-breakpoint
ALTER TABLE "live_watch" ENABLE ROW LEVEL SECURITY;
