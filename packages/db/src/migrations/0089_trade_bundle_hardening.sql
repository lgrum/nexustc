DROP INDEX IF EXISTS "collectible_custody_active_trade_side_unique";--> statement-breakpoint
CREATE INDEX "collectible_custody_trade_side_idx" ON "collectible_custody" USING btree ("trade_offer_id","side","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_custody_card_lookup_idx" ON "collectible_custody" USING btree ("card_instance_id","released_at","created_at","id") WHERE "collectible_custody"."card_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collectible_custody_pack_lookup_idx" ON "collectible_custody" USING btree ("pack_instance_id","released_at","created_at","id") WHERE "collectible_custody"."pack_instance_id" IS NOT NULL;
