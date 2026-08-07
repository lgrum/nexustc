CREATE TYPE "public"."xp_event_kind" AS ENUM('comic_reading', 'review_milestone', 'comment_milestone', 'admin_adjustment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."xp_event_state" AS ENUM('pending', 'posted', 'cancelled');--> statement-breakpoint
CREATE TABLE "progression_system" (
	"activated_at" timestamp with time zone,
	"curve_version" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "progression_system_singleton_check" CHECK ("progression_system"."id" = 'account-progression')
);
--> statement-breakpoint
CREATE FUNCTION "prevent_progression_activation_change"() RETURNS trigger AS $$
BEGIN
	IF OLD."activated_at" IS NOT NULL AND NEW."activated_at" IS DISTINCT FROM OLD."activated_at" THEN
		RAISE EXCEPTION 'progression activation timestamp is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "progression_activation_immutable"
	BEFORE UPDATE OF "activated_at" ON "progression_system"
	FOR EACH ROW EXECUTE FUNCTION "prevent_progression_activation_change"();--> statement-breakpoint
CREATE TABLE "user_progression" (
	"level" smallint DEFAULT 1 NOT NULL,
	"pending_xp" integer DEFAULT 0 NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_progression_total_xp_check" CHECK ("user_progression"."total_xp" between 0 and 365000),
	CONSTRAINT "user_progression_pending_xp_check" CHECK ("user_progression"."pending_xp" >= 0),
	CONSTRAINT "user_progression_level_check" CHECK ("user_progression"."level" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "xp_event" (
	"amount" integer NOT NULL,
	"available_at" timestamp with time zone,
	"created_by" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" "xp_event_kind" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason_code" text NOT NULL,
	"reverses_event_id" text,
	"source_ref" text NOT NULL,
	"state" "xp_event_state" NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "xp_event_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "xp_event_reverses_event_id_unique" UNIQUE("reverses_event_id"),
	CONSTRAINT "xp_event_amount_check" CHECK ("xp_event"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "user_progression" ADD CONSTRAINT "user_progression_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_progression_level_idx" ON "user_progression" USING btree ("level");--> statement-breakpoint
CREATE INDEX "xp_event_user_created_idx" ON "xp_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_event_user_state_available_idx" ON "xp_event" USING btree ("user_id","state","available_at");
