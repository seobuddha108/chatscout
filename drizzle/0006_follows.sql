CREATE TABLE "follows" (
	"follower_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_creator_id_pk" PRIMARY KEY("follower_id","creator_id")
);
--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "no_tracking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_creators_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_creator_idx" ON "follows" USING btree ("creator_id");--> statement-breakpoint
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;
