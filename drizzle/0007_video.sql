CREATE TABLE "recording_segments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"segment_key" text NOT NULL,
	"seq" integer NOT NULL,
	"duration" real NOT NULL,
	"program_time" timestamp with time zone,
	"captured_at" timestamp with time zone NOT NULL,
	"storage_path" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "record_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recording_segments" ADD CONSTRAINT "recording_segments_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recording_segments_key_idx" ON "recording_segments" USING btree ("session_id","segment_key");--> statement-breakpoint
CREATE INDEX "recording_segments_time_idx" ON "recording_segments" USING btree ("session_id","captured_at");--> statement-breakpoint
ALTER TABLE "recording_segments" ENABLE ROW LEVEL SECURITY;
