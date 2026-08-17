import { getTableConfig } from "drizzle-orm/pg-core";
import { expect, test } from "vitest";

import {
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  cardTemplateAuditEvent,
  collectibleAdminAction,
  collectibleGrantCampaign,
  collectibleGrantExecution,
  collectibleCustody,
  collectibleOwnershipEvent,
  blackMarketListing,
  blackMarketListingAudit,
  blackMarketSale,
  blackMarketRiskSignal,
  giftOffer,
  giftOfferHistory,
  giftOfferHistoryActionEnum,
  giftOfferStateEnum,
  gachaponActivation,
  officialCardShopOffer,
  officialCardShopOfferAuditEvent,
  officialCardShopOfferUsage,
  officialCardShopPurchase,
  officialCardShopPurchaseItem,
  packDrawGroup,
  packDrawGroupCardWeight,
  packDrawGroupRarityWeight,
  packInstance,
  packOpening,
  packRevision,
  packTemplate,
  commentLikes,
  eterisPosting,
  eterisTransaction,
  eterisWallet,
  eterisWalletBalance,
  eterisWalletStatusEvent,
  postRating,
  postRatingLikes,
  profileSettings,
  tradeOffer,
  tradeOfferHistory,
  profileShowcaseConfig,
  profileShowcaseTypeKeyEnum,
  streakDiscoveryReceipt,
  user,
  userStreak,
  xpEvent,
  xpRewardBlock,
  xpRewardSubject,
} from "./app";

test("Gift Offers keep a distinct free-transfer parent and bounded history", () => {
  const custodyConfig = getTableConfig(collectibleCustody);
  const offerConfig = getTableConfig(giftOffer);
  const historyConfig = getTableConfig(giftOfferHistory);

  expect(giftOfferStateEnum.enumValues).toEqual([
    "sent",
    "accepted",
    "rejected",
    "cancelled",
    "expired",
    "administratively-cancelled",
  ]);
  expect(giftOfferHistoryActionEnum.enumValues).toEqual(
    giftOfferStateEnum.enumValues
  );
  expect(offerConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "sender_user_id",
      "recipient_user_id",
      "sent_at",
      "expires_at",
      "state",
      "terms_hash",
      "version",
    ])
  );
  expect(historyConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["gift_offer_id", "idempotency_key", "metadata"])
  );
  expect(custodyConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["trade_offer_id", "gift_offer_id"])
  );
  expect(custodyConfig.checks.map(({ name }) => name)).toContain(
    "collectible_custody_one_parent_check"
  );
  expect(offerConfig.indexes.map(({ config }) => config.name)).toEqual(
    expect.arrayContaining([
      "gift_offer_sender_state_sent_idx",
      "gift_offer_recipient_state_sent_idx",
      "gift_offer_expiry_idx",
    ])
  );
});

test("Black Market listings retain immutable terms, sale links, and review signals", () => {
  const custodyConfig = getTableConfig(collectibleCustody);
  const listingConfig = getTableConfig(blackMarketListing);
  const auditConfig = getTableConfig(blackMarketListingAudit);
  const saleConfig = getTableConfig(blackMarketSale);
  const signalConfig = getTableConfig(blackMarketRiskSignal);

  expect(listingConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "seller_user_id",
      "asking_price",
      "listing_fee",
      "terms_hash",
      "expires_at",
      "version",
    ])
  );
  expect(listingConfig.indexes.map(({ config }) => config.name)).toEqual(
    expect.arrayContaining([
      "black_market_listing_active_expiry_idx",
      "black_market_listing_active_price_idx",
      "black_market_listing_active_published_idx",
    ])
  );
  expect(auditConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["listing_id", "idempotency_key", "before", "after"])
  );
  expect(saleConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "listing_id",
      "eteris_transaction_id",
      "buyer_user_id",
    ])
  );
  expect(signalConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["signal", "severity", "metadata"])
  );
  expect(custodyConfig.columns.map(({ name }) => name)).toContain(
    "black_market_listing_id"
  );
  expect(custodyConfig.checks.map(({ name }) => name)).toContain(
    "collectible_custody_one_parent_check"
  );
});

