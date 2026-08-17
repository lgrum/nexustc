CREATE TYPE "public"."collectible_admin_action_kind" AS ENUM('freeze', 'restore', 'disable', 'retire', 'cancel', 'release-custody', 'retain-custody', 'correct', 'exceptional-grant', 'exceptional-transfer', 'reverse-eteris', 'publish-impact');--> statement-breakpoint
CREATE TYPE "public"."collectible_admin_target_kind" AS ENUM('card-instance', 'pack-instance', 'card-template', 'pack-template', 'pack-revision', 'shop-offer', 'gachapon-machine', 'grant-campaign', 'market-listing', 'trade-offer', 'gift-offer', 'eteris-transaction');--> statement-breakpoint
CREATE TABLE "collectible_admin_action" (
	"action" "collectible_admin_action_kind" NOT NULL,
	"actor_user_id" text,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"card_instance_id" text,
	"collectible_grant_campaign_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_version" integer,
	"fingerprint" text NOT NULL,
	"gachapon_machine_id" text,
	"gift_offer_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"linked_action_id" text,
	"linked_eteris_transaction_id" text,
	"market_listing_id" text,
	"pack_instance_id" text,
	"pack_revision_id" text,
	"pack_template_id" text,
	"official_card_shop_offer_id" text,
	"reason" text NOT NULL,
	"target_id" text NOT NULL,
	"target_kind" "collectible_admin_target_kind" NOT NULL,
	"trade_offer_id" text,
	"version" integer NOT NULL,
	CONSTRAINT "collectible_admin_action_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "collectible_admin_action_reason_check" CHECK (length(trim("collectible_admin_action"."reason")) > 0),
	CONSTRAINT "collectible_admin_action_version_check" CHECK ("collectible_admin_action"."version" > 0),
	CONSTRAINT "collectible_admin_action_expected_version_check" CHECK ("collectible_admin_action"."expected_version" IS NULL OR "collectible_admin_action"."expected_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "card_instance" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_card_instance_id_card_instance_id_fk" FOREIGN KEY ("card_instance_id") REFERENCES "public"."card_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_collectible_grant_campaign_id_collectible_grant_campaign_id_fk" FOREIGN KEY ("collectible_grant_campaign_id") REFERENCES "public"."collectible_grant_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_gachapon_machine_id_gachapon_machine_id_fk" FOREIGN KEY ("gachapon_machine_id") REFERENCES "public"."gachapon_machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_gift_offer_id_gift_offer_id_fk" FOREIGN KEY ("gift_offer_id") REFERENCES "public"."gift_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_linked_eteris_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("linked_eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_market_listing_id_black_market_listing_id_fk" FOREIGN KEY ("market_listing_id") REFERENCES "public"."black_market_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_pack_revision_id_pack_revision_id_fk" FOREIGN KEY ("pack_revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_official_card_shop_offer_id_official_card_shop_offer_id_fk" FOREIGN KEY ("official_card_shop_offer_id") REFERENCES "public"."official_card_shop_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_trade_offer_id_trade_offer_id_fk" FOREIGN KEY ("trade_offer_id") REFERENCES "public"."trade_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collectible_admin_action_created_cursor_idx" ON "collectible_admin_action" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_admin_action_target_idx" ON "collectible_admin_action" USING btree ("target_kind","target_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_admin_action_actor_created_idx" ON "collectible_admin_action" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_admin_action_linked_eteris_idx" ON "collectible_admin_action" USING btree ("linked_eteris_transaction_id");--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_version_check" CHECK ("card_instance"."version" > 0);--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_version_check" CHECK ("pack_instance"."version" > 0);