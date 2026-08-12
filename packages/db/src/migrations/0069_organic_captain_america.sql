CREATE TYPE "public"."streak_discovery_action_kind" AS ENUM('bookmark', 'follow', 'rating');--> statement-breakpoint
CREATE TYPE "public"."streak_protection_kind" AS ENUM('outage', 'pause');--> statement-breakpoint
ALTER TYPE "public"."xp_event_kind" ADD VALUE 'streak_day' BEFORE 'admin_adjustment';--> statement-breakpoint
ALTER TYPE "public"."xp_event_kind" ADD VALUE 'streak_challenge' BEFORE 'admin_adjustment';--> statement-breakpoint
CREATE TABLE "streak_discovery_receipt" (
	"action_kind" "streak_discovery_action_kind" NOT NULL,
	"content_key" text NOT NULL,
	"day_key" text NOT NULL,
	"used_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "streak_discovery_receipt_user_action_content_pk" PRIMARY KEY("user_id","action_kind","content_key")
);
--> statement-breakpoint
CREATE TABLE "streak_protection_window" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"ends_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"kind" "streak_protection_kind" NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	CONSTRAINT "streak_protection_window_bounds_check" CHECK ("streak_protection_window"."ends_at" > "streak_protection_window"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "user_streak" (
	"best_streak" integer DEFAULT 0 NOT NULL,
	"challenge_completed_at" timestamp with time zone,
	"challenge_completed_day_key" text,
	"challenge_selected_at" timestamp with time zone,
	"challenge_target" integer,
	"current_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_evidence_day_key" text,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"last_completed_at" timestamp with time zone,
	"last_completed_day_key" text,
	"last_completed_local_date" date,
	"pending_timezone" text,
	"timezone" text NOT NULL,
	"timezone_change_available_at" timestamp with time zone,
	"timezone_change_effective_at" timestamp with time zone,
	"timezone_version" integer DEFAULT 1 NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_streak_current_check" CHECK ("user_streak"."current_streak" >= 0),
	CONSTRAINT "user_streak_best_check" CHECK ("user_streak"."best_streak" >= 0),
	CONSTRAINT "user_streak_challenge_target_check" CHECK ("user_streak"."challenge_target" is null or "user_streak"."challenge_target" in (10, 20, 30))
);
--> statement-breakpoint
ALTER TABLE "profile_settings" ALTER COLUMN "visibility_config" SET DEFAULT '{"favorites": true, "reviews": true, "reserved": {}, "streak": false}'::jsonb;--> statement-breakpoint
ALTER TABLE "streak_discovery_receipt" ADD CONSTRAINT "streak_discovery_receipt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_protection_window" ADD CONSTRAINT "streak_protection_window_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streak" ADD CONSTRAINT "user_streak_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "streak_protection_window_deadline_idx" ON "streak_protection_window" USING btree ("ends_at","starts_at");