test("collectible administrative actions are immutable and retain typed targets", () => {
  const config = getTableConfig(collectibleAdminAction);
  expect(config.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "action",
      "after",
      "before",
      "expected_version",
      "fingerprint",
      "idempotency_key",
      "reason",
      "target_id",
      "target_kind",
      "version",
    ])
  );
  expect(
    config.columns.find(({ name }) => name === "idempotency_key")?.isUnique
  ).toBe(true);
  expect(
    config.foreignKeys
      .filter((foreignKey) => foreignKey.onDelete === "restrict")
      .map((foreignKey) => foreignKey.reference().foreignTable)
  ).toEqual(
    expect.arrayContaining([
      cardInstance,
      cardTemplate,
      packInstance,
      packRevision,
      eterisTransaction,
    ])
  );
});

test("Discovery receipts survive content deletion and cascade with accounts", () => {
  const receiptConfig = getTableConfig(streakDiscoveryReceipt);

  expect(streakDiscoveryReceipt.actionKind.enumValues).toEqual([
    "bookmark",
    "follow",
    "rating",
  ]);
  expect(
    receiptConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["user_id", "action_kind", "content_key"]);
  expect(receiptConfig.foreignKeys).toHaveLength(1);
  expect(receiptConfig.foreignKeys[0]?.reference().foreignTable).toBe(user);
  expect(receiptConfig.foreignKeys[0]?.onDelete).toBe("cascade");
});

test("collectible Profile Showcase types remain code-owned and one-per-type", () => {
  expect(profileShowcaseTypeKeyEnum.enumValues).toEqual([
    "library",
    "reviews",
    "favorite-games",
    "xp",
    "streak",
    "eteris",
    "card",
    "rare-card",
    "unopened-pack",
  ]);

  const config = getTableConfig(profileShowcaseConfig);
  expect(config.uniqueConstraints.map(({ name }) => name)).toEqual([]);
  expect(config.indexes.map(({ config: index }) => index.name)).toEqual([
    "profile_showcase_config_user_type_uq",
    "profile_showcase_config_user_order_uq",
  ]);
});

test("account deletion removes the private streak projection", () => {
  const streakConfig = getTableConfig(userStreak);

  expect(streakConfig.foreignKeys).toHaveLength(1);
  expect(streakConfig.foreignKeys[0]?.reference().foreignTable).toBe(user);
  expect(streakConfig.foreignKeys[0]?.onDelete).toBe("cascade");
});

test("a recreated review receives a new identity", () => {
  expect(postRating.id.defaultFn?.()).not.toBe(postRating.id.defaultFn?.());
});

test("review likes belong to one stable review incarnation", () => {
  const ratingConfig = getTableConfig(postRating);
  const likesConfig = getTableConfig(postRatingLikes);

  expect(ratingConfig.columns.find(({ name }) => name === "id")).toMatchObject({
    isUnique: true,
    notNull: true,
  });
  expect(likesConfig.columns.map(({ name }) => name)).toEqual([
    "created_at",
    "email_verified_at_creation",
    "xp_accrual_enabled_at_creation",
    "rating_id",
    "user_id",
  ]);
  expect(
    likesConfig.columns.find(
      ({ name }) => name === "email_verified_at_creation"
    )
  ).toMatchObject({ hasDefault: true, notNull: true });
  expect(
    likesConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["user_id", "rating_id"]);

  const ratingForeignKey = likesConfig.foreignKeys.find(
    (foreignKey) => foreignKey.reference().foreignTable === postRating
  );
  expect(ratingForeignKey?.reference().columns.map(({ name }) => name)).toEqual(
    ["rating_id"]
  );
  expect(
    ratingForeignKey?.reference().foreignColumns.map(({ name }) => name)
  ).toEqual(["id"]);
  expect(ratingForeignKey?.onDelete).toBe("cascade");
});

test("contribution likes snapshot whether XP accrual was enabled", () => {
  for (const table of [commentLikes, postRatingLikes]) {
    expect(
      getTableConfig(table).columns.find(
        ({ name }) => name === "xp_accrual_enabled_at_creation"
      )
    ).toMatchObject({ hasDefault: true, notNull: true });
  }
});

