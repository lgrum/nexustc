ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_target_reference_check" CHECK ((
        ("collectible_admin_action"."target_kind" = 'card-instance' AND "collectible_admin_action"."card_instance_id" IS NOT NULL) OR
        ("collectible_admin_action"."target_kind" = 'card-template' AND "collectible_admin_action"."card_template_id" IS NOT NULL) OR
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
      ));