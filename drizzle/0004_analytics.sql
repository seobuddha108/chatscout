CREATE TABLE "poll_vote_buckets" (
	"poll_id" integer NOT NULL,
	"option_id" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "poll_vote_buckets_poll_id_option_id_minute_pk" PRIMARY KEY("poll_id","option_id","minute")
);
--> statement-breakpoint
CREATE TABLE "poll_voters" (
	"poll_id" integer NOT NULL,
	"voter_unique_id" text NOT NULL,
	"voter_nickname" text NOT NULL,
	"option_id" text NOT NULL,
	"voted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "poll_voters_poll_id_voter_unique_id_pk" PRIMARY KEY("poll_id","voter_unique_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_poll_id" text NOT NULL,
	"session_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_mentions" (
	"session_id" integer NOT NULL,
	"mentioned_creator_id" integer NOT NULL,
	"mentions" integer NOT NULL,
	"positive" integer NOT NULL,
	"negative" integer NOT NULL,
	"in_title" boolean DEFAULT false NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_mentions_session_id_mentioned_creator_id_pk" PRIMARY KEY("session_id","mentioned_creator_id")
);
--> statement-breakpoint
CREATE TABLE "session_minute_stats" (
	"session_id" integer NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"messages" integer NOT NULL,
	"positive" integer NOT NULL,
	"negative" integer NOT NULL,
	CONSTRAINT "session_minute_stats_session_id_minute_pk" PRIMARY KEY("session_id","minute")
);
--> statement-breakpoint
ALTER TABLE "poll_vote_buckets" ADD CONSTRAINT "poll_vote_buckets_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_voters" ADD CONSTRAINT "poll_voters_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_mentions" ADD CONSTRAINT "session_mentions_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_mentions" ADD CONSTRAINT "session_mentions_mentioned_creator_id_creators_id_fk" FOREIGN KEY ("mentioned_creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_minute_stats" ADD CONSTRAINT "session_minute_stats_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "polls_external_idx" ON "polls" USING btree ("external_poll_id");--> statement-breakpoint
CREATE INDEX "polls_creator_idx" ON "polls" USING btree ("creator_id","started_at");--> statement-breakpoint
CREATE INDEX "session_mentions_mentioned_idx" ON "session_mentions" USING btree ("mentioned_creator_id");--> statement-breakpoint
ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_vote_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_voters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_minute_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_mentions" ENABLE ROW LEVEL SECURITY;