test("wallet balances and postings use signed 64-bit integers", () => {
  const walletConfig = getTableConfig(eterisWallet);
  const balanceConfig = getTableConfig(eterisWalletBalance);
  const transactionConfig = getTableConfig(eterisTransaction);
  const postingConfig = getTableConfig(eterisPosting);

  expect(
    balanceConfig.columns.find(({ name }) => name === "balance")?.getSQLType()
  ).toBe("bigint");
  expect(
    postingConfig.columns.find(({ name }) => name === "amount")?.getSQLType()
  ).toBe("bigint");
  expect(
    walletConfig.columns.find(({ name }) => name === "user_id")?.isUnique
  ).toBe(true);
  expect(
    transactionConfig.columns.find(({ name }) => name === "idempotency_key")
      ?.isUnique
  ).toBe(true);
  expect(
    transactionConfig.columns
      .find(({ name }) => name === "sequence")
      ?.getSQLType()
  ).toBe("bigserial");
  expect(
    postingConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["transaction_id", "wallet_id"]);
});

test("account deletion anonymizes wallets without deleting ledger postings", () => {
  const walletConfig = getTableConfig(eterisWallet);
  const postingConfig = getTableConfig(eterisPosting);

  expect(
    walletConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === user
    )?.onDelete
  ).toBe("set null");
  expect(
    postingConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === eterisWallet
    )?.onDelete
  ).toBe("restrict");
});

test("wallet status history remains attached to the immutable wallet ledger", () => {
  const historyConfig = getTableConfig(eterisWalletStatusEvent);

  expect(
    historyConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === eterisWallet
    )?.onDelete
  ).toBe("restrict");
  expect(historyConfig.indexes.map(({ config }) => config.name)).toContain(
    "eteris_wallet_status_event_wallet_created_idx"
  );
});

test("contribution reward subjects retain opaque review identities", () => {
  const subjectConfig = getTableConfig(xpRewardSubject);
  const blockConfig = getTableConfig(xpRewardBlock);
  const eventConfig = getTableConfig(xpEvent);

  expect(subjectConfig.foreignKeys).toHaveLength(1);
  expect(
    subjectConfig.foreignKeys[0]?.reference().columns.map(({ name }) => name)
  ).toEqual(["user_id"]);
  expect(subjectConfig.indexes.map(({ config }) => config.name)).toContain(
    "xp_reward_subject_kind_entity_unique"
  );
  expect(blockConfig.indexes.map(({ config }) => config.name)).toContain(
    "xp_reward_block_user_kind_scope_unique"
  );
  expect(
    eventConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === xpRewardSubject
    )?.onDelete
  ).toBe("set null");
});

test("card authoring keeps normalized identity reusable across templates", () => {
  const characterConfig = getTableConfig(cardCharacter);
  const templateConfig = getTableConfig(cardTemplate);

  expect(characterConfig.indexes.map(({ config }) => config.name)).toContain(
    "card_character_normalized_identity_unique"
  );
  expect(characterConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "character_name",
      "game_name",
      "normalized_character_name",
      "normalized_game_name",
      "lifecycle",
    ])
  );
  expect(
    templateConfig.foreignKeys.map((foreignKey) => foreignKey.onDelete)
  ).toEqual(expect.arrayContaining(["restrict", "restrict"]));
  expect(templateConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "character_id",
      "series_id",
      "portrait_media_id",
      "effect_config",
      "rendered_variants",
      "lifetime_supply_ceiling",
      "minted_supply",
      "version",
    ])
  );
  expect(templateConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "card_template_minted_supply_check",
      "card_template_lifetime_supply_ceiling_check",
      "card_template_first_minted_at_consistency_check",
    ])
  );
});

test("card instances enforce permanent mint identity and exclusive location", () => {
  const instanceConfig = getTableConfig(cardInstance);
  expect(instanceConfig.indexes.map(({ config }) => config.name)).toContain(
    "card_instance_template_mint_number_unique"
  );
  expect(instanceConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "card_instance_exclusive_location_check",
      "card_instance_mint_number_check",
    ])
  );
  expect(instanceConfig.indexes.map(({ config }) => config.name)).toEqual(
    expect.arrayContaining([
      "card_instance_owner_issued_idx",
      "card_instance_owner_binding_idx",
    ])
  );
});

