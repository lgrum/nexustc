ALTER TYPE "public"."collectible_admin_target_kind" ADD VALUE 'card-character' BEFORE 'pack-template';--> statement-breakpoint
ALTER TYPE "public"."collectible_admin_target_kind" ADD VALUE 'card-series' BEFORE 'pack-template';--> statement-breakpoint
ALTER TABLE "collectible_admin_action" DROP CONSTRAINT "collectible_admin_action_target_reference_check";--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD COLUMN "card_character_id" text;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD COLUMN "card_series_id" text;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_card_character_id_card_character_id_fk" FOREIGN KEY ("card_character_id") REFERENCES "public"."card_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_card_series_id_card_series_id_fk" FOREIGN KEY ("card_series_id") REFERENCES "public"."card_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_target_reference_check" CHECK ((
        ("collectible_admin_action"."target_kind" = 'card-instance' AND "collectible_admin_action"."card_instance_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'card-template' AND "collectible_admin_action"."card_template_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'card-character' AND "collectible_admin_action"."card_character_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'card-series' AND "collectible_admin_action"."card_series_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'pack-instance' AND "collectible_admin_action"."pack_instance_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'pack-template' AND "collectible_admin_action"."pack_template_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'pack-revision' AND "collectible_admin_action"."pack_revision_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'shop-offer' AND "collectible_admin_action"."official_card_shop_offer_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'gachapon-machine' AND "collectible_admin_action"."gachapon_machine_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'grant-campaign' AND "collectible_admin_action"."collectible_grant_campaign_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'market-listing' AND "collectible_admin_action"."market_listing_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'trade-offer' AND "collectible_admin_action"."trade_offer_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'gift-offer' AND "collectible_admin_action"."gift_offer_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'eteris-transaction' AND "collectible_admin_action"."linked_eteris_transaction_id" IS NOT NULL)
      ));--> statement-breakpoint
CREATE FUNCTION "prevent_black_market_listing_terms_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."asking_price" IS DISTINCT FROM OLD."asking_price"
    OR NEW."listing_fee" IS DISTINCT FROM OLD."listing_fee"
    OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
    OR NEW."terms_hash" IS DISTINCT FROM OLD."terms_hash"
    OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."fee_transaction_id" IS DISTINCT FROM OLD."fee_transaction_id"
  THEN
    RAISE EXCEPTION 'Published Black Market listing terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "black_market_listing_terms_immutable"
BEFORE UPDATE ON "black_market_listing"
FOR EACH ROW EXECUTE FUNCTION "prevent_black_market_listing_terms_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_black_market_listing_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Black Market listing audit is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "black_market_listing_audit_append_only"
BEFORE UPDATE OR DELETE ON "black_market_listing_audit"
FOR EACH ROW EXECUTE FUNCTION "prevent_black_market_listing_audit_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_black_market_sale_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Black Market sales are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "black_market_sale_append_only"
BEFORE UPDATE OR DELETE ON "black_market_sale"
FOR EACH ROW EXECUTE FUNCTION "prevent_black_market_sale_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_official_card_shop_purchase_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Official Card Shop purchases are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "official_card_shop_purchase_append_only"
BEFORE UPDATE OR DELETE ON "official_card_shop_purchase"
FOR EACH ROW EXECUTE FUNCTION "prevent_official_card_shop_purchase_mutation"();