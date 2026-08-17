CREATE TYPE "public"."collectible_custody_side" AS ENUM('proposer', 'recipient');--> statement-breakpoint
CREATE TYPE "public"."trade_offer_history_action" AS ENUM('sent', 'accepted', 'rejected', 'cancelled', 'expired', 'administratively-cancelled', 'counteroffer');--> statement-breakpoint
CREATE TYPE "public"."trade_offer_state" AS ENUM('sent', 'accepted', 'rejected', 'cancelled', 'expired', 'administratively-cancelled');--> statement-breakpoint
ALTER TYPE "public"."collectible_ownership_event_kind" ADD VALUE 'trade';--> statement-breakpoint
CREATE TABLE "collectible_custody" (
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"card_instance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"pack_instance_id" text,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"side" "collectible_custody_side" NOT NULL,
	"trade_offer_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collectible_custody_one_asset_check" CHECK (("collectible_custody"."card_instance_id" IS NOT NULL) <> ("collectible_custody"."pack_instance_id" IS NOT NULL)),
	CONSTRAINT "collectible_custody_release_reason_check" CHECK ("collectible_custody"."released_at" IS NULL OR length(trim(coalesce("collectible_custody"."release_reason", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "trade_offer" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"proposer_confirmed_at" timestamp with time zone NOT NULL,
	"proposer_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"state" "trade_offer_state" DEFAULT 'sent' NOT NULL,
	"terms_hash" text NOT NULL,
	"terminal_at" timestamp with time zone,
	"terminal_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trade_offer_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "trade_offer_distinct_participants_check" CHECK ("trade_offer"."proposer_user_id" <> "trade_offer"."recipient_user_id"),
	CONSTRAINT "trade_offer_expiry_check" CHECK ("trade_offer"."expires_at" = "trade_offer"."sent_at" + interval '7 days'),
	CONSTRAINT "trade_offer_terminal_metadata_check" CHECK ("trade_offer"."state" = 'sent' OR ("trade_offer"."terminal_at" IS NOT NULL AND length(trim(coalesce("trade_offer"."terminal_reason", ''))) > 0)),
	CONSTRAINT "trade_offer_version_check" CHECK ("trade_offer"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "trade_offer_history" (
	"action" "trade_offer_history_action" NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"from_state" "trade_offer_state",
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"offer_id" text NOT NULL,
	"source" text NOT NULL,
	"terms_hash" text NOT NULL,
	"to_state" "trade_offer_state" NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "trade_offer_history_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "trade_offer_history_version_check" CHECK ("trade_offer_history"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_block" (
	"blocked_user_id" text NOT NULL,
	"blocker_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_block_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id"),
	CONSTRAINT "user_block_distinct_users_check" CHECK ("user_block"."blocker_user_id" <> "user_block"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "profile_settings" ADD COLUMN "inbound_trades_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_card_instance_id_card_instance_id_fk" FOREIGN KEY ("card_instance_id") REFERENCES "public"."card_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_trade_offer_id_trade_offer_id_fk" FOREIGN KEY ("trade_offer_id") REFERENCES "public"."trade_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_proposer_user_id_user_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer_history" ADD CONSTRAINT "trade_offer_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer_history" ADD CONSTRAINT "trade_offer_history_offer_id_trade_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trade_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_user_id_user_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collectible_custody_active_card_unique" ON "collectible_custody" USING btree ("card_instance_id") WHERE "collectible_custody"."released_at" IS NULL AND "collectible_custody"."card_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "collectible_custody_active_pack_unique" ON "collectible_custody" USING btree ("pack_instance_id") WHERE "collectible_custody"."released_at" IS NULL AND "collectible_custody"."pack_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "collectible_custody_active_trade_side_unique" ON "collectible_custody" USING btree ("trade_offer_id","side") WHERE "collectible_custody"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "collectible_custody_trade_offer_idx" ON "collectible_custody" USING btree ("trade_offer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_custody_released_at_idx" ON "collectible_custody" USING btree ("released_at","created_at","id");--> statement-breakpoint
CREATE INDEX "trade_offer_proposer_state_sent_idx" ON "trade_offer" USING btree ("proposer_user_id","state","sent_at","id");--> statement-breakpoint
CREATE INDEX "trade_offer_recipient_state_sent_idx" ON "trade_offer" USING btree ("recipient_user_id","state","sent_at","id");--> statement-breakpoint
CREATE INDEX "trade_offer_expiry_idx" ON "trade_offer" USING btree ("state","expires_at","id");--> statement-breakpoint
CREATE INDEX "trade_offer_history_offer_created_idx" ON "trade_offer_history" USING btree ("offer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "trade_offer_history_actor_created_idx" ON "trade_offer_history" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "user_block_blocked_user_idx" ON "user_block" USING btree ("blocked_user_id");
--> statement-breakpoint
CREATE FUNCTION "prevent_trade_offer_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Trade Offer history is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trade_offer_history_append_only"
BEFORE UPDATE OR DELETE ON "trade_offer_history"
FOR EACH ROW EXECUTE FUNCTION "prevent_trade_offer_history_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_trade_offer_terms_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."actor_user_id" IS DISTINCT FROM OLD."actor_user_id"
    OR NEW."proposer_user_id" IS DISTINCT FROM OLD."proposer_user_id"
    OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
    OR NEW."sent_at" IS DISTINCT FROM OLD."sent_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."proposer_confirmed_at" IS DISTINCT FROM OLD."proposer_confirmed_at"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."terms_hash" IS DISTINCT FROM OLD."terms_hash"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."source" IS DISTINCT FROM OLD."source"
  THEN
    RAISE EXCEPTION 'Sent Trade Offer terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trade_offer_terms_immutable"
BEFORE UPDATE ON "trade_offer"
FOR EACH ROW EXECUTE FUNCTION "prevent_trade_offer_terms_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_collectible_custody_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW."card_instance_id" IS DISTINCT FROM OLD."card_instance_id"
    OR NEW."pack_instance_id" IS DISTINCT FROM OLD."pack_instance_id"
    OR NEW."trade_offer_id" IS DISTINCT FROM OLD."trade_offer_id"
    OR NEW."side" IS DISTINCT FROM OLD."side"
    OR NEW."acquired_at" IS DISTINCT FROM OLD."acquired_at"
  THEN
    RAISE EXCEPTION 'Collectible custody identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "collectible_custody_identity_immutable"
BEFORE UPDATE OR DELETE ON "collectible_custody"
FOR EACH ROW EXECUTE FUNCTION "prevent_collectible_custody_history_mutation"();