test("pack instances and ownership history remain restrictive authorities", () => {
  const packConfig = getTableConfig(packInstance);
  const openingConfig = getTableConfig(packOpening);
  const eventConfig = getTableConfig(collectibleOwnershipEvent);
  const campaignConfig = getTableConfig(collectibleGrantCampaign);
  const executionConfig = getTableConfig(collectibleGrantExecution);

  expect(packConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "binding",
      "issue_reference",
      "issue_source",
      "issued_at",
      "outcome_digest",
      "owner_user_id",
      "revision_id",
      "state",
      "template_id",
    ])
  );
  expect(openingConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "cards",
      "fingerprint",
      "idempotency_key",
      "opened_at",
      "pack_instance_id",
      "revision_id",
      "source",
      "template_id",
    ])
  );
  expect(openingConfig.indexes.map(({ config }) => config.name)).toContain(
    "pack_opening_idempotency_key_unique"
  );
  expect(packConfig.indexes.map(({ config }) => config.name)).toContain(
    "pack_instance_owner_state_issued_idx"
  );
  expect(packConfig.indexes.map(({ config }) => config.name)).toEqual(
    expect.arrayContaining([
      "pack_instance_owner_template_issued_idx",
      "pack_instance_owner_binding_idx",
    ])
  );
  expect(eventConfig.checks.map(({ name }) => name)).toContain(
    "collectible_ownership_event_one_asset_check"
  );
  expect(
    eventConfig.foreignKeys
      .filter(
        (foreignKey) =>
          foreignKey.reference().foreignTable === cardInstance ||
          foreignKey.reference().foreignTable === packInstance
      )
      .map((foreignKey) => foreignKey.onDelete)
  ).toEqual(expect.arrayContaining(["restrict"]));
  expect(campaignConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "collectible_grant_campaign_one_target_check",
      "collectible_grant_campaign_quantity_check",
    ])
  );
  expect(executionConfig.indexes.map(({ config }) => config.name)).toContain(
    "collectible_grant_execution_campaign_created_idx"
  );
});

test("closed collectible identities retain only restrictive opaque wallet links", () => {
  const tables = [
    cardInstance,
    packInstance,
    packOpening,
    collectibleOwnershipEvent,
    collectibleGrantExecution,
    tradeOffer,
    tradeOfferHistory,
    giftOffer,
    giftOfferHistory,
    blackMarketListing,
    blackMarketListingAudit,
    blackMarketSale,
    officialCardShopPurchase,
    gachaponActivation,
    collectibleAdminAction,
  ];

  for (const table of tables) {
    const walletForeignKeys = getTableConfig(table).foreignKeys.filter(
      (foreignKey) => foreignKey.reference().foreignTable === eterisWallet
    );
    expect(walletForeignKeys.length).toBeGreaterThan(0);
    expect(
      walletForeignKeys.every(({ onDelete }) => onDelete === "restrict")
    ).toBe(true);
  }
  expect(getTableConfig(cardInstance).checks.map(({ name }) => name)).toContain(
    "card_instance_exclusive_location_check"
  );
  expect(getTableConfig(packInstance).checks.map(({ name }) => name)).toContain(
    "pack_instance_owner_identity_check"
  );
  expect(
    getTableConfig(collectibleGrantExecution).checks.map(({ name }) => name)
  ).toContain("collectible_grant_execution_recipient_identity_check");
});

test("profile settings keep public collection private by default", () => {
  const settingsConfig = getTableConfig(profileSettings);
  const visibilityColumn = settingsConfig.columns.find(
    ({ name }) => name === "visibility_config"
  );

  expect(visibilityColumn?.getSQLType()).toBe("jsonb");
  expect(visibilityColumn?.hasDefault).toBe(true);
});

test("trade custody is a retained, multi-asset, and restrictive reservation", () => {
  const custodyConfig = getTableConfig(collectibleCustody);
  const offerConfig = getTableConfig(tradeOffer);
  const historyConfig = getTableConfig(tradeOfferHistory);

  expect(custodyConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "collectible_custody_one_asset_check",
      "collectible_custody_release_reason_check",
    ])
  );
  expect(custodyConfig.indexes.map(({ config }) => config.name)).toEqual(
    expect.arrayContaining([
      "collectible_custody_active_card_unique",
      "collectible_custody_active_pack_unique",
      "collectible_custody_trade_side_idx",
    ])
  );
  expect(
    custodyConfig.foreignKeys.map((foreignKey) => foreignKey.onDelete)
  ).toEqual(expect.arrayContaining(["restrict"]));
  expect(offerConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "trade_offer_distinct_participants_check",
      "trade_offer_expiry_check",
      "trade_offer_terminal_metadata_check",
    ])
  );
  expect(historyConfig.indexes.map(({ config }) => config.name)).toContain(
    "trade_offer_history_offer_created_idx"
  );
  expect(
    historyConfig.foreignKeys.map((foreignKey) => foreignKey.onDelete)
  ).toEqual(expect.arrayContaining(["restrict"]));
});

