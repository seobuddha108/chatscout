CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"chatter_unique_id" text NOT NULL,
	"chatter_nickname" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED
);
--> statement-breakpoint
ALTER TABLE "creators" ALTER COLUMN "country" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "creator_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_creator_time_idx" ON "chat_messages" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_creator_chatter_idx" ON "chat_messages" USING btree ("creator_id","chatter_unique_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_tsv_idx" ON "chat_messages" USING gin ("tsv");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
