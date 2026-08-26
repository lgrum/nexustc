CREATE TYPE "public"."gift_offer_history_action" AS ENUM('sent', 'accepted', 'rejected', 'cancelled', 'expired', 'administratively-cancelled');--> statement-breakpoint
CREATE TYPE "public"."gift_offer_state" AS ENUM('sent', 'accepted', 'rejected', 'cancelled', 'expired', 'administratively-cancelled');--> statement-breakpoint
ALTER TYPE "public"."collectible_ownership_event_kind" ADD VALUE 'gift';--> statement-breakpoint
CREATE TABLE "gift_offer" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"sender_confirmed_at" timestamp with time zone NOT NULL,
	"sender_user_id" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"state" "gift_offer_state" DEFAULT 'sent' NOT NULL,
	"terms_hash" text NOT NULL,
	"terminal_at" timestamp with time zone,
	"terminal_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "gift_offer_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "gift_offer_distinct_participants_check" CHECK ("gift_offer"."sender_user_id" <> "gift_offer"."recipient_user_id"),
	CONSTRAINT "gift_offer_expiry_check" CHECK ("gift_offer"."expires_at" = "gift_offer"."sent_at" + interval '7 days'),
	CONSTRAINT "gift_offer_terminal_metadata_check" CHECK ("gift_offer"."state" = 'sent' OR ("gift_offer"."terminal_at" IS NOT NULL AND length(trim(coalesce("gift_offer"."terminal_reason", ''))) > 0)),
	CONSTRAINT "gift_offer_version_check" CHECK ("gift_offer"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "gift_offer_history" (
	"action" "gift_offer_history_action" NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"from_state" "gift_offer_state",
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gift_offer_id" text NOT NULL,
	"source" text NOT NULL,
	"terms_hash" text NOT NULL,
	"to_state" "gift_offer_state" NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "gift_offer_history_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "gift_offer_history_version_check" CHECK ("gift_offer_history"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "collectible_custody" ALTER COLUMN "trade_offer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD COLUMN "gift_offer_id" text;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD COLUMN "inbound_gifts_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer_history" ADD CONSTRAINT "gift_offer_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer_history" ADD CONSTRAINT "gift_offer_history_gift_offer_id_gift_offer_id_fk" FOREIGN KEY ("gift_offer_id") REFERENCES "public"."gift_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_offer_sender_state_sent_idx" ON "gift_offer" USING btree ("sender_user_id","state","sent_at","id");--> statement-breakpoint
CREATE INDEX "gift_offer_recipient_state_sent_idx" ON "gift_offer" USING btree ("recipient_user_id","state","sent_at","id");--> statement-breakpoint
CREATE INDEX "gift_offer_expiry_idx" ON "gift_offer" USING btree ("state","expires_at","id");--> statement-breakpoint
CREATE INDEX "gift_offer_history_offer_created_idx" ON "gift_offer_history" USING btree ("gift_offer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "gift_offer_history_actor_created_idx" ON "gift_offer_history" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_gift_offer_id_gift_offer_id_fk" FOREIGN KEY ("gift_offer_id") REFERENCES "public"."gift_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collectible_custody_gift_offer_idx" ON "collectible_custody" USING btree ("gift_offer_id","created_at","id");--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_one_parent_check" CHECK (("collectible_custody"."trade_offer_id" IS NOT NULL) <> ("collectible_custody"."gift_offer_id" IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION "prevent_gift_offer_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Gift Offer history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "gift_offer_history_append_only"
BEFORE UPDATE OR DELETE ON "gift_offer_history"
FOR EACH ROW EXECUTE FUNCTION "prevent_gift_offer_history_mutation"();
--> statement-breakpoint
CREATE FUNCTION "prevent_gift_offer_terms_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."actor_user_id" IS DISTINCT FROM OLD."actor_user_id"
    OR NEW."sender_user_id" IS DISTINCT FROM OLD."sender_user_id"
    OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
    OR NEW."sent_at" IS DISTINCT FROM OLD."sent_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."sender_confirmed_at" IS DISTINCT FROM OLD."sender_confirmed_at"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."terms_hash" IS DISTINCT FROM OLD."terms_hash"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."source" IS DISTINCT FROM OLD."source"
  THEN
    RAISE EXCEPTION 'Sent Gift Offer terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "gift_offer_terms_immutable"
BEFORE UPDATE ON "gift_offer"
FOR EACH ROW EXECUTE FUNCTION "prevent_gift_offer_terms_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_collectible_custody_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW."card_instance_id" IS DISTINCT FROM OLD."card_instance_id"
    OR NEW."pack_instance_id" IS DISTINCT FROM OLD."pack_instance_id"
    OR NEW."trade_offer_id" IS DISTINCT FROM OLD."trade_offer_id"
    OR NEW."gift_offer_id" IS DISTINCT FROM OLD."gift_offer_id"
    OR NEW."side" IS DISTINCT FROM OLD."side"
    OR NEW."acquired_at" IS DISTINCT FROM OLD."acquired_at"
  THEN
    RAISE EXCEPTION 'Collectible custody identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