test("template audit history is append-only data with restrictive template history", () => {
  const auditConfig = getTableConfig(cardTemplateAuditEvent);
  expect(auditConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["before", "after", "actor_user_id", "reason"])
  );
  expect(
    auditConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === cardTemplate
    )?.onDelete
  ).toBe("restrict");
});

test("card Series lifecycle has no uniqueness coupling to templates", () => {
  const seriesConfig = getTableConfig(cardSeries);
  const templateConfig = getTableConfig(cardTemplate);
  expect(seriesConfig.columns.map(({ name }) => name)).toContain("lifecycle");
  expect(templateConfig.indexes.map(({ config }) => config.name)).not.toContain(
    "card_template_character_unique"
  );
});

test("Pack Templates point to stable managed products and published revisions", () => {
  const templateConfig = getTableConfig(packTemplate);
  const revisionConfig = getTableConfig(packRevision);
  expect(templateConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "asset_media_id",
      "description",
      "lifecycle",
      "latest_published_revision_id",
      "version",
    ])
  );
  expect(revisionConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "availability",
      "binding_policy",
      "card_count",
      "configuration_hash",
      "duplicate_policy",
      "lifecycle",
      "revision",
      "template_id",
    ])
  );
  expect(revisionConfig.indexes.map(({ config }) => config.name)).toContain(
    "pack_revision_template_revision_unique"
  );
  expect(revisionConfig.indexes.map(({ config }) => config.name)).toContain(
    "pack_revision_template_availability_idx"
  );
});

test("Pack Draw Groups normalize ordered weights and retain immutable child references", () => {
  const groupConfig = getTableConfig(packDrawGroup);
  const rarityConfig = getTableConfig(packDrawGroupRarityWeight);
  const cardConfig = getTableConfig(packDrawGroupCardWeight);
  expect(groupConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "pack_draw_group_draw_count_check",
      "pack_draw_group_order_check",
    ])
  );
  expect(rarityConfig.checks.map(({ name }) => name)).toContain(
    "pack_draw_group_rarity_weight_bounds_check"
  );
  expect(cardConfig.checks.map(({ name }) => name)).toContain(
    "pack_draw_group_card_weight_bounds_check"
  );
  expect(
    cardConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === cardTemplate
    )?.onDelete
  ).toBe("restrict");
});

test("Official Shop offers are versioned, quota-aware, and linked to immutable issuance", () => {
  const offerConfig = getTableConfig(officialCardShopOffer);
  const auditConfig = getTableConfig(officialCardShopOfferAuditEvent);
  const usageConfig = getTableConfig(officialCardShopOfferUsage);
  const purchaseConfig = getTableConfig(officialCardShopPurchase);
  const itemConfig = getTableConfig(officialCardShopPurchaseItem);

  expect(offerConfig.columns.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "binding",
      "enabled",
      "ends_at",
      "pack_template_id",
      "per_account_limit",
      "price",
      "remaining_sales",
      "starts_at",
      "total_sold",
      "version",
    ])
  );
  expect(offerConfig.checks.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "official_card_shop_offer_price_check",
      "official_card_shop_offer_remaining_sales_check",
      "official_card_shop_offer_per_account_limit_check",
      "official_card_shop_offer_total_sold_check",
      "official_card_shop_offer_version_check",
      "official_card_shop_offer_window_check",
    ])
  );
  expect(
    auditConfig.foreignKeys.map((foreignKey) => foreignKey.onDelete)
  ).toContain("restrict");
  expect(
    usageConfig.primaryKeys.map(({ columns }) =>
      columns.map(({ name }) => name)
    )
  ).toContainEqual(["offer_id", "user_id"]);
  expect(
    purchaseConfig.columns.find(({ name }) => name === "idempotency_key")
  ).toMatchObject({ isUnique: true });
  expect(
    purchaseConfig.columns.find(({ name }) => name === "eteris_transaction_id")
  ).toMatchObject({ isUnique: true });
  expect(itemConfig.indexes.map(({ config }) => config.name)).toContain(
    "official_card_shop_purchase_item_purchase_ordinal_unique"
  );
  expect(
    itemConfig.foreignKeys
      .filter(
        (foreignKey) => foreignKey.reference().foreignTable === packInstance
      )
      .map((foreignKey) => foreignKey.onDelete)
  ).toContain("restrict");
});
