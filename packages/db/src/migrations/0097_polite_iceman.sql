ALTER TYPE "public"."collectible_ownership_event_kind" ADD VALUE 'pseudonymization' BEFORE 'issuance';--> statement-breakpoint
ALTER TABLE "card_instance" DROP CONSTRAINT "card_instance_exclusive_location_check";--> statement-breakpoint
ALTER TABLE "gift_offer" DROP CONSTRAINT "gift_offer_distinct_participants_check";--> statement-breakpoint
ALTER TABLE "trade_offer" DROP CONSTRAINT "trade_offer_distinct_participants_check";--> statement-breakpoint
ALTER TABLE "black_market_listing" DROP CONSTRAINT "black_market_listing_seller_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "black_market_sale" DROP CONSTRAINT "black_market_sale_buyer_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "black_market_sale" DROP CONSTRAINT "black_market_sale_seller_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gachapon_activation" DROP CONSTRAINT "gachapon_activation_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gachapon_machine_usage" DROP CONSTRAINT "gachapon_machine_usage_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_offer" DROP CONSTRAINT "gift_offer_actor_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_offer" DROP CONSTRAINT "gift_offer_recipient_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_offer" DROP CONSTRAINT "gift_offer_sender_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "gift_offer_history" DROP CONSTRAINT "gift_offer_history_actor_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_usage" DROP CONSTRAINT "official_card_shop_offer_usage_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" DROP CONSTRAINT "official_card_shop_purchase_buyer_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_offer" DROP CONSTRAINT "trade_offer_actor_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_offer" DROP CONSTRAINT "trade_offer_proposer_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_offer" DROP CONSTRAINT "trade_offer_recipient_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_offer_history" DROP CONSTRAINT "trade_offer_history_actor_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "black_market_listing" ALTER COLUMN "seller_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "black_market_sale" ALTER COLUMN "buyer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "black_market_sale" ALTER COLUMN "seller_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_offer" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_offer" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_offer" ALTER COLUMN "sender_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ALTER COLUMN "buyer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_instance" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_opening" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_offer" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_offer" ALTER COLUMN "proposer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_offer" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD COLUMN "seller_wallet_id" text;--> statement-breakpoint
ALTER TABLE "black_market_listing_audit" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD COLUMN "buyer_wallet_id" text;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD COLUMN "seller_wallet_id" text;--> statement-breakpoint
ALTER TABLE "card_instance" ADD COLUMN "closed_owner_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD COLUMN "recipient_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD COLUMN "from_wallet_id" text;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD COLUMN "to_wallet_id" text;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD COLUMN "user_wallet_id" text;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD COLUMN "recipient_wallet_id" text;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD COLUMN "sender_wallet_id" text;--> statement-breakpoint
ALTER TABLE "gift_offer_history" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD COLUMN "buyer_wallet_id" text;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD COLUMN "closed_owner_wallet_id" text;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD COLUMN "owner_wallet_id" text;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD COLUMN "proposer_wallet_id" text;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD COLUMN "recipient_wallet_id" text;--> statement-breakpoint
ALTER TABLE "trade_offer_history" ADD COLUMN "actor_wallet_id" text;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_seller_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("seller_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_seller_user_id_user_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing_audit" ADD CONSTRAINT "black_market_listing_audit_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_buyer_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("buyer_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_seller_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("seller_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_seller_user_id_user_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_closed_owner_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("closed_owner_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_recipient_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_from_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("from_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_to_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_user_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("user_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_usage" ADD CONSTRAINT "gachapon_machine_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_recipient_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_sender_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("sender_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer_history" ADD CONSTRAINT "gift_offer_history_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_offer_history" ADD CONSTRAINT "gift_offer_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_usage" ADD CONSTRAINT "official_card_shop_offer_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_buyer_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("buyer_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_closed_owner_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("closed_owner_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_owner_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("owner_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_proposer_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("proposer_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_recipient_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("recipient_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_proposer_user_id_user_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer_history" ADD CONSTRAINT "trade_offer_history_actor_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("actor_wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer_history" ADD CONSTRAINT "trade_offer_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_seller_identity_check" CHECK (num_nonnulls("black_market_listing"."seller_user_id", "black_market_listing"."seller_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_buyer_identity_check" CHECK (num_nonnulls("black_market_sale"."buyer_user_id", "black_market_sale"."buyer_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_seller_identity_check" CHECK (num_nonnulls("black_market_sale"."seller_user_id", "black_market_sale"."seller_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_exclusive_location_check" CHECK (num_nonnulls("card_instance"."owner_user_id", "card_instance"."closed_owner_wallet_id", "card_instance"."pack_instance_id") = 1);--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_recipient_identity_check" CHECK (num_nonnulls("collectible_grant_execution"."recipient_user_id", "collectible_grant_execution"."recipient_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_user_identity_check" CHECK (num_nonnulls("gachapon_activation"."user_id", "gachapon_activation"."user_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_actor_identity_check" CHECK (num_nonnulls("gift_offer"."actor_user_id", "gift_offer"."actor_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_sender_identity_check" CHECK (num_nonnulls("gift_offer"."sender_user_id", "gift_offer"."sender_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_recipient_identity_check" CHECK (num_nonnulls("gift_offer"."recipient_user_id", "gift_offer"."recipient_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "gift_offer" ADD CONSTRAINT "gift_offer_distinct_participants_check" CHECK ("gift_offer"."state" <> 'sent' OR ("gift_offer"."sender_user_id" IS NOT NULL AND "gift_offer"."recipient_user_id" IS NOT NULL AND "gift_offer"."sender_user_id" <> "gift_offer"."recipient_user_id"));--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_buyer_identity_check" CHECK (num_nonnulls("official_card_shop_purchase"."buyer_user_id", "official_card_shop_purchase"."buyer_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_owner_identity_check" CHECK (num_nonnulls("pack_instance"."owner_user_id", "pack_instance"."closed_owner_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_owner_identity_check" CHECK (num_nonnulls("pack_opening"."owner_user_id", "pack_opening"."owner_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_actor_identity_check" CHECK (num_nonnulls("trade_offer"."actor_user_id", "trade_offer"."actor_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_proposer_identity_check" CHECK (num_nonnulls("trade_offer"."proposer_user_id", "trade_offer"."proposer_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_recipient_identity_check" CHECK (num_nonnulls("trade_offer"."recipient_user_id", "trade_offer"."recipient_wallet_id") = 1);--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_distinct_participants_check" CHECK ("trade_offer"."state" <> 'sent' OR ("trade_offer"."proposer_user_id" IS NOT NULL AND "trade_offer"."recipient_user_id" IS NOT NULL AND "trade_offer"."proposer_user_id" <> "trade_offer"."recipient_user_id"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_collectible_ownership_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id', 'from_user_id', 'from_wallet_id', 'to_user_id', 'to_wallet_id']
      = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id', 'from_user_id', 'from_wallet_id', 'to_user_id', 'to_wallet_id']
    AND (
      (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id AND NEW.actor_wallet_id IS NOT DISTINCT FROM OLD.actor_wallet_id)
      OR (OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.from_user_id IS NOT DISTINCT FROM OLD.from_user_id AND NEW.from_wallet_id IS NOT DISTINCT FROM OLD.from_wallet_id)
      OR (OLD.from_user_id IS NOT NULL AND NEW.from_user_id IS NULL AND OLD.from_wallet_id IS NULL AND NEW.from_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.to_user_id IS NOT DISTINCT FROM OLD.to_user_id AND NEW.to_wallet_id IS NOT DISTINCT FROM OLD.to_wallet_id)
      OR (OLD.to_user_id IS NOT NULL AND NEW.to_user_id IS NULL AND OLD.to_wallet_id IS NULL AND NEW.to_wallet_id IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Collectible ownership history is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_collectible_grant_execution_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
      = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
    AND (
      (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id AND NEW.actor_wallet_id IS NOT DISTINCT FROM OLD.actor_wallet_id)
      OR (OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.recipient_user_id IS NOT DISTINCT FROM OLD.recipient_user_id AND NEW.recipient_wallet_id IS NOT DISTINCT FROM OLD.recipient_wallet_id)
      OR (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS NULL AND OLD.recipient_wallet_id IS NULL AND NEW.recipient_wallet_id IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Collectible grant executions are immutable';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_trade_offer_terms_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'sent'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id', 'proposer_user_id', 'proposer_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
      = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id', 'proposer_user_id', 'proposer_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
    AND (
      (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id AND NEW.actor_wallet_id IS NOT DISTINCT FROM OLD.actor_wallet_id)
      OR (OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.proposer_user_id IS NOT DISTINCT FROM OLD.proposer_user_id AND NEW.proposer_wallet_id IS NOT DISTINCT FROM OLD.proposer_wallet_id)
      OR (OLD.proposer_user_id IS NOT NULL AND NEW.proposer_user_id IS NULL AND OLD.proposer_wallet_id IS NULL AND NEW.proposer_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.recipient_user_id IS NOT DISTINCT FROM OLD.recipient_user_id AND NEW.recipient_wallet_id IS NOT DISTINCT FROM OLD.recipient_wallet_id)
      OR (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS NULL AND OLD.recipient_wallet_id IS NULL AND NEW.recipient_wallet_id IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.proposer_user_id IS DISTINCT FROM OLD.proposer_user_id
    OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
    OR NEW.actor_wallet_id IS DISTINCT FROM OLD.actor_wallet_id
    OR NEW.proposer_wallet_id IS DISTINCT FROM OLD.proposer_wallet_id
    OR NEW.recipient_wallet_id IS DISTINCT FROM OLD.recipient_wallet_id
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.proposer_confirmed_at IS DISTINCT FROM OLD.proposer_confirmed_at
    OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
    OR NEW.terms_hash IS DISTINCT FROM OLD.terms_hash
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.source IS DISTINCT FROM OLD.source
  THEN
    RAISE EXCEPTION 'Sent Trade Offer terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_trade_offer_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id'] = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id']
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Trade Offer history is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gift_offer_terms_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'sent'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id', 'sender_user_id', 'sender_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
      = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id', 'sender_user_id', 'sender_wallet_id', 'recipient_user_id', 'recipient_wallet_id']
    AND (
      (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id AND NEW.actor_wallet_id IS NOT DISTINCT FROM OLD.actor_wallet_id)
      OR (OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.sender_user_id IS NOT DISTINCT FROM OLD.sender_user_id AND NEW.sender_wallet_id IS NOT DISTINCT FROM OLD.sender_wallet_id)
      OR (OLD.sender_user_id IS NOT NULL AND NEW.sender_user_id IS NULL AND OLD.sender_wallet_id IS NULL AND NEW.sender_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.recipient_user_id IS NOT DISTINCT FROM OLD.recipient_user_id AND NEW.recipient_wallet_id IS NOT DISTINCT FROM OLD.recipient_wallet_id)
      OR (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS NULL AND OLD.recipient_wallet_id IS NULL AND NEW.recipient_wallet_id IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
    OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
    OR NEW.actor_wallet_id IS DISTINCT FROM OLD.actor_wallet_id
    OR NEW.sender_wallet_id IS DISTINCT FROM OLD.sender_wallet_id
    OR NEW.recipient_wallet_id IS DISTINCT FROM OLD.recipient_wallet_id
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.sender_confirmed_at IS DISTINCT FROM OLD.sender_confirmed_at
    OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
    OR NEW.terms_hash IS DISTINCT FROM OLD.terms_hash
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.source IS DISTINCT FROM OLD.source
  THEN
    RAISE EXCEPTION 'Sent Gift Offer terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gift_offer_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id'] = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id']
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Gift Offer history is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gachapon_activation_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['user_id', 'user_wallet_id'] = to_jsonb(OLD) - ARRAY['user_id', 'user_wallet_id']
    AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL
    AND OLD.user_wallet_id IS NULL AND NEW.user_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Gachapon activations are immutable';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_collectible_admin_action_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id'] = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id']
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'collectible_admin_action is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_card_template_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND to_jsonb(NEW) - 'actor_user_id' = to_jsonb(OLD) - 'actor_user_id'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'card_template_audit_event is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_official_card_shop_offer_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND to_jsonb(NEW) - 'actor_user_id' = to_jsonb(OLD) - 'actor_user_id'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'official_card_shop_offer_audit_event is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gachapon_machine_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND to_jsonb(NEW) - 'actor_user_id' = to_jsonb(OLD) - 'actor_user_id'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Gachapon Machine audit history is append-only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'pack_revision' AND TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['created_by_user_id', 'published_by_user_id', 'updated_by_user_id']
      = to_jsonb(OLD) - ARRAY['created_by_user_id', 'published_by_user_id', 'updated_by_user_id']
    AND (NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_user_id IS NULL)
    AND (NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id OR NEW.published_by_user_id IS NULL)
    AND (NEW.updated_by_user_id IS NOT DISTINCT FROM OLD.updated_by_user_id OR NEW.updated_by_user_id IS NULL)
  THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'pack_revision' THEN
    IF OLD.lifecycle = 'published' THEN
      RAISE EXCEPTION 'Published Pack Revisions are immutable';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      IF TG_TABLE_NAME = 'pack_draw_group' THEN
        IF EXISTS (SELECT 1 FROM pack_revision WHERE id = (to_jsonb(NEW)->>'revision_id') AND lifecycle = 'published') THEN
          RAISE EXCEPTION 'Published Pack Revision children are immutable';
        END IF;
      ELSIF EXISTS (
        SELECT 1 FROM pack_draw_group
        INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
        WHERE pack_draw_group.id = (to_jsonb(NEW)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
      ) THEN
        RAISE EXCEPTION 'Published Pack Revision children are immutable';
      END IF;
    ELSIF TG_OP = 'UPDATE' AND (
      (TG_TABLE_NAME = 'pack_draw_group' AND EXISTS (
        SELECT 1 FROM pack_revision WHERE id = (to_jsonb(NEW)->>'revision_id') AND lifecycle = 'published'
      )) OR (TG_TABLE_NAME <> 'pack_draw_group' AND EXISTS (
        SELECT 1 FROM pack_draw_group
        INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
        WHERE pack_draw_group.id = (to_jsonb(NEW)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
      ))
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF TG_TABLE_NAME = 'pack_draw_group' AND EXISTS (
      SELECT 1 FROM pack_revision WHERE id = (to_jsonb(OLD)->>'revision_id') AND lifecycle = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF EXISTS (
      SELECT 1 FROM pack_draw_group
      INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
      WHERE pack_draw_group.id = (to_jsonb(OLD)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
