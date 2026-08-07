CREATE TYPE "public"."xp_reward_block_kind" AS ENUM('review', 'comment', 'comic');--> statement-breakpoint
CREATE TYPE "public"."xp_reward_deletion_reason" AS ENUM('voluntary', 'guideline_abuse', 'parent_removed');--> statement-breakpoint
CREATE TYPE "public"."xp_reward_subject_kind" AS ENUM('review', 'comment');--> statement-breakpoint
CREATE TABLE "xp_reward_block" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"id" text PRIMARY KEY NOT NULL,
	"integrity_case_id" text,
	"kind" "xp_reward_block_kind" NOT NULL,
	"reason" text NOT NULL,
	"scope_key" text NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "xp_reward_subject" (
	"created_at" timestamp with time zone NOT NULL,
	"daily_cap_eligible" boolean NOT NULL,
	"deleted_at" timestamp with time zone,
	"deletion_reason" "xp_reward_deletion_reason",
	"entity_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"kind" "xp_reward_subject_kind" NOT NULL,
	"normalized_content_hash" text NOT NULL,
	"parent_post_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xp_event" ADD COLUMN "milestone" integer;--> statement-breakpoint
ALTER TABLE "xp_event" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "xp_reward_block" ADD CONSTRAINT "xp_reward_block_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_reward_block" ADD CONSTRAINT "xp_reward_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_reward_subject" ADD CONSTRAINT "xp_reward_subject_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_reward_block_user_kind_scope_unique" ON "xp_reward_block" USING btree ("user_id","kind","scope_key") WHERE "xp_reward_block"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_reward_subject_kind_entity_unique" ON "xp_reward_subject" USING btree ("kind","entity_id");--> statement-breakpoint
CREATE INDEX "xp_reward_subject_user_kind_hash_idx" ON "xp_reward_subject" USING btree ("user_id","kind","normalized_content_hash");--> statement-breakpoint
CREATE INDEX "xp_reward_subject_user_created_idx" ON "xp_reward_subject" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_subject_id_xp_reward_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."xp_reward_subject"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_reversal_fk" FOREIGN KEY ("reverses_event_id") REFERENCES "public"."xp_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xp_event_subject_idx" ON "xp_event" USING btree ("subject_id");