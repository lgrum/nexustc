CREATE TYPE "public"."xp_integrity_case_status" AS ENUM('open', 'released', 'reversed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."xp_integrity_risk_level" AS ENUM('medium', 'high');--> statement-breakpoint
CREATE TABLE "xp_integrity_case" (
	"auto_release_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_reason" text,
	"evidence" jsonb DEFAULT '{"signals":[]}'::jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"risk_level" "xp_integrity_risk_level" NOT NULL,
	"status" "xp_integrity_case_status" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_like_disqualification" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"id" text PRIMARY KEY NOT NULL,
	"integrity_case_id" text NOT NULL,
	"liker_user_id" text,
	"reason" text NOT NULL,
	"subject_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_risk_signal" (
	"device_hash" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ip_prefix_hash" text,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xp_event" ADD COLUMN "integrity_case_id" text;--> statement-breakpoint
ALTER TABLE "xp_integrity_case" ADD CONSTRAINT "xp_integrity_case_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_integrity_case" ADD CONSTRAINT "xp_integrity_case_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_like_disqualification" ADD CONSTRAINT "xp_like_disqualification_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_like_disqualification" ADD CONSTRAINT "xp_like_disqualification_integrity_case_id_xp_integrity_case_id_fk" FOREIGN KEY ("integrity_case_id") REFERENCES "public"."xp_integrity_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_like_disqualification" ADD CONSTRAINT "xp_like_disqualification_liker_user_id_user_id_fk" FOREIGN KEY ("liker_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_like_disqualification" ADD CONSTRAINT "xp_like_disqualification_subject_id_xp_reward_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."xp_reward_subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_risk_signal" ADD CONSTRAINT "xp_risk_signal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xp_integrity_case_status_risk_created_idx" ON "xp_integrity_case" USING btree ("status","risk_level","created_at");--> statement-breakpoint
CREATE INDEX "xp_integrity_case_user_id_idx" ON "xp_integrity_case" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_like_disqualification_subject_liker_unique" ON "xp_like_disqualification" USING btree ("subject_id","liker_user_id") WHERE "xp_like_disqualification"."liker_user_id" is not null;--> statement-breakpoint
CREATE INDEX "xp_like_disqualification_case_idx" ON "xp_like_disqualification" USING btree ("integrity_case_id");--> statement-breakpoint
CREATE INDEX "xp_risk_signal_expires_at_idx" ON "xp_risk_signal" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "xp_risk_signal_device_occurred_idx" ON "xp_risk_signal" USING btree ("device_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "xp_risk_signal_ip_occurred_idx" ON "xp_risk_signal" USING btree ("ip_prefix_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "xp_risk_signal_user_occurred_idx" ON "xp_risk_signal" USING btree ("user_id","occurred_at");--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_integrity_case_id_xp_integrity_case_id_fk" FOREIGN KEY ("integrity_case_id") REFERENCES "public"."xp_integrity_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_reward_block" ADD CONSTRAINT "xp_reward_block_integrity_case_fk" FOREIGN KEY ("integrity_case_id") REFERENCES "public"."xp_integrity_case"("id") ON DELETE set null ON UPDATE no action;