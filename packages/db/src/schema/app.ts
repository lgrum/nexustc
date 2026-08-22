import { DEFAULT_APP_THEME_ID } from "@repo/shared/app-theme";
import type {
  CardEffectConfig,
  CardPresentationMetadata,
  CardRenderedVariant,
  PackOpeningCard,
  PackGuarantee,
} from "@repo/shared/collectibles";
import {
  DOCUMENT_STATUSES,
  PATRON_TIER_KEYS,
  PREMIUM_LINK_ACCESS_LEVELS,
  TAXONOMIES,
} from "@repo/shared/constants";
import {
  ETERIS_TRANSACTION_KINDS,
  ETERIS_WALLET_KINDS,
  ETERIS_WALLET_STATUSES,
} from "@repo/shared/eteris";
import {
  PROFILE_ASSIGNMENT_SOURCE_TYPES,
  PROFILE_BANNER_MODES,
  PROFILE_DEFAULTS,
  PROFILE_MEDIA_SLOTS,
  PROFILE_MEDIA_VALIDATION_STATUSES,
} from "@repo/shared/profile";
import type {
  ProfileRoleVisualConfig,
  ProfileVisibilityConfig,
} from "@repo/shared/profile";
import {
  PROFILE_CATALOG_KINDS,
  PROFILE_CATALOG_LIFECYCLES,
  PROFILE_CATALOG_OWNERSHIP_SOURCES,
  PROFILE_CATALOG_REVISION_STATES,
  PROFILE_DECORATION_SLOTS,
  PROFILE_LAYOUT_KEYS,
  PROFILE_SHOWCASE_TYPE_KEYS,
  PROFILE_SHOWCASE_VARIANTS,
} from "@repo/shared/profile-customization";
import type { MarqueeItem as SiteMarqueeItem } from "@repo/shared/schemas";
import { relations, sql } from "drizzle-orm";
import {
  check,
  bigint,
  bigserial,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { generateId } from "../utils";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
};

export const user = pgTable(
  "user",
  {
    avatarFallbackColor: text("avatar_fallback_color")
      .default(PROFILE_DEFAULTS.avatarFallbackColor)
      .notNull(),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    banReason: text("ban_reason"),
    banned: boolean("banned").default(false),
    email: text("email").notNull().unique(),
    normalizedEmail: text("normalized_email").unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    name: varchar("name", { length: 16 }).notNull(),
    newsletterOptIn: boolean("newsletter_opt_in").default(false).notNull(),
    role: text("role").default("user").notNull(),
    selectedTheme: text("selected_theme")
      .default(DEFAULT_APP_THEME_ID)
      .notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    index("user_email_idx").on(table.email),
    index("user_created_at_idx").on(table.createdAt),
  ]
);

/** Canonical user-to-user safety relationship used by economic features. */
export const userBlock = pgTable(
  "user_block",
  {
    blockedUserId: text("blocked_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockerUserId: text("blocker_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerUserId, table.blockedUserId] }),
    check(
      "user_block_distinct_users_check",
      sql`${table.blockerUserId} <> ${table.blockedUserId}`
    ),
    index("user_block_blocked_user_idx").on(table.blockedUserId),
  ]
);

export const session = pgTable(
  "session",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("session_userId_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ]
);

export const account = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    accountId: text("account_id").notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const twoFactor = pgTable(
  "two_factor",
  {
    backupCodes: text("backup_codes").notNull(),
    failedVerificationCount: integer("failed_verification_count")
      .default(0)
      .notNull(),
    id: text("id").primaryKey(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    secret: text("secret").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
  },
  (table) => [
    index("two_factor_secret_idx").on(table.secret),
    index("two_factor_user_id_idx").on(table.userId),
  ]
);

export const patron = pgTable(
  "patron",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    isActivePatron: boolean("is_active_patron").notNull().default(false),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }).notNull(),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    patreonUserId: text("patreon_user_id").notNull().unique(),
    patronSince: timestamp("patron_since", { withTimezone: true }),
    pledgeAmountCents: integer("pledge_amount_cents").notNull().default(0),
    tier: text("tier", { enum: PATRON_TIER_KEYS }).notNull().default("none"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    ...timestamps,
  },
  (table) => [
    index("patron_user_id_idx").on(table.userId),
    index("patron_patreon_user_id_idx").on(table.patreonUserId),
    index("patron_tier_idx").on(table.tier),
  ]
);

export const patreonWebhookRequest = pgTable(
  "patreon_webhook_request",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    body: text("body").notNull(),
    event: text("event"),
    headers: jsonb("headers").$type<Record<string, string>>().notNull(),
    method: text("method").notNull(),
    processingError: text("processing_error"),
    processingStatus: text("processing_status", {
      enum: ["stored", "processed", "ignored", "invalid", "failed"],
    })
      .default("stored")
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    responseStatus: integer("response_status"),
    signature: text("signature"),
    url: text("url").notNull(),
    ...timestamps,
  },
  (table) => [
    index("patreon_webhook_request_created_at_idx").on(table.createdAt),
    index("patreon_webhook_request_event_idx").on(table.event),
    index("patreon_webhook_request_status_idx").on(table.processingStatus),
  ]
);

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account),
  collectibleCardsOwned: many(cardInstance, {
    relationName: "card_instance_owner",
  }),
  collectibleCustodyCreated: many(collectibleCustody, {
    relationName: "collectible_custody_actor",
  }),
  collectibleTradeOffersProposed: many(tradeOffer, {
    relationName: "trade_offer_proposer",
  }),
  collectibleTradeOffersReceived: many(tradeOffer, {
    relationName: "trade_offer_recipient",
  }),
  collectibleTradeOffersActed: many(tradeOffer, {
    relationName: "trade_offer_actor",
  }),
  collectibleTradeHistoryActed: many(tradeOfferHistory, {
    relationName: "trade_offer_history_actor",
  }),
  collectibleGiftOffersSent: many(giftOffer, {
    relationName: "gift_offer_sender",
  }),
  collectibleGiftOffersReceived: many(giftOffer, {
    relationName: "gift_offer_recipient",
  }),
  collectibleGiftOffersActed: many(giftOffer, {
    relationName: "gift_offer_actor",
  }),
  collectibleGiftHistoryActed: many(giftOfferHistory, {
    relationName: "gift_offer_history_actor",
  }),
  blackMarketListingsSold: many(blackMarketListing, {
    relationName: "black_market_listing_seller",
  }),
  blackMarketListingAuditsActed: many(blackMarketListingAudit),
  blackMarketSalesBought: many(blackMarketSale, {
    relationName: "black_market_sale_buyer",
  }),
  blackMarketSalesSold: many(blackMarketSale, {
    relationName: "black_market_sale_seller",
  }),
  blackMarketRiskSignals: many(blackMarketRiskSignal),
  blocksCreated: many(userBlock, { relationName: "user_block_blocker" }),
  blockedBy: many(userBlock, { relationName: "user_block_blocked" }),
  collectibleGrantCampaignsCreated: many(collectibleGrantCampaign, {
    relationName: "collectible_grant_campaign_creator",
  }),
  collectibleGrantExecutionsActed: many(collectibleGrantExecution, {
    relationName: "collectible_grant_execution_actor",
  }),
  collectibleGrantExecutionsReceived: many(collectibleGrantExecution, {
    relationName: "collectible_grant_execution_recipient",
  }),
  collectibleOwnershipEventsActed: many(collectibleOwnershipEvent, {
    relationName: "collectible_ownership_event_actor",
  }),
  collectibleOwnershipEventsFrom: many(collectibleOwnershipEvent, {
    relationName: "collectible_ownership_event_from",
  }),
  collectibleOwnershipEventsTo: many(collectibleOwnershipEvent, {
    relationName: "collectible_ownership_event_to",
  }),
  collectibleAdminActionsActed: many(collectibleAdminAction),
  collectiblePacksOwned: many(packInstance, {
    relationName: "pack_instance_owner",
  }),
  collectiblePackOpenings: many(packOpening, {
    relationName: "pack_opening_owner",
  }),
  gachaponActivations: many(gachaponActivation, {
    relationName: "gachapon_activation_user",
  }),
  gachaponMachineAudits: many(gachaponMachineAuditEvent),
  gachaponMachinesCreated: many(gachaponMachine, {
    relationName: "gachapon_machine_created_by",
  }),
  gachaponMachinesUpdated: many(gachaponMachine, {
    relationName: "gachapon_machine_updated_by",
  }),
  gachaponMachineUsage: many(gachaponMachineUsage),
  officialCardShopOffersCreated: many(officialCardShopOffer, {
    relationName: "official_card_shop_offer_created_by",
  }),
  officialCardShopOffersUpdated: many(officialCardShopOffer, {
    relationName: "official_card_shop_offer_updated_by",
  }),
  officialCardShopOfferAuditEvents: many(officialCardShopOfferAuditEvent),
  officialCardShopOfferUsage: many(officialCardShopOfferUsage),
  officialCardShopPurchases: many(officialCardShopPurchase, {
    relationName: "official_card_shop_purchase_buyer",
  }),
  commentLikes: many(commentLikes),
  comicProgress: many(userComicProgress),
  forbiddenContentRulesCreated: many(forbiddenContentRule, {
    relationName: "forbidden_content_rule_created_by",
  }),
  forbiddenContentRulesUpdated: many(forbiddenContentRule, {
    relationName: "forbidden_content_rule_updated_by",
  }),
  patron: one(patron),
  postRatingLikes: many(postRatingLikes),
  profileEmblemAssignments: many(profileEmblemAssignment),
  profileMediaAssets: many(profileMediaAsset),
  profileRoleAssignments: many(profileRoleAssignment),
  profileSettings: one(profileSettings),
  sessions: many(session),
  twoFactors: many(twoFactor),
  xpRewardBlocksCreated: many(xpRewardBlock, {
    relationName: "xp_reward_block_created_by",
  }),
  xpRewardBlocksOwned: many(xpRewardBlock, {
    relationName: "xp_reward_block_user",
  }),
  xpRewardSubjects: many(xpRewardSubject),
}));

export const patronRelations = relations(patron, ({ one }) => ({
  user: one(user, {
    fields: [patron.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

/** -------------------------------------------------------- */

export const postTypeEnum = pgEnum("post_type", ["post", "comic"]);
export const documentStatusEnum = pgEnum("document_status", DOCUMENT_STATUSES);
export const premiumLinksAccessLevelEnum = pgEnum(
  "premium_links_access_level",
  PREMIUM_LINK_ACCESS_LEVELS
);
export const engagementPromptSourceEnum = pgEnum("engagement_prompt_source", [
  "manual",
  "tag",
]);
export const featuredPositionEnum = pgEnum("featured_position", [
  "main",
  "secondary",
]);
export const forbiddenContentKindEnum = pgEnum("forbidden_content_kind", [
  "term",
  "word",
  "url",
]);

export const xpEventKindEnum = pgEnum("xp_event_kind", [
  "comic_reading",
  "review_milestone",
  "comment_milestone",
  "streak_day",
  "streak_challenge",
  "admin_adjustment",
  "reversal",
]);
export const xpEventStateEnum = pgEnum("xp_event_state", [
  "pending",
  "posted",
  "cancelled",
]);
export const streakDiscoveryActionKindEnum = pgEnum(
  "streak_discovery_action_kind",
  ["bookmark", "follow", "rating"]
);
export const streakProtectionKindEnum = pgEnum("streak_protection_kind", [
  "outage",
  "pause",
]);
export const xpRewardSubjectKindEnum = pgEnum("xp_reward_subject_kind", [
  "review",
  "comment",
]);
export const xpRewardDeletionReasonEnum = pgEnum("xp_reward_deletion_reason", [
  "voluntary",
  "guideline_abuse",
  "parent_removed",
]);
export const xpRewardBlockKindEnum = pgEnum("xp_reward_block_kind", [
  "review",
  "comment",
  "comic",
]);
export const xpIntegrityRiskLevelEnum = pgEnum("xp_integrity_risk_level", [
  "medium",
  "high",
]);
export const xpIntegrityCaseStatusEnum = pgEnum("xp_integrity_case_status", [
  "open",
  "released",
  "reversed",
  "dismissed",
]);
export const eterisWalletKindEnum = pgEnum(
  "eteris_wallet_kind",
  ETERIS_WALLET_KINDS
);
export const eterisWalletStatusEnum = pgEnum(
  "eteris_wallet_status",
  ETERIS_WALLET_STATUSES
);
export const eterisTransactionKindEnum = pgEnum(
  "eteris_transaction_kind",
  ETERIS_TRANSACTION_KINDS
);
export const cardRarityEnum = pgEnum("card_rarity", [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);
export const cardLifecycleEnum = pgEnum("card_lifecycle", [
  "draft",
  "active",
  "retired",
]);
export const cardTemplateAvailabilityEnum = pgEnum(
  "card_template_availability",
  ["active", "disabled"]
);
export const cardInstanceAvailabilityEnum = pgEnum(
  "card_instance_availability",
  ["active", "frozen"]
);
export const collectibleBindingEnum = pgEnum("collectible_binding", [
  "transferable",
  "account-bound",
]);
export const cardRenderVariantEnum = pgEnum("card_render_variant", [
  "standard",
  "thumbnail",
  "static",
  "reduced-motion",
]);
export const cardTemplateAuditActionEnum = pgEnum(
  "card_template_audit_action",
  ["create", "publish", "correction", "retire", "disable", "restore"]
);
export const packLifecycleEnum = pgEnum("pack_lifecycle", [
  "draft",
  "active",
  "retired",
]);
export const packRevisionLifecycleEnum = pgEnum("pack_revision_lifecycle", [
  "draft",
  "published",
]);
export const packRevisionStateEnum = packRevisionLifecycleEnum;
export const packRevisionAvailabilityEnum = pgEnum(
  "pack_revision_availability",
  ["active", "disabled", "exhausted"]
);
export const packDuplicatePolicyEnum = pgEnum("pack_duplicate_policy", [
  "allow",
  "no-duplicates",
]);
export const packBindingPolicyEnum = pgEnum("pack_binding_policy", [
  "transferable",
  "account-bound",
  "either",
]);
export const packInstanceStateEnum = pgEnum("pack_instance_state", [
  "unopened",
  "opened",
]);
export const collectibleOwnershipEventKindEnum = pgEnum(
  "collectible_ownership_event_kind",
  [
    "pseudonymization",
    "issuance",
    "grant",
    "opening",
    "transfer",
    "correction",
    "trade",
    "gift",
    "sale",
  ]
);
export const collectibleCustodySideEnum = pgEnum("collectible_custody_side", [
  "proposer",
  "recipient",
]);
export const tradeOfferStateEnum = pgEnum("trade_offer_state", [
  "sent",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "administratively-cancelled",
]);
export const tradeOfferHistoryActionEnum = pgEnum(
  "trade_offer_history_action",
  [
    "sent",
    "accepted",
    "rejected",
    "cancelled",
    "expired",
    "administratively-cancelled",
    "counteroffer",
  ]
);
export const giftOfferStateEnum = pgEnum("gift_offer_state", [
  "sent",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "administratively-cancelled",
]);
export const giftOfferHistoryActionEnum = pgEnum("gift_offer_history_action", [
  "sent",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "administratively-cancelled",
]);
export const blackMarketListingStateEnum = pgEnum(
  "black_market_listing_state",
  ["active", "sold", "cancelled", "expired", "administratively-cancelled"]
);
export const blackMarketListingAuditActionEnum = pgEnum(
  "black_market_listing_audit_action",
  [
    "published",
    "cancelled",
    "expired",
    "administratively-cancelled",
    "sold",
    "fee-reversed",
    "correction",
  ]
);
export const blackMarketRiskSignalKindEnum = pgEnum(
  "black_market_risk_signal_kind",
  [
    "reciprocal-activity",
    "related-accounts",
    "extreme-price",
    "repeated-transfers",
    "rapid-relisting",
    "repeated-cancellation",
  ]
);
export const collectibleGrantTargetKindEnum = pgEnum(
  "collectible_grant_target_kind",
  ["card", "pack"]
);
export const collectibleGrantCampaignStateEnum = pgEnum(
  "collectible_grant_campaign_state",
  ["draft", "active", "paused", "retired"]
);
export const officialCardShopOfferAuditActionEnum = pgEnum(
  "official_card_shop_offer_audit_action",
  [
    "create",
    "update",
    "schedule",
    "enable",
    "disable",
    "restock",
    "reduce_quota",
  ]
);
export const gachaponMachineStateEnum = pgEnum("gachapon_machine_state", [
  "draft",
  "active",
  "paused",
  "exhausted",
  "retired",
]);
export const gachaponMachineAuditActionEnum = pgEnum(
  "gachapon_machine_audit_action",
  ["create", "update", "activate", "pause", "resume", "exhaust", "retire"]
);
export const collectibleAdminActionKindEnum = pgEnum(
  "collectible_admin_action_kind",
  [
    "freeze",
    "restore",
    "disable",
    "retire",
    "cancel",
    "release-custody",
    "retain-custody",
    "correct",
    "exceptional-grant",
    "exceptional-transfer",
    "reverse-eteris",
    "publish-impact",
  ]
);
export const collectibleAdminTargetKindEnum = pgEnum(
  "collectible_admin_target_kind",
  [
    "card-instance",
    "pack-instance",
    "card-template",
    "pack-template",
    "pack-revision",
    "shop-offer",
    "gachapon-machine",
    "grant-campaign",
    "market-listing",
    "trade-offer",
    "gift-offer",
    "eteris-transaction",
  ]
);

export const term = pgTable("term", {
  color: text("color"),
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull(),
  taxonomy: text("taxonomy", { enum: TAXONOMIES }).notNull(),
  ...timestamps,
});

export const creator = pgTable(
  "creator",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    mediaId: text("media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    ...timestamps,
  },
  (table) => [
    index("creator_media_id_idx").on(table.mediaId),
    index("creator_name_idx").on(table.name),
  ]
);

export const comicCreator = pgTable(
  "comic_creator",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    ...timestamps,
  },
  (table) => [index("comic_creator_name_idx").on(table.name)]
);

export const translator = pgTable(
  "translator",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    ...timestamps,
  },
  (table) => [index("translator_name_idx").on(table.name)]
);

export const contentSeries = pgTable(
  "content_series",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    title: text("title").notNull(),
    type: postTypeEnum("type").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("content_series_type_title_unique").on(table.type, table.title),
    index("content_series_type_title_idx").on(table.type, table.title),
    index("content_series_title_gin_idx").using(
      "gin",
      table.title.op("gin_trgm_ops")
    ),
  ]
);

export const post = pgTable(
  "post",
  {
    adsLinks: text("ads_links"),
    authorId: text("author_id").notNull(),
    changelog: text("changelog").notNull().default(""),
    comicLastUpdateAt: timestamp("comic_last_update_at", {
      withTimezone: true,
    }),
    comicPageCount: integer("comic_page_count").notNull().default(0),
    content: text("content").notNull().default(""),
    coverMediaId: text("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    creatorId: text("creator_id").references(() => creator.id, {
      onDelete: "set null",
    }),
    comicCreatorId: text("comic_creator_id").references(() => comicCreator.id, {
      onDelete: "set null",
    }),
    creatorLink: text("creator_link").notNull().default(""),
    creatorName: text("creator_name").notNull().default(""),
    earlyAccessEnabled: boolean("early_access_enabled")
      .notNull()
      .default(false),
    earlyAccessPublicAt: timestamp("early_access_public_at", {
      withTimezone: true,
    }),
    earlyAccessStartedAt: timestamp("early_access_started_at", {
      withTimezone: true,
    }),
    earlyAccessVip12EndsAt: timestamp("early_access_vip12_ends_at", {
      withTimezone: true,
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    imageObjectKeys: jsonb("image_object_keys").$type<string[]>(),
    isWeekly: boolean("is_weekly").notNull().default(false),
    thumbnailImageCount: integer("thumbnail_image_count").notNull().default(4),
    translatorId: text("translator_id").references(() => translator.id, {
      onDelete: "set null",
    }),
    premiumLinksAccessLevel: premiumLinksAccessLevelEnum(
      "premium_links_access_level"
    )
      .notNull()
      .default("auto"),
    premiumLinks: text("premium_links"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    seriesId: text("series_id").references(() => contentSeries.id, {
      onDelete: "set null",
    }),
    seriesOrder: integer("series_order").notNull().default(0),
    slug: text("slug").notNull(),
    status: documentStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    type: postTypeEnum("type").notNull().default("post"),
    vip12EarlyAccessHours: integer("vip12_early_access_hours")
      .notNull()
      .default(24),
    vip8EarlyAccessHours: integer("vip8_early_access_hours")
      .notNull()
      .default(48),
    version: text("version"),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("post_cover_media_id_idx").on(table.coverMediaId),
    index("post_comic_creator_id_idx").on(table.comicCreatorId),
    index("post_creator_id_idx").on(table.creatorId),
    index("post_translator_id_idx").on(table.translatorId),
    index("post_status_type_early_access_idx").on(
      table.status,
      table.type,
      table.earlyAccessPublicAt
    ),
    index("post_early_access_enabled_idx").on(table.earlyAccessEnabled),
    index("post_early_access_public_at_idx").on(table.earlyAccessPublicAt),
    index("post_title_gin_idx").using("gin", table.title.op("gin_trgm_ops")),
    index("post_series_id_order_idx").on(table.seriesId, table.seriesOrder),
    uniqueIndex("post_type_slug_unique").on(table.type, table.slug),
    index("post_type_slug_idx").on(table.type, table.slug),
    index("post_status_idx").on(table.status),
    index("post_created_at_idx").on(table.createdAt),
    index("post_released_at_idx").on(table.releasedAt),
  ]
);

export const mediaFolder = pgTable(
  "media_folder",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull(),
    parentId: text("parent_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "media_folder_parent_id_media_folder_id_fk",
    }).onDelete("set null"),
    index("media_folder_name_idx").on(table.name),
    index("media_folder_parent_id_idx").on(table.parentId),
  ]
);

export const comicUploadSession = pgTable(
  "comic_upload_session",
  {
    comicId: text("comic_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    issuedObjectCount: integer("issued_object_count").default(0).notNull(),
    title: text("title").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("comic_upload_session_expires_at_idx").on(table.expiresAt),
    index("comic_upload_session_user_id_idx").on(table.userId),
  ]
);

export const media = pgTable(
  "media",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    folderId: text("folder_id").references(() => mediaFolder.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    isAnimated: boolean("is_animated"),
    objectKey: text("object_key").notNull().unique(),
  },
  (table) => [
    index("media_created_at_idx").on(table.createdAt),
    index("media_folder_id_idx").on(table.folderId),
  ]
);

export const cardCharacter = pgTable(
  "card_character",
  {
    characterName: text("character_name").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    gameName: text("game_name").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    lifecycle: cardLifecycleEnum("lifecycle").notNull().default("draft"),
    normalizedCharacterName: text("normalized_character_name").notNull(),
    normalizedGameName: text("normalized_game_name").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("card_character_normalized_identity_unique").on(
      table.normalizedGameName,
      table.normalizedCharacterName
    ),
    index("card_character_lifecycle_idx").on(table.lifecycle),
    index("card_character_normalized_game_idx").on(table.normalizedGameName),
  ]
);

export const cardSeries = pgTable(
  "card_series",
  {
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull().default(""),
    id: text("id").primaryKey().$defaultFn(generateId),
    lifecycle: cardLifecycleEnum("lifecycle").notNull().default("draft"),
    name: text("name").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("card_series_lifecycle_idx").on(table.lifecycle),
    index("card_series_name_idx").on(table.name),
  ]
);

export const cardTemplate = pgTable(
  "card_template",
  {
    availability: cardTemplateAvailabilityEnum("availability")
      .notNull()
      .default("active"),
    characterId: text("character_id")
      .notNull()
      .references(() => cardCharacter.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull().default(""),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledByUserId: text("disabled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    edition: text("edition"),
    effectConfig: jsonb("effect_config")
      .$type<CardEffectConfig>()
      .notNull()
      .default({ effect: "none", intensity: "low" }),
    firstMintedAt: timestamp("first_minted_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    lifecycle: cardLifecycleEnum("lifecycle").notNull().default("draft"),
    lifetimeSupplyCeiling: integer("lifetime_supply_ceiling"),
    mintedSupply: integer("minted_supply").notNull().default(0),
    portraitMediaId: text("portrait_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    presentationMetadata: jsonb("presentation_metadata")
      .$type<CardPresentationMetadata>()
      .notNull()
      .default({
        accentColor: "#7c3aed",
        frameKey: "default",
        watermarkText: "NeXusTC",
      }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: text("published_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    renderIdentity: text("render_identity"),
    renderedVariants: jsonb("rendered_variants")
      .$type<CardRenderedVariant[]>()
      .notNull()
      .default([]),
    rarity: cardRarityEnum("rarity").notNull(),
    seriesId: text("series_id")
      .notNull()
      .references(() => cardSeries.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check(
      "card_template_minted_supply_check",
      sql`${table.mintedSupply} >= 0 AND (${table.lifetimeSupplyCeiling} IS NULL OR ${table.mintedSupply} <= ${table.lifetimeSupplyCeiling})`
    ),
    check(
      "card_template_lifetime_supply_ceiling_check",
      sql`${table.lifetimeSupplyCeiling} IS NULL OR ${table.lifetimeSupplyCeiling} > 0`
    ),
    check(
      "card_template_first_minted_at_consistency_check",
      sql`(${table.mintedSupply} = 0 AND ${table.firstMintedAt} IS NULL) OR (${table.mintedSupply} > 0 AND ${table.firstMintedAt} IS NOT NULL)`
    ),
    check("card_template_version_check", sql`${table.version} > 0`),
    index("card_template_character_idx").on(table.characterId),
    index("card_template_series_idx").on(table.seriesId),
    index("card_template_lifecycle_availability_idx").on(
      table.lifecycle,
      table.availability
    ),
    index("card_template_rarity_idx").on(table.rarity),
    index("card_template_supply_lock_idx").on(
      table.id,
      table.mintedSupply,
      table.lifetimeSupplyCeiling
    ),
  ]
);

export const cardTemplateRenderedVariant = pgTable(
  "card_template_rendered_variant",
  {
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    height: integer("height").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    objectKey: text("object_key").notNull().unique(),
    templateId: text("template_id")
      .notNull()
      .references(() => cardTemplate.id, { onDelete: "restrict" }),
    variant: cardRenderVariantEnum("variant").notNull(),
    width: integer("width").notNull(),
  },
  (table) => [
    uniqueIndex("card_template_rendered_variant_template_variant_unique").on(
      table.templateId,
      table.variant
    ),
    index("card_template_rendered_variant_template_idx").on(table.templateId),
  ]
);

export const cardTemplateAuditEvent = pgTable(
  "card_template_audit_event",
  {
    action: cardTemplateAuditActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    after: jsonb("after").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    reason: text("reason").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => cardTemplate.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("card_template_audit_event_template_created_idx").on(
      table.templateId,
      table.createdAt
    ),
    index("card_template_audit_event_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
  ]
);

/** Stable product identity. Published revisions are historical children. */
export const packTemplate = pgTable(
  "pack_template",
  {
    assetMediaId: text("asset_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull().default(""),
    id: text("id").primaryKey().$defaultFn(generateId),
    // The reverse FK is added in the generated migration after both tables
    // exist; keeping this column nullable also permits draft templates.
    latestPublishedRevisionId: text("latest_published_revision_id"),
    lifecycle: packLifecycleEnum("lifecycle").notNull().default("draft"),
    name: text("name").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: text("retired_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("pack_template_version_check", sql`${table.version} > 0`),
    index("pack_template_lifecycle_idx").on(table.lifecycle),
    index("pack_template_latest_revision_idx").on(
      table.latestPublishedRevisionId
    ),
  ]
);

/** A draft is mutable; published configuration is immutable after publication. */
export const packRevision = pgTable(
  "pack_revision",
  {
    availability: packRevisionAvailabilityEnum("availability")
      .notNull()
      .default("active"),
    bindingPolicy: packBindingPolicyEnum("binding_policy")
      .notNull()
      .default("either"),
    cardCount: integer("card_count").notNull(),
    configurationHash: text("configuration_hash"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    duplicatePolicy: packDuplicatePolicyEnum("duplicate_policy")
      .notNull()
      .default("allow"),
    id: text("id").primaryKey().$defaultFn(generateId),
    lifecycle: packRevisionLifecycleEnum("lifecycle")
      .notNull()
      .default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: text("published_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revision: integer("revision"),
    templateId: text("template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check(
      "pack_revision_card_count_check",
      sql`${table.cardCount} > 0 AND ${table.cardCount} <= 20`
    ),
    check(
      "pack_revision_published_metadata_check",
      sql`(${table.lifecycle} = 'draft' AND ${table.revision} IS NULL AND ${table.configurationHash} IS NULL) OR (${table.lifecycle} = 'published' AND ${table.revision} > 0 AND ${table.configurationHash} IS NOT NULL)`
    ),
    check("pack_revision_version_check", sql`${table.version} > 0`),
    uniqueIndex("pack_revision_template_revision_unique").on(
      table.templateId,
      table.revision
    ),
    index("pack_revision_template_lifecycle_idx").on(
      table.templateId,
      table.lifecycle
    ),
    index("pack_revision_availability_idx").on(table.availability),
    index("pack_revision_template_availability_idx").on(
      table.templateId,
      table.availability
    ),
  ]
);

export const packDrawGroup = pgTable(
  "pack_draw_group",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    drawCount: integer("draw_count").notNull(),
    guarantees: jsonb("guarantees")
      .$type<PackGuarantee[]>()
      .notNull()
      .default([]),
    id: text("id").primaryKey().$defaultFn(generateId),
    order: integer("order").notNull(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "pack_draw_group_draw_count_check",
      sql`${table.drawCount} > 0 AND ${table.drawCount} <= 20`
    ),
    check("pack_draw_group_order_check", sql`${table.order} > 0`),
    uniqueIndex("pack_draw_group_revision_order_unique").on(
      table.revisionId,
      table.order
    ),
    index("pack_draw_group_revision_idx").on(table.revisionId),
  ]
);

export const packDrawGroupRarityWeight = pgTable(
  "pack_draw_group_rarity_weight",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    drawGroupId: text("draw_group_id")
      .notNull()
      .references(() => packDrawGroup.id, { onDelete: "restrict" }),
    id: text("id").primaryKey().$defaultFn(generateId),
    rarity: cardRarityEnum("rarity").notNull(),
    weight: integer("weight").notNull(),
  },
  (table) => [
    check(
      "pack_draw_group_rarity_weight_bounds_check",
      sql`${table.weight} > 0 AND ${table.weight} <= 1000000`
    ),
    uniqueIndex("pack_draw_group_rarity_weight_unique").on(
      table.drawGroupId,
      table.rarity
    ),
    index("pack_draw_group_rarity_weight_group_idx").on(table.drawGroupId),
  ]
);

export const packDrawGroupCardWeight = pgTable(
  "pack_draw_group_card_weight",
  {
    cardTemplateId: text("card_template_id")
      .notNull()
      .references(() => cardTemplate.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    drawGroupId: text("draw_group_id")
      .notNull()
      .references(() => packDrawGroup.id, { onDelete: "restrict" }),
    id: text("id").primaryKey().$defaultFn(generateId),
    rarity: cardRarityEnum("rarity").notNull(),
    weight: integer("weight").notNull(),
  },
  (table) => [
    check(
      "pack_draw_group_card_weight_bounds_check",
      sql`${table.weight} > 0 AND ${table.weight} <= 1000000`
    ),
    uniqueIndex("pack_draw_group_card_weight_unique").on(
      table.drawGroupId,
      table.cardTemplateId
    ),
    index("pack_draw_group_card_weight_group_idx").on(table.drawGroupId),
    index("pack_draw_group_card_weight_template_idx").on(table.cardTemplateId),
  ]
);

/**
 * A Pack Instance is the ownership authority for an unopened pack.  Its
 * revision and outcome digest are immutable historical facts; state and
 * availability are deliberately separate so a frozen pack is still retained
 * without pretending it was opened.
 */
export const packInstance = pgTable(
  "pack_instance",
  {
    availability: cardInstanceAvailabilityEnum("availability")
      .notNull()
      .default("active"),
    binding: collectibleBindingEnum("binding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    issueReference: text("issue_reference").notNull(),
    issueSource: text("issue_source").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    outcomeDigest: text("outcome_digest").notNull(),
    // Closed accounts keep durable ownership under the opaque Eteris wallet
    // identity. The public owner FK is cleared before user deletion.
    closedOwnerWalletId: text("closed_owner_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
    state: packInstanceStateEnum("state").notNull().default("unopened"),
    templateId: text("template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "pack_instance_owner_identity_check",
      sql`num_nonnulls(${table.ownerUserId}, ${table.closedOwnerWalletId}) = 1`
    ),
    check(
      "pack_instance_opened_metadata_check",
      sql`(${table.state} = 'unopened' AND ${table.openedAt} IS NULL) OR (${table.state} = 'opened' AND ${table.openedAt} IS NOT NULL)`
    ),
    check("pack_instance_version_check", sql`${table.version} > 0`),
    index("pack_instance_owner_state_issued_idx").on(
      table.ownerUserId,
      table.state,
      table.issuedAt,
      table.id
    ),
    index("pack_instance_owner_template_issued_idx").on(
      table.ownerUserId,
      table.templateId,
      table.issuedAt,
      table.id
    ),
    index("pack_instance_owner_binding_idx").on(
      table.ownerUserId,
      table.binding,
      table.id
    ),
    index("pack_instance_revision_idx").on(table.revisionId),
    index("pack_instance_template_idx").on(table.templateId),
  ]
);

/**
 * The committed opening snapshot is the recovery/idempotency authority. It is
 * created in the same transaction as the ownership transfer, so a client can
 * safely refetch it after a disconnect without ever querying an Unopened Pack
 * outcome.
 */
export const packOpening = pgTable(
  "pack_opening",
  {
    cards: jsonb("cards").$type<PackOpeningCard[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ownerWalletId: text("owner_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    packInstanceId: text("pack_instance_id")
      .notNull()
      .references(() => packInstance.id, { onDelete: "restrict" })
      .unique(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "pack_opening_owner_identity_check",
      sql`num_nonnulls(${table.ownerUserId}, ${table.ownerWalletId}) = 1`
    ),
    uniqueIndex("pack_opening_idempotency_key_unique").on(table.idempotencyKey),
    index("pack_opening_owner_opened_idx").on(
      table.ownerUserId,
      table.openedAt,
      table.id
    ),
    index("pack_opening_revision_idx").on(table.revisionId),
  ]
);

/**
 * Card Instances are the only card ownership authority.  A hidden result has
 * a pack location and reveal order from issuance; an opened/directly issued
 * card has a user location.  The check makes the two locations mutually
 * exclusive at the database boundary.
 */
export const cardInstance = pgTable(
  "card_instance",
  {
    availability: cardInstanceAvailabilityEnum("availability")
      .notNull()
      .default("active"),
    binding: collectibleBindingEnum("binding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    issueReference: text("issue_reference").notNull(),
    issuanceSource: text("issuance_source").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    mintNumber: integer("mint_number").notNull(),
    closedOwnerWalletId: text("closed_owner_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    packInstanceId: text("pack_instance_id").references(() => packInstance.id, {
      onDelete: "restrict",
    }),
    revealOrder: integer("reveal_order"),
    templateId: text("template_id")
      .notNull()
      .references(() => cardTemplate.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "card_instance_exclusive_location_check",
      sql`num_nonnulls(${table.ownerUserId}, ${table.closedOwnerWalletId}, ${table.packInstanceId}) = 1`
    ),
    check("card_instance_mint_number_check", sql`${table.mintNumber} > 0`),
    check("card_instance_version_check", sql`${table.version} > 0`),
    check(
      "card_instance_reveal_order_location_check",
      sql`(${table.packInstanceId} IS NULL AND ${table.revealOrder} IS NULL) OR (${table.packInstanceId} IS NOT NULL AND ${table.revealOrder} > 0)`
    ),
    uniqueIndex("card_instance_template_mint_number_unique").on(
      table.templateId,
      table.mintNumber
    ),
    index("card_instance_owner_template_mint_idx").on(
      table.ownerUserId,
      table.templateId,
      table.mintNumber
    ),
    index("card_instance_owner_issued_idx").on(
      table.ownerUserId,
      table.issuedAt,
      table.id
    ),
    index("card_instance_owner_binding_idx").on(
      table.ownerUserId,
      table.binding,
      table.id
    ),
    index("card_instance_template_idx").on(table.templateId),
    index("card_instance_pack_instance_idx").on(table.packInstanceId),
  ]
);

/** Immutable private provenance for the authoritative Card/Pack rows. */
export const collectibleOwnershipEvent = pgTable(
  "collectible_ownership_event",
  {
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    cardInstanceId: text("card_instance_id").references(() => cardInstance.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fromUserId: text("from_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    fromWalletId: text("from_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    id: text("id").primaryKey().$defaultFn(generateId),
    kind: collectibleOwnershipEventKindEnum("kind").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    packInstanceId: text("pack_instance_id").references(() => packInstance.id, {
      onDelete: "restrict",
    }),
    sourceReference: text("source_reference").notNull(),
    sourceType: text("source_type").notNull(),
    toUserId: text("to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    toWalletId: text("to_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
  },
  (table) => [
    check(
      "collectible_ownership_event_one_asset_check",
      sql`(${table.cardInstanceId} IS NOT NULL) <> (${table.packInstanceId} IS NOT NULL)`
    ),
    index("collectible_ownership_event_card_occurred_idx").on(
      table.cardInstanceId,
      table.occurredAt,
      table.id
    ),
    index("collectible_ownership_event_pack_occurred_idx").on(
      table.packInstanceId,
      table.occurredAt,
      table.id
    ),
    index("collectible_ownership_event_to_user_occurred_idx").on(
      table.toUserId,
      table.occurredAt,
      table.id
    ),
  ]
);

/**
 * Retained exclusive reservation for a durable Card or Unopened Pack. A
 * released row is deliberately kept so an audit can reconstruct which offer
 * held an asset without exposing that private fact through collection reads.
 */
export const collectibleCustody = pgTable(
  "collectible_custody",
  {
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cardInstanceId: text("card_instance_id").references(() => cardInstance.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    packInstanceId: text("pack_instance_id").references(() => packInstance.id, {
      onDelete: "restrict",
    }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    side: collectibleCustodySideEnum("side").notNull(),
    tradeOfferId: text("trade_offer_id").references(() => tradeOffer.id, {
      onDelete: "restrict",
    }),
    giftOfferId: text("gift_offer_id").references(() => giftOffer.id, {
      onDelete: "restrict",
    }),
    blackMarketListingId: text("black_market_listing_id").references(
      () => blackMarketListing.id,
      { onDelete: "restrict" }
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "collectible_custody_one_asset_check",
      sql`(${table.cardInstanceId} IS NOT NULL) <> (${table.packInstanceId} IS NOT NULL)`
    ),
    check(
      "collectible_custody_one_parent_check",
      sql`num_nonnulls(${table.tradeOfferId}, ${table.giftOfferId}, ${table.blackMarketListingId}) = 1`
    ),
    check(
      "collectible_custody_release_reason_check",
      sql`${table.releasedAt} IS NULL OR length(trim(coalesce(${table.releaseReason}, ''))) > 0`
    ),
    uniqueIndex("collectible_custody_active_card_unique")
      .on(table.cardInstanceId)
      .where(
        sql`${table.releasedAt} IS NULL AND ${table.cardInstanceId} IS NOT NULL`
      ),
    uniqueIndex("collectible_custody_active_pack_unique")
      .on(table.packInstanceId)
      .where(
        sql`${table.releasedAt} IS NULL AND ${table.packInstanceId} IS NOT NULL`
      ),
    index("collectible_custody_trade_side_idx").on(
      table.tradeOfferId,
      table.side,
      table.createdAt,
      table.id
    ),
    index("collectible_custody_card_lookup_idx")
      .on(table.cardInstanceId, table.releasedAt, table.createdAt, table.id)
      .where(sql`${table.cardInstanceId} IS NOT NULL`),
    index("collectible_custody_pack_lookup_idx")
      .on(table.packInstanceId, table.releasedAt, table.createdAt, table.id)
      .where(sql`${table.packInstanceId} IS NOT NULL`),
    index("collectible_custody_trade_offer_idx").on(
      table.tradeOfferId,
      table.createdAt,
      table.id
    ),
    index("collectible_custody_gift_offer_idx").on(
      table.giftOfferId,
      table.createdAt,
      table.id
    ),
    index("collectible_custody_black_market_listing_idx").on(
      table.blackMarketListingId,
      table.createdAt,
      table.id
    ),
    index("collectible_custody_released_at_idx").on(
      table.releasedAt,
      table.createdAt,
      table.id
    ),
  ]
);

/** Immutable proposer-confirmed terms for the one-asset trade slice. */
export const tradeOffer = pgTable(
  "trade_offer",
  {
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    proposerConfirmedAt: timestamp("proposer_confirmed_at", {
      withTimezone: true,
    }).notNull(),
    proposerUserId: text("proposer_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    proposerWalletId: text("proposer_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    recipientUserId: text("recipient_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientWalletId: text("recipient_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    state: tradeOfferStateEnum("state").notNull().default("sent"),
    termsHash: text("terms_hash").notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    terminalReason: text("terminal_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check(
      "trade_offer_actor_identity_check",
      sql`num_nonnulls(${table.actorUserId}, ${table.actorWalletId}) = 1`
    ),
    check(
      "trade_offer_proposer_identity_check",
      sql`num_nonnulls(${table.proposerUserId}, ${table.proposerWalletId}) = 1`
    ),
    check(
      "trade_offer_recipient_identity_check",
      sql`num_nonnulls(${table.recipientUserId}, ${table.recipientWalletId}) = 1`
    ),
    check(
      "trade_offer_distinct_participants_check",
      sql`${table.state} <> 'sent' OR (${table.proposerUserId} IS NOT NULL AND ${table.recipientUserId} IS NOT NULL AND ${table.proposerUserId} <> ${table.recipientUserId})`
    ),
    check(
      "trade_offer_expiry_check",
      sql`${table.expiresAt} = ${table.sentAt} + interval '7 days'`
    ),
    check(
      "trade_offer_terminal_metadata_check",
      sql`${table.state} = 'sent' OR (${table.terminalAt} IS NOT NULL AND length(trim(coalesce(${table.terminalReason}, ''))) > 0)`
    ),
    check("trade_offer_version_check", sql`${table.version} > 0`),
    index("trade_offer_proposer_state_sent_idx").on(
      table.proposerUserId,
      table.state,
      table.sentAt,
      table.id
    ),
    index("trade_offer_recipient_state_sent_idx").on(
      table.recipientUserId,
      table.state,
      table.sentAt,
      table.id
    ),
    index("trade_offer_expiry_idx").on(table.state, table.expiresAt, table.id),
  ]
);

/** Append-only state transition/idempotency history for each Trade Offer. */
export const tradeOfferHistory = pgTable(
  "trade_offer_history",
  {
    action: tradeOfferHistoryActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    fromState: tradeOfferStateEnum("from_state"),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    offerId: text("offer_id")
      .notNull()
      .references(() => tradeOffer.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    termsHash: text("terms_hash").notNull(),
    toState: tradeOfferStateEnum("to_state").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    check("trade_offer_history_version_check", sql`${table.version} > 0`),
    index("trade_offer_history_offer_created_idx").on(
      table.offerId,
      table.createdAt,
      table.id
    ),
    index("trade_offer_history_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** Immutable sender-confirmed terms for a compensation-free Gift Offer. */
export const giftOffer = pgTable(
  "gift_offer",
  {
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    recipientUserId: text("recipient_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientWalletId: text("recipient_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    senderConfirmedAt: timestamp("sender_confirmed_at", {
      withTimezone: true,
    }).notNull(),
    senderUserId: text("sender_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    senderWalletId: text("sender_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    state: giftOfferStateEnum("state").notNull().default("sent"),
    termsHash: text("terms_hash").notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    terminalReason: text("terminal_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check(
      "gift_offer_actor_identity_check",
      sql`num_nonnulls(${table.actorUserId}, ${table.actorWalletId}) = 1`
    ),
    check(
      "gift_offer_sender_identity_check",
      sql`num_nonnulls(${table.senderUserId}, ${table.senderWalletId}) = 1`
    ),
    check(
      "gift_offer_recipient_identity_check",
      sql`num_nonnulls(${table.recipientUserId}, ${table.recipientWalletId}) = 1`
    ),
    check(
      "gift_offer_distinct_participants_check",
      sql`${table.state} <> 'sent' OR (${table.senderUserId} IS NOT NULL AND ${table.recipientUserId} IS NOT NULL AND ${table.senderUserId} <> ${table.recipientUserId})`
    ),
    check(
      "gift_offer_expiry_check",
      sql`${table.expiresAt} = ${table.sentAt} + interval '7 days'`
    ),
    check(
      "gift_offer_terminal_metadata_check",
      sql`${table.state} = 'sent' OR (${table.terminalAt} IS NOT NULL AND length(trim(coalesce(${table.terminalReason}, ''))) > 0)`
    ),
    check("gift_offer_version_check", sql`${table.version} > 0`),
    index("gift_offer_sender_state_sent_idx").on(
      table.senderUserId,
      table.state,
      table.sentAt,
      table.id
    ),
    index("gift_offer_recipient_state_sent_idx").on(
      table.recipientUserId,
      table.state,
      table.sentAt,
      table.id
    ),
    index("gift_offer_expiry_idx").on(table.state, table.expiresAt, table.id),
  ]
);

/** Append-only Gift Offer state transition and replay history. */
export const giftOfferHistory = pgTable(
  "gift_offer_history",
  {
    action: giftOfferHistoryActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    fromState: giftOfferStateEnum("from_state"),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    giftOfferId: text("gift_offer_id")
      .notNull()
      .references(() => giftOffer.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    termsHash: text("terms_hash").notNull(),
    toState: giftOfferStateEnum("to_state").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    check("gift_offer_history_version_check", sql`${table.version} > 0`),
    index("gift_offer_history_offer_created_idx").on(
      table.giftOfferId,
      table.createdAt,
      table.id
    ),
    index("gift_offer_history_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** Immutable fixed-price listing. Asset identity lives in retained custody. */
export const blackMarketListing = pgTable(
  "black_market_listing",
  {
    askingPrice: bigint("asking_price", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    feeReversalTransactionId: text("fee_reversal_transaction_id")
      .references(() => eterisTransaction.id, { onDelete: "restrict" })
      .unique(),
    feeTransactionId: text("fee_transaction_id")
      .notNull()
      .references(() => eterisTransaction.id, { onDelete: "restrict" })
      .unique(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    listingFee: bigint("listing_fee", { mode: "bigint" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sellerUserId: text("seller_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sellerWalletId: text("seller_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    state: blackMarketListingStateEnum("state").notNull().default("active"),
    termsHash: text("terms_hash").notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    terminalReason: text("terminal_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check(
      "black_market_listing_seller_identity_check",
      sql`num_nonnulls(${table.sellerUserId}, ${table.sellerWalletId}) = 1`
    ),
    check("black_market_listing_price_check", sql`${table.askingPrice} > 0`),
    check(
      "black_market_listing_fee_check",
      sql`${table.listingFee} > 0 AND ${table.listingFee} <= ${table.askingPrice}`
    ),
    check(
      "black_market_listing_expiry_check",
      sql`${table.expiresAt} = ${table.publishedAt} + interval '30 days'`
    ),
    check(
      "black_market_listing_terminal_metadata_check",
      sql`${table.state} = 'active' OR (${table.terminalAt} IS NOT NULL AND length(trim(coalesce(${table.terminalReason}, ''))) > 0)`
    ),
    check("black_market_listing_version_check", sql`${table.version} > 0`),
    index("black_market_listing_active_expiry_idx").on(
      table.state,
      table.expiresAt,
      table.id
    ),
    index("black_market_listing_active_price_idx").on(
      table.state,
      table.askingPrice,
      table.id
    ),
    index("black_market_listing_active_published_idx").on(
      table.state,
      table.publishedAt,
      table.id
    ),
    index("black_market_listing_seller_state_idx").on(
      table.sellerUserId,
      table.state,
      table.publishedAt,
      table.id
    ),
  ]
);

/** Append-only listing transitions and command replay records. */
export const blackMarketListingAudit = pgTable(
  "black_market_listing_audit",
  {
    action: blackMarketListingAuditActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    after: jsonb("after").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    listingId: text("listing_id")
      .notNull()
      .references(() => blackMarketListing.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    check(
      "black_market_listing_audit_reason_check",
      sql`length(trim(${table.reason})) > 0`
    ),
    check(
      "black_market_listing_audit_version_check",
      sql`${table.version} > 0`
    ),
    index("black_market_listing_audit_listing_created_idx").on(
      table.listingId,
      table.createdAt,
      table.id
    ),
    index("black_market_listing_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** Immutable successful sale, linked one-to-one to its Eteris journal. */
export const blackMarketSale = pgTable(
  "black_market_sale",
  {
    askingPrice: bigint("asking_price", { mode: "bigint" }).notNull(),
    buyerUserId: text("buyer_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    buyerWalletId: text("buyer_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    eterisTransactionId: text("eteris_transaction_id")
      .notNull()
      .references(() => eterisTransaction.id, { onDelete: "restrict" })
      .unique(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    listingId: text("listing_id")
      .notNull()
      .references(() => blackMarketListing.id, { onDelete: "restrict" })
      .unique(),
    sellerUserId: text("seller_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sellerWalletId: text("seller_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
  },
  (table) => [
    check(
      "black_market_sale_buyer_identity_check",
      sql`num_nonnulls(${table.buyerUserId}, ${table.buyerWalletId}) = 1`
    ),
    check(
      "black_market_sale_seller_identity_check",
      sql`num_nonnulls(${table.sellerUserId}, ${table.sellerWalletId}) = 1`
    ),
    check("black_market_sale_price_check", sql`${table.askingPrice} > 0`),
    index("black_market_sale_buyer_created_idx").on(
      table.buyerUserId,
      table.createdAt,
      table.id
    ),
    index("black_market_sale_seller_created_idx").on(
      table.sellerUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** Private, structured review evidence. Signals never mutate a sale. */
export const blackMarketRiskSignal = pgTable(
  "black_market_risk_signal",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    listingId: text("listing_id").references(() => blackMarketListing.id, {
      onDelete: "restrict",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    saleId: text("sale_id").references(() => blackMarketSale.id, {
      onDelete: "restrict",
    }),
    signal: blackMarketRiskSignalKindEnum("signal").notNull(),
    severity: text("severity", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("low"),
    subjectUserId: text("subject_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    check(
      "black_market_risk_signal_target_check",
      sql`num_nonnulls(${table.listingId}, ${table.saleId}, ${table.subjectUserId}) >= 1`
    ),
    index("black_market_risk_signal_listing_created_idx").on(
      table.listingId,
      table.createdAt,
      table.id
    ),
    index("black_market_risk_signal_subject_created_idx").on(
      table.subjectUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** Bounded ordinary grant policy; no endpoint may mint outside this row. */
export const collectibleGrantCampaign = pgTable(
  "collectible_grant_campaign",
  {
    auditReason: text("audit_reason").notNull(),
    binding: collectibleBindingEnum("binding").notNull(),
    cardTemplateId: text("card_template_id").references(() => cardTemplate.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    eligibilityExplanation: text("eligibility_explanation").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    perAccountQuantity: integer("per_account_quantity").notNull(),
    packTemplateId: text("pack_template_id").references(() => packTemplate.id, {
      onDelete: "restrict",
    }),
    quantityCeiling: integer("quantity_ceiling").notNull(),
    quantityIssued: integer("quantity_issued").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    state: collectibleGrantCampaignStateEnum("state")
      .notNull()
      .default("draft"),
    targetKind: collectibleGrantTargetKindEnum("target_kind").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check(
      "collectible_grant_campaign_one_target_check",
      sql`(${table.cardTemplateId} IS NOT NULL) <> (${table.packTemplateId} IS NOT NULL)`
    ),
    check(
      "collectible_grant_campaign_target_kind_check",
      sql`(${table.targetKind} = 'card' AND ${table.cardTemplateId} IS NOT NULL AND ${table.packTemplateId} IS NULL) OR (${table.targetKind} = 'pack' AND ${table.packTemplateId} IS NOT NULL AND ${table.cardTemplateId} IS NULL)`
    ),
    check(
      "collectible_grant_campaign_quantity_check",
      sql`${table.quantityCeiling} > 0 AND ${table.perAccountQuantity} > 0 AND ${table.quantityIssued} >= 0 AND ${table.quantityIssued} <= ${table.quantityCeiling}`
    ),
    check(
      "collectible_grant_campaign_reason_check",
      sql`length(trim(${table.auditReason})) > 0 AND length(trim(${table.eligibilityExplanation})) > 0`
    ),
    check(
      "collectible_grant_campaign_window_check",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
    ),
    check(
      "collectible_grant_campaign_version_check",
      sql`${table.version} > 0`
    ),
    index("collectible_grant_campaign_state_window_idx").on(
      table.state,
      table.startsAt,
      table.endsAt
    ),
    index("collectible_grant_campaign_card_target_idx").on(
      table.cardTemplateId
    ),
    index("collectible_grant_campaign_pack_target_idx").on(
      table.packTemplateId
    ),
  ]
);

/** One immutable, idempotent execution result for a grant campaign. */
export const collectibleGrantExecution = pgTable(
  "collectible_grant_execution",
  {
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => collectibleGrantCampaign.id, { onDelete: "restrict" }),
    cardInstanceId: text("card_instance_id").references(() => cardInstance.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    packInstanceId: text("pack_instance_id").references(() => packInstance.id, {
      onDelete: "restrict",
    }),
    quantity: integer("quantity").notNull().default(1),
    recipientUserId: text("recipient_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientWalletId: text("recipient_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    resultAssetIds: jsonb("result_asset_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    resultAt: timestamp("result_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "collectible_grant_execution_one_result_check",
      sql`(${table.cardInstanceId} IS NOT NULL) <> (${table.packInstanceId} IS NOT NULL)`
    ),
    check(
      "collectible_grant_execution_quantity_check",
      sql`${table.quantity} > 0`
    ),
    check(
      "collectible_grant_execution_recipient_identity_check",
      sql`num_nonnulls(${table.recipientUserId}, ${table.recipientWalletId}) = 1`
    ),
    uniqueIndex("collectible_grant_execution_campaign_recipient_idx").on(
      table.campaignId,
      table.recipientUserId,
      table.id
    ),
    index("collectible_grant_execution_campaign_created_idx").on(
      table.campaignId,
      table.createdAt,
      table.id
    ),
    index("collectible_grant_execution_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
      table.id
    ),
  ]
);

/** A configurable product offer. It deliberately points at a Pack Template;
 * issuance resolves that template's latest published revision at purchase. */
export const officialCardShopOffer = pgTable(
  "official_card_shop_offer",
  {
    binding: collectibleBindingEnum("binding")
      .notNull()
      .default("transferable"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(false),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    packTemplateId: text("pack_template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    perAccountLimit: integer("per_account_limit"),
    price: bigint("price", { mode: "bigint" }).notNull(),
    remainingSales: integer("remaining_sales"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    totalSold: integer("total_sold").notNull().default(0),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("official_card_shop_offer_price_check", sql`${table.price} > 0`),
    check(
      "official_card_shop_offer_remaining_sales_check",
      sql`${table.remainingSales} IS NULL OR ${table.remainingSales} >= 0`
    ),
    check(
      "official_card_shop_offer_per_account_limit_check",
      sql`${table.perAccountLimit} IS NULL OR ${table.perAccountLimit} > 0`
    ),
    check(
      "official_card_shop_offer_total_sold_check",
      sql`${table.totalSold} >= 0`
    ),
    check(
      "official_card_shop_offer_window_check",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
    ),
    check("official_card_shop_offer_version_check", sql`${table.version} > 0`),
    index("official_card_shop_offer_template_idx").on(table.packTemplateId),
    index("official_card_shop_offer_availability_idx").on(
      table.enabled,
      table.startsAt,
      table.endsAt
    ),
    index("official_card_shop_offer_remaining_sales_idx").on(
      table.remainingSales
    ),
  ]
);

/** Append-only operational history for every offer transition. */
export const officialCardShopOfferAuditEvent = pgTable(
  "official_card_shop_offer_audit_event",
  {
    action: officialCardShopOfferAuditActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    after: jsonb("after").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    offerId: text("offer_id")
      .notNull()
      .references(() => officialCardShopOffer.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    check(
      "official_card_shop_offer_audit_reason_check",
      sql`length(trim(${table.reason})) > 0`
    ),
    index("official_card_shop_offer_audit_offer_created_idx").on(
      table.offerId,
      table.createdAt,
      table.id
    ),
    index("official_card_shop_offer_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
  ]
);

/** Atomically maintained per-account usage projection for offer limits. */
export const officialCardShopOfferUsage = pgTable(
  "official_card_shop_offer_usage",
  {
    offerId: text("offer_id")
      .notNull()
      .references(() => officialCardShopOffer.id, { onDelete: "restrict" }),
    purchasedQuantity: integer("purchased_quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.offerId, table.userId] }),
    check(
      "official_card_shop_offer_usage_quantity_check",
      sql`${table.purchasedQuantity} >= 0`
    ),
    index("official_card_shop_offer_usage_user_idx").on(table.userId),
  ]
);

/** Immutable successful purchase, linked one-to-one to the Eteris journal. */
export const officialCardShopPurchase = pgTable(
  "official_card_shop_purchase",
  {
    binding: collectibleBindingEnum("binding").notNull(),
    buyerUserId: text("buyer_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    buyerWalletId: text("buyer_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    eterisTransactionId: text("eteris_transaction_id")
      .notNull()
      .references(() => eterisTransaction.id, { onDelete: "restrict" })
      .unique(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    offerId: text("offer_id")
      .notNull()
      .references(() => officialCardShopOffer.id, { onDelete: "restrict" }),
    packTemplateId: text("pack_template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
    totalPrice: bigint("total_price", { mode: "bigint" }).notNull(),
    unitPrice: bigint("unit_price", { mode: "bigint" }).notNull(),
    offerVersion: integer("offer_version").notNull(),
  },
  (table) => [
    check(
      "official_card_shop_purchase_buyer_identity_check",
      sql`num_nonnulls(${table.buyerUserId}, ${table.buyerWalletId}) = 1`
    ),
    check(
      "official_card_shop_purchase_quantity_check",
      sql`${table.quantity} BETWEEN 1 AND 10`
    ),
    check(
      "official_card_shop_purchase_price_check",
      sql`${table.unitPrice} > 0 AND ${table.totalPrice} > 0`
    ),
    index("official_card_shop_purchase_buyer_created_idx").on(
      table.buyerUserId,
      table.createdAt,
      table.id
    ),
    index("official_card_shop_purchase_offer_created_idx").on(
      table.offerId,
      table.createdAt,
      table.id
    ),
  ]
);

/** One issued Pack Instance per purchased quantity unit. */
export const officialCardShopPurchaseItem = pgTable(
  "official_card_shop_purchase_item",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    ordinal: integer("ordinal").notNull(),
    packInstanceId: text("pack_instance_id")
      .notNull()
      .references(() => packInstance.id, { onDelete: "restrict" })
      .unique(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => officialCardShopPurchase.id, { onDelete: "restrict" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "official_card_shop_purchase_item_ordinal_check",
      sql`${table.ordinal} BETWEEN 1 AND 10`
    ),
    uniqueIndex("official_card_shop_purchase_item_purchase_ordinal_unique").on(
      table.purchaseId,
      table.ordinal
    ),
    index("official_card_shop_purchase_item_purchase_idx").on(table.purchaseId),
  ]
);

/**
 * A Gachapon Machine weights Pack Templates only.  Its entries are guarded by
 * an append-only trigger once the machine leaves draft, so an active machine
 * can never silently rewrite its public pool or its historical odds.
 */
export const gachaponMachine = pgTable(
  "gachapon_machine",
  {
    binding: collectibleBindingEnum("binding")
      .notNull()
      .default("transferable"),
    cost: bigint("cost", { mode: "bigint" }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull().default(""),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    globalQuota: integer("global_quota"),
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull(),
    perAccountLimit: integer("per_account_limit"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    state: gachaponMachineStateEnum("state").notNull().default("draft"),
    totalActivations: integer("total_activations").notNull().default(0),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    check("gachapon_machine_cost_check", sql`${table.cost} > 0`),
    check(
      "gachapon_machine_global_quota_check",
      sql`${table.globalQuota} IS NULL OR ${table.globalQuota} > 0`
    ),
    check(
      "gachapon_machine_per_account_limit_check",
      sql`${table.perAccountLimit} IS NULL OR ${table.perAccountLimit} > 0`
    ),
    check(
      "gachapon_machine_total_activations_check",
      sql`${table.totalActivations} >= 0 AND (${table.globalQuota} IS NULL OR ${table.totalActivations} <= ${table.globalQuota})`
    ),
    check(
      "gachapon_machine_window_check",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
    ),
    check("gachapon_machine_version_check", sql`${table.version} > 0`),
    index("gachapon_machine_state_idx").on(table.state),
    index("gachapon_machine_availability_idx").on(
      table.state,
      table.startsAt,
      table.endsAt
    ),
    index("gachapon_machine_quota_idx").on(
      table.globalQuota,
      table.totalActivations
    ),
  ]
);

/** Positive integer Pack Template weights. */
export const gachaponMachinePackEntry = pgTable(
  "gachapon_machine_pack_entry",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    machineId: text("machine_id")
      .notNull()
      .references(() => gachaponMachine.id, { onDelete: "restrict" }),
    packTemplateId: text("pack_template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    weight: integer("weight").notNull(),
  },
  (table) => [
    check(
      "gachapon_machine_pack_entry_weight_check",
      sql`${table.weight} > 0 AND ${table.weight} <= 1000000`
    ),
    uniqueIndex("gachapon_machine_pack_entry_machine_template_unique").on(
      table.machineId,
      table.packTemplateId
    ),
    index("gachapon_machine_pack_entry_machine_idx").on(table.machineId),
    index("gachapon_machine_pack_entry_template_idx").on(table.packTemplateId),
  ]
);

/** Atomically maintained per-account activation usage projection. */
export const gachaponMachineUsage = pgTable(
  "gachapon_machine_usage",
  {
    activationCount: integer("activation_count").notNull().default(0),
    machineId: text("machine_id")
      .notNull()
      .references(() => gachaponMachine.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.machineId, table.userId] }),
    check(
      "gachapon_machine_usage_activation_count_check",
      sql`${table.activationCount} >= 0`
    ),
    index("gachapon_machine_usage_user_idx").on(table.userId),
  ]
);

/** Immutable successful activation, linked one-to-one to Eteris and Pack. */
export const gachaponActivation = pgTable(
  "gachapon_activation",
  {
    chargedCost: bigint("charged_cost", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    eterisTransactionId: text("eteris_transaction_id")
      .notNull()
      .references(() => eterisTransaction.id, { onDelete: "restrict" })
      .unique(),
    fingerprint: text("fingerprint").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    machineId: text("machine_id")
      .notNull()
      .references(() => gachaponMachine.id, { onDelete: "restrict" }),
    machineVersion: integer("machine_version").notNull(),
    packInstanceId: text("pack_instance_id")
      .notNull()
      .references(() => packInstance.id, { onDelete: "restrict" })
      .unique(),
    packTemplateId: text("pack_template_id")
      .notNull()
      .references(() => packTemplate.id, { onDelete: "restrict" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => packRevision.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    userWalletId: text("user_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
  },
  (table) => [
    check(
      "gachapon_activation_user_identity_check",
      sql`num_nonnulls(${table.userId}, ${table.userWalletId}) = 1`
    ),
    check("gachapon_activation_cost_check", sql`${table.chargedCost} > 0`),
    check(
      "gachapon_activation_machine_version_check",
      sql`${table.machineVersion} > 0`
    ),
    index("gachapon_activation_machine_created_idx").on(
      table.machineId,
      table.createdAt,
      table.id
    ),
    index("gachapon_activation_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id
    ),
    index("gachapon_activation_template_idx").on(table.packTemplateId),
  ]
);

/** Append-only operational history for machine configuration and state. */
export const gachaponMachineAuditEvent = pgTable(
  "gachapon_machine_audit_event",
  {
    action: gachaponMachineAuditActionEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    after: jsonb("after").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    machineId: text("machine_id")
      .notNull()
      .references(() => gachaponMachine.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    check(
      "gachapon_machine_audit_reason_check",
      sql`length(trim(${table.reason})) > 0`
    ),
    index("gachapon_machine_audit_machine_created_idx").on(
      table.machineId,
      table.createdAt,
      table.id
    ),
    index("gachapon_machine_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
  ]
);

/**
 * One append-only command record for operational collectible actions. Target
 * references are intentionally restrictive: deleting an economic or issuance
 * row must never erase the evidence that explains an administrative change.
 * The polymorphic targetId keeps the private cursor contract stable while the
 * nullable typed references provide database-level retention guarantees.
 */
export const collectibleAdminAction = pgTable(
  "collectible_admin_action",
  {
    action: collectibleAdminActionKindEnum("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorWalletId: text("actor_wallet_id").references(
      (): AnyPgColumn => eterisWallet.id,
      { onDelete: "restrict" }
    ),
    after: jsonb("after")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    before: jsonb("before")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    cardInstanceId: text("card_instance_id").references(() => cardInstance.id, {
      onDelete: "restrict",
    }),
    cardTemplateId: text("card_template_id").references(() => cardTemplate.id, {
      onDelete: "restrict",
    }),
    collectibleGrantCampaignId: text(
      "collectible_grant_campaign_id"
    ).references(() => collectibleGrantCampaign.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expectedVersion: integer("expected_version"),
    fingerprint: text("fingerprint").notNull(),
    gachaponMachineId: text("gachapon_machine_id").references(
      () => gachaponMachine.id,
      { onDelete: "restrict" }
    ),
    giftOfferId: text("gift_offer_id").references(() => giftOffer.id, {
      onDelete: "restrict",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    linkedActionId: text("linked_action_id").references(
      (): AnyPgColumn => collectibleAdminAction.id,
      { onDelete: "restrict" }
    ),
    linkedEterisTransactionId: text("linked_eteris_transaction_id").references(
      () => eterisTransaction.id,
      { onDelete: "restrict" }
    ),
    marketListingId: text("market_listing_id").references(
      () => blackMarketListing.id,
      { onDelete: "restrict" }
    ),
    packInstanceId: text("pack_instance_id").references(() => packInstance.id, {
      onDelete: "restrict",
    }),
    packRevisionId: text("pack_revision_id").references(() => packRevision.id, {
      onDelete: "restrict",
    }),
    packTemplateId: text("pack_template_id").references(() => packTemplate.id, {
      onDelete: "restrict",
    }),
    officialCardShopOfferId: text("official_card_shop_offer_id").references(
      () => officialCardShopOffer.id,
      { onDelete: "restrict" }
    ),
    reason: text("reason").notNull(),
    targetId: text("target_id").notNull(),
    targetKind: collectibleAdminTargetKindEnum("target_kind").notNull(),
    tradeOfferId: text("trade_offer_id").references(() => tradeOffer.id, {
      onDelete: "restrict",
    }),
    version: integer("version").notNull(),
  },
  (table) => [
    check(
      "collectible_admin_action_reason_check",
      sql`length(trim(${table.reason})) > 0`
    ),
    check("collectible_admin_action_version_check", sql`${table.version} > 0`),
    check(
      "collectible_admin_action_expected_version_check",
      sql`${table.expectedVersion} IS NULL OR ${table.expectedVersion} > 0`
    ),
    check(
      "collectible_admin_action_target_reference_check",
      sql`(
        (${table.targetKind} = 'card-instance' AND ${table.cardInstanceId} IS NOT NULL) OR
        (${table.targetKind} = 'card-template' AND ${table.cardTemplateId} IS NOT NULL) OR
        (${table.targetKind} = 'pack-instance' AND ${table.packInstanceId} IS NOT NULL) OR
        (${table.targetKind} = 'pack-template' AND ${table.packTemplateId} IS NOT NULL) OR
        (${table.targetKind} = 'pack-revision' AND ${table.packRevisionId} IS NOT NULL) OR
        (${table.targetKind} = 'shop-offer' AND ${table.officialCardShopOfferId} IS NOT NULL) OR
        (${table.targetKind} = 'gachapon-machine' AND ${table.gachaponMachineId} IS NOT NULL) OR
        (${table.targetKind} = 'grant-campaign' AND ${table.collectibleGrantCampaignId} IS NOT NULL) OR
        (${table.targetKind} = 'market-listing' AND ${table.marketListingId} IS NOT NULL) OR
        (${table.targetKind} = 'trade-offer' AND ${table.tradeOfferId} IS NOT NULL) OR
        (${table.targetKind} = 'gift-offer' AND ${table.giftOfferId} IS NOT NULL) OR
        (${table.targetKind} = 'eteris-transaction' AND ${table.linkedEterisTransactionId} IS NOT NULL)
      )`
    ),
    index("collectible_admin_action_created_cursor_idx").on(
      table.createdAt,
      table.id
    ),
    index("collectible_admin_action_target_idx").on(
      table.targetKind,
      table.targetId,
      table.createdAt,
      table.id
    ),
    index("collectible_admin_action_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
      table.id
    ),
    index("collectible_admin_action_linked_eteris_idx").on(
      table.linkedEterisTransactionId
    ),
  ]
);

export const postMedia = pgTable(
  "post_media",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.mediaId] }),
    index("post_media_post_id_sort_order_idx").on(
      table.postId,
      table.sortOrder
    ),
    index("post_media_media_id_idx").on(table.mediaId),
  ]
);

export const featuredPost = pgTable(
  "featured_post",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    order: integer("order").notNull(),
    position: featuredPositionEnum("position").notNull(),
    thumbnailMediaId: text("thumbnail_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("featured_post_post_id_idx").on(table.postId),
    index("featured_post_position_idx").on(table.position),
    index("featured_post_thumbnail_media_id_idx").on(table.thumbnailMediaId),
  ]
);

export const comment = pgTable(
  "comment",
  {
    authorId: text("author_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull(),
    engagementPromptId: text("engagement_prompt_id"),
    engagementPromptSource: engagementPromptSourceEnum(
      "engagement_prompt_source"
    ),
    engagementPromptText: text("engagement_prompt_text"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    parentId: text("parent_id"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    postId: text("post_id").references(() => post.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "comment_parent_id_comment_id_fk",
    }).onDelete("cascade"),
    index("comment_post_id_idx").on(table.postId),
    index("comment_parent_id_idx").on(table.parentId),
    index("comment_post_id_parent_id_idx").on(table.postId, table.parentId),
  ]
);

export const commentLikes = pgTable(
  "comment_like",
  {
    commentId: text("comment_id")
      .references(() => comment.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    emailVerifiedAtCreation: boolean("email_verified_at_creation")
      .default(false)
      .notNull(),
    xpAccrualEnabledAtCreation: boolean("xp_accrual_enabled_at_creation")
      .default(false)
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.commentId],
      name: "comment_like_user_id_comment_id_pk",
    }),
    index("comment_like_comment_id_idx").on(table.commentId),
  ]
);

export const termPostRelation = pgTable(
  "term_post_relation",
  {
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    termId: text("term_id")
      .notNull()
      .references(() => term.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.termId, table.postId] }),
    index("term_post_relation_post_id_idx").on(table.postId),
  ]
);

export const engagementQuestion = pgTable(
  "engagement_question",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    isGlobal: boolean("is_global").notNull().default(false),
    locale: text("locale").notNull().default("es"),
    tagTermId: text("tag_term_id").references(() => term.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    ...timestamps,
  },
  (table) => [
    index("engagement_question_tag_term_id_idx").on(table.tagTermId),
    index("engagement_question_tag_term_id_is_active_idx").on(
      table.tagTermId,
      table.isActive
    ),
    index("engagement_question_is_global_is_active_idx").on(
      table.isGlobal,
      table.isActive
    ),
  ]
);

export const engagementQuestionTagRelation = pgTable(
  "engagement_question_tag_relation",
  {
    engagementQuestionId: text("engagement_question_id").notNull(),
    termId: text("term_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.engagementQuestionId, table.termId],
      name: "eq_tag_relation_pk",
    }),
    foreignKey({
      columns: [table.engagementQuestionId],
      foreignColumns: [engagementQuestion.id],
      name: "eq_tag_relation_question_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.termId],
      foreignColumns: [term.id],
      name: "eq_tag_relation_term_fk",
    }).onDelete("cascade"),
    index("engagement_question_tag_relation_term_id_idx").on(table.termId),
  ]
);

export const engagementQuestionIncompatibleTagRelation = pgTable(
  "engagement_question_incompatible_tag_relation",
  {
    engagementQuestionId: text("engagement_question_id").notNull(),
    termId: text("term_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.engagementQuestionId, table.termId],
      name: "eq_incompat_tag_relation_pk",
    }),
    foreignKey({
      columns: [table.engagementQuestionId],
      foreignColumns: [engagementQuestion.id],
      name: "eq_incompat_tag_question_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.termId],
      foreignColumns: [term.id],
      name: "eq_incompat_tag_term_fk",
    }).onDelete("cascade"),
    index("engagement_question_incompatible_tag_relation_term_id_idx").on(
      table.termId
    ),
  ]
);

export const postEngagementOverride = pgTable(
  "post_engagement_override",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    text: text("text").notNull(),
    ...timestamps,
  },
  (table) => [
    index("post_engagement_override_post_id_idx").on(table.postId),
    index("post_engagement_override_post_id_sort_order_is_active_idx").on(
      table.postId,
      table.sortOrder,
      table.isActive
    ),
  ]
);

export const postBookmark = pgTable(
  "post_bookmark",
  {
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("post_bookmark_post_id_idx").on(table.postId),
  ]
);

export const postLikes = pgTable(
  "post_like",
  {
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("post_like_post_id_idx").on(table.postId),
  ]
);

export const postRating = pgTable(
  "post_rating",
  {
    id: text("id").notNull().unique().$defaultFn(generateId),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
      .notNull(),
    rating: integer("rating").notNull(),
    review: text("review").notNull().default(""),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.postId],
      name: "post_rating_user_id_post_id_pk",
    }),
    index("post_rating_post_id_idx").on(table.postId),
    index("post_rating_created_at_idx").on(table.createdAt),
  ]
);

export const postRatingLikes = pgTable(
  "post_rating_like",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    emailVerifiedAtCreation: boolean("email_verified_at_creation")
      .default(false)
      .notNull(),
    xpAccrualEnabledAtCreation: boolean("xp_accrual_enabled_at_creation")
      .default(false)
      .notNull(),
    ratingId: text("rating_id")
      .references(() => postRating.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.ratingId],
      name: "post_rating_like_user_id_rating_id_pk",
    }),
    index("post_rating_like_rating_id_idx").on(table.ratingId),
  ]
);

export const forbiddenContentRule = pgTable(
  "forbidden_content_rule",
  {
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    kind: forbiddenContentKindEnum("kind").notNull().default("term"),
    normalizedValue: text("normalized_value").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    value: text("value").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("forbidden_content_rule_kind_normalized_unique").on(
      table.kind,
      table.normalizedValue
    ),
    index("forbidden_content_rule_active_kind_idx").on(
      table.isActive,
      table.kind
    ),
  ]
);

export const userComicProgress = pgTable(
  "user_comic_progress",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastPageRead: integer("last_page_read").notNull().default(0),
    lastReadTimestamp: timestamp("last_read_timestamp", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    totalPagesAtLastRead: integer("total_pages_at_last_read")
      .notNull()
      .default(0),
    xpProcessedPageRanges: jsonb("xp_processed_page_ranges")
      .$type<[number, number][]>()
      .notNull()
      .default([]),
    xpTrackingUpdatedAt: timestamp("xp_tracking_updated_at", {
      withTimezone: true,
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verifiedThroughPage: integer("verified_through_page").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.comicId] }),
    index("user_comic_progress_comic_id_idx").on(table.comicId),
    index("user_comic_progress_user_completed_idx").on(
      table.userId,
      table.completed
    ),
    index("user_comic_progress_user_last_read_idx").on(
      table.userId,
      table.lastReadTimestamp
    ),
  ]
);

export const progressionSystem = pgTable(
  "progression_system",
  {
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    curveVersion: text("curve_version").notNull(),
    id: text("id").primaryKey(),
    ...timestamps,
  },
  (table) => [
    check(
      "progression_system_singleton_check",
      sql`${table.id} = 'account-progression'`
    ),
  ]
);

export const userProgression = pgTable(
  "user_progression",
  {
    level: smallint("level").notNull().default(1),
    pendingXp: integer("pending_xp").notNull().default(0),
    totalXp: integer("total_xp").notNull().default(0),
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    check(
      "user_progression_total_xp_check",
      sql`${table.totalXp} between 0 and 365000`
    ),
    check("user_progression_pending_xp_check", sql`${table.pendingXp} >= 0`),
    check(
      "user_progression_level_check",
      sql`${table.level} between 1 and 1000`
    ),
    index("user_progression_level_idx").on(table.level),
  ]
);

export type StreakEvidence = {
  completedPath?: "contribution" | "mixed_discovery" | "reading";
  contribution?: { sourceId: string; sourceKind: "comment" | "review" };
  discoveryCandidates?: {
    actionKind: "bookmark" | "follow" | "rating";
    contentKey: string;
  }[];
  readingPageKeys?: string[];
  pendingCompletion?: {
    path: "contribution" | "mixed_discovery" | "reading";
    receivedAt: string;
    trigger:
      | {
          kind: "contribution";
          normalizedLength: number;
          source: { id: string; kind: "comment" | "review" };
        }
      | { comicId: string; kind: "reading"; page: number }
      | {
          actionKind: "bookmark" | "follow" | "rating";
          contentKey: string;
          kind: "discovery";
        };
  };
};

export const userStreak = pgTable(
  "user_streak",
  {
    bestStreak: integer("best_streak").notNull().default(0),
    challengeCompletedAt: timestamp("challenge_completed_at", {
      withTimezone: true,
    }),
    challengeCompletedDayKey: text("challenge_completed_day_key"),
    challengeSelectedAt: timestamp("challenge_selected_at", {
      withTimezone: true,
    }),
    challengeTarget: integer("challenge_target"),
    currentEvidence: jsonb("current_evidence")
      .$type<StreakEvidence>()
      .notNull()
      .default({}),
    currentEvidenceDayKey: text("current_evidence_day_key"),
    currentStreak: integer("current_streak").notNull().default(0),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastCompletedDayKey: text("last_completed_day_key"),
    lastCompletedLocalDate: date("last_completed_local_date"),
    pendingTimezone: text("pending_timezone"),
    timezone: text("timezone").notNull(),
    timezoneChangeAvailableAt: timestamp("timezone_change_available_at", {
      withTimezone: true,
    }),
    timezoneChangeEffectiveAt: timestamp("timezone_change_effective_at", {
      withTimezone: true,
    }),
    timezoneVersion: integer("timezone_version").notNull().default(1),
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    check("user_streak_current_check", sql`${table.currentStreak} >= 0`),
    check("user_streak_best_check", sql`${table.bestStreak} >= 0`),
    check(
      "user_streak_challenge_target_check",
      sql`${table.challengeTarget} is null or ${table.challengeTarget} in (10, 20, 30)`
    ),
  ]
);

export const streakDiscoveryReceipt = pgTable(
  "streak_discovery_receipt",
  {
    actionKind: streakDiscoveryActionKindEnum("action_kind").notNull(),
    contentKey: text("content_key").notNull(),
    dayKey: text("day_key").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.actionKind, table.contentKey],
      name: "streak_discovery_receipt_user_action_content_pk",
    }),
  ]
);

export const streakProtectionWindow = pgTable(
  "streak_protection_window",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    kind: streakProtectionKindEnum("kind").notNull(),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "streak_protection_window_bounds_check",
      sql`${table.endsAt} > ${table.startsAt}`
    ),
    index("streak_protection_window_deadline_idx").on(
      table.endsAt,
      table.startsAt
    ),
  ]
);

export const xpRewardSubject = pgTable(
  "xp_reward_subject",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    dailyCapEligible: boolean("daily_cap_eligible").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletionReason: xpRewardDeletionReasonEnum("deletion_reason"),
    entityId: text("entity_id").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    kind: xpRewardSubjectKindEnum("kind").notNull(),
    normalizedContentHash: text("normalized_content_hash").notNull(),
    parentPostId: text("parent_post_id"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("xp_reward_subject_kind_entity_unique").on(
      table.kind,
      table.entityId
    ),
    index("xp_reward_subject_user_kind_hash_idx").on(
      table.userId,
      table.kind,
      table.normalizedContentHash
    ),
    index("xp_reward_subject_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  ]
);

export const xpIntegrityCase = pgTable(
  "xp_integrity_case",
  {
    autoReleaseAt: timestamp("auto_release_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    decisionReason: text("decision_reason"),
    evidence: jsonb("evidence")
      .$type<{ signals: { count: number; kind: string }[] }>()
      .notNull()
      .default({ signals: [] }),
    id: text("id").primaryKey().$defaultFn(generateId),
    riskLevel: xpIntegrityRiskLevelEnum("risk_level").notNull(),
    status: xpIntegrityCaseStatusEnum("status").notNull().default("open"),
    summary: text("summary").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("xp_integrity_case_status_risk_created_idx").on(
      table.status,
      table.riskLevel,
      table.createdAt
    ),
    index("xp_integrity_case_user_id_idx").on(table.userId),
  ]
);

export const xpRiskSignal = pgTable(
  "xp_risk_signal",
  {
    deviceHash: text("device_hash"),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    ipPrefixHash: text("ip_prefix_hash"),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("xp_risk_signal_expires_at_idx").on(table.expiresAt),
    index("xp_risk_signal_device_occurred_idx").on(
      table.deviceHash,
      table.occurredAt
    ),
    index("xp_risk_signal_ip_occurred_idx").on(
      table.ipPrefixHash,
      table.occurredAt
    ),
    index("xp_risk_signal_user_occurred_idx").on(
      table.userId,
      table.occurredAt
    ),
  ]
);

export const xpRewardBlock = pgTable(
  "xp_reward_block",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    integrityCaseId: text("integrity_case_id"),
    kind: xpRewardBlockKindEnum("kind").notNull(),
    reason: text("reason").notNull(),
    scopeKey: text("scope_key").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.integrityCaseId],
      foreignColumns: [xpIntegrityCase.id],
      name: "xp_reward_block_integrity_case_fk",
    }).onDelete("set null"),
    uniqueIndex("xp_reward_block_user_kind_scope_unique")
      .on(table.userId, table.kind, table.scopeKey)
      .where(sql`${table.userId} is not null`),
  ]
);

export const xpEvent = pgTable(
  "xp_event",
  {
    amount: integer("amount").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    integrityCaseId: text("integrity_case_id").references(
      () => xpIntegrityCase.id,
      { onDelete: "set null" }
    ),
    kind: xpEventKindEnum("kind").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    milestone: integer("milestone"),
    reasonCode: text("reason_code").notNull(),
    reversesEventId: text("reverses_event_id").unique(),
    sourceRef: text("source_ref").notNull(),
    state: xpEventStateEnum("state").notNull(),
    subjectId: text("subject_id").references(() => xpRewardSubject.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.reversesEventId],
      foreignColumns: [table.id],
      name: "xp_event_reversal_fk",
    }).onDelete("restrict"),
    check(
      "xp_event_amount_check",
      sql`${table.amount} <> 0 or (${table.kind} = 'reversal' and ${table.reversesEventId} is not null and ${table.state} = 'posted') or (${table.state} = 'posted' and ${table.metadata}->>'completionLedger' = 'true')`
    ),
    index("xp_event_subject_idx").on(table.subjectId),
    index("xp_event_user_created_idx").on(table.userId, table.createdAt),
    index("xp_event_user_state_available_idx").on(
      table.userId,
      table.state,
      table.availableAt
    ),
  ]
);

export const xpLikeDisqualification = pgTable(
  "xp_like_disqualification",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey().$defaultFn(generateId),
    integrityCaseId: text("integrity_case_id")
      .notNull()
      .references(() => xpIntegrityCase.id, { onDelete: "cascade" }),
    likerUserId: text("liker_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => xpRewardSubject.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("xp_like_disqualification_subject_liker_unique")
      .on(table.subjectId, table.likerUserId)
      .where(sql`${table.likerUserId} is not null`),
    index("xp_like_disqualification_case_idx").on(table.integrityCaseId),
  ]
);

export const eterisWallet = pgTable(
  "eteris_wallet",
  {
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    code: text("code").unique(),
    id: text("id").primaryKey().$defaultFn(generateId),
    kind: eterisWalletKindEnum("kind").notNull(),
    publicBalance: boolean("public_balance").notNull().default(false),
    status: eterisWalletStatusEnum("status").notNull().default("active"),
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check(
      "eteris_wallet_identity_check",
      sql`(${table.kind} = 'user' AND (${table.userId} IS NOT NULL OR ${table.status} = 'closed') AND ${table.code} IS NULL) OR (${table.kind} <> 'user' AND ${table.userId} IS NULL AND ${table.code} IS NOT NULL)`
    ),
  ]
);

export const eterisWalletBalance = pgTable("eteris_wallet_balance", {
  balance: bigint("balance", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  walletId: text("wallet_id")
    .primaryKey()
    .references(() => eterisWallet.id, { onDelete: "restrict" }),
});

export const eterisWalletStatusEvent = pgTable(
  "eteris_wallet_status_event",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sequence: bigserial("sequence", { mode: "bigint" }).primaryKey(),
    status: eterisWalletStatusEnum("status").notNull(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => eterisWallet.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("eteris_wallet_status_event_wallet_created_idx").on(
      table.walletId,
      table.createdAt,
      table.sequence
    ),
  ]
);

export const eterisTransaction = pgTable(
  "eteris_transaction",
  {
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    kind: eterisTransactionKindEnum("kind").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reason: text("reason"),
    reversesTransactionId: text("reverses_transaction_id").unique(),
    sequence: bigserial("sequence", { mode: "bigint" }).notNull(),
    sourceModule: text("source_module").notNull(),
    sourceRef: text("source_ref").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reversesTransactionId],
      foreignColumns: [table.id],
      name: "eteris_transaction_reversal_fk",
    }).onDelete("restrict"),
    check(
      "eteris_transaction_reason_check",
      sql`${table.kind} NOT IN ('admin_adjustment', 'reversal') OR length(trim(${table.reason})) > 0`
    ),
    index("eteris_transaction_created_idx").on(table.createdAt),
    index("eteris_transaction_kind_created_idx").on(
      table.kind,
      table.createdAt
    ),
    index("eteris_transaction_source_ref_idx").on(table.sourceRef),
  ]
);

export const eterisPosting = pgTable(
  "eteris_posting",
  {
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "bigint" }).notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => eterisTransaction.id, { onDelete: "restrict" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => eterisWallet.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.walletId] }),
    check("eteris_posting_amount_check", sql`${table.amount} <> 0`),
    index("eteris_posting_wallet_transaction_idx").on(
      table.walletId,
      table.transactionId
    ),
  ]
);

export const eterisDailySnapshot = pgTable("eteris_daily_snapshot", {
  anomalousEarners: jsonb("anomalous_earners")
    .$type<{ total: string; userId: string }[]>()
    .notNull(),
  balancePercentiles: jsonb("balance_percentiles")
    .$type<{ p50: string; p90: string; p99: string }>()
    .notNull(),
  burned: bigint("burned", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  day: date("day").primaryKey(),
  frozenWalletCount: integer("frozen_wallet_count").notNull(),
  issued: bigint("issued", { mode: "bigint" }).notNull(),
  negativeWalletCount: integer("negative_wallet_count").notNull(),
  sinkTotals: jsonb("sink_totals").$type<Record<string, string>>().notNull(),
  sourceTotals: jsonb("source_totals")
    .$type<Record<string, string>>()
    .notNull(),
  totalUserSupply: bigint("total_user_supply", { mode: "bigint" }).notNull(),
});

export const eterisWalletReconciliation = pgTable(
  "eteris_wallet_reconciliation",
  {
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    ledgerBalance: bigint("ledger_balance", { mode: "bigint" }).notNull(),
    projectionBalance: bigint("projection_balance", {
      mode: "bigint",
    }).notNull(),
    repaired: boolean("repaired").notNull(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => eterisWallet.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("eteris_wallet_reconciliation_wallet_created_idx").on(
      table.walletId,
      table.createdAt
    ),
  ]
);

export const tutorials = pgTable("tutorial", {
  description: text("content").notNull(),
  embedUrl: text("embed_url").notNull(),
  id: text("id").primaryKey().$defaultFn(generateId),
  title: text("title").notNull(),
  ...timestamps,
});

export const chronosPage = pgTable("chronos_page", {
  carouselImageKeys: jsonb("carousel_image_keys").$type<string[]>(),
  headerImageKey: text("header_image_key"),
  id: text("id").primaryKey().$defaultFn(generateId),
  isActive: boolean("is_active").notNull().default(true),
  markdownContent: text("markdown_content").notNull().default(""),
  markdownImageKeys: jsonb("markdown_image_keys").$type<string[]>(),
  stickyImageKey: text("sticky_image_key"),
  ...timestamps,
});

export const staticPage = pgTable(
  "static_page",
  {
    content: text("content").notNull().default(""),
    id: text("id").primaryKey().$defaultFn(generateId),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    ...timestamps,
  },
  (table) => [index("static_page_slug_idx").on(table.slug)]
);

export const siteConfig = pgTable("site_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<SiteMarqueeItem[]>().notNull(),
  ...timestamps,
});

/** -------------------------------------------------------- */

export const profileBannerModeEnum = pgEnum(
  "profile_banner_mode",
  PROFILE_BANNER_MODES
);
export const profileMediaSlotEnum = pgEnum(
  "profile_media_slot",
  PROFILE_MEDIA_SLOTS
);
export const profileMediaValidationStatusEnum = pgEnum(
  "profile_media_validation_status",
  PROFILE_MEDIA_VALIDATION_STATUSES
);
export const profileAssignmentSourceTypeEnum = pgEnum(
  "profile_assignment_source_type",
  PROFILE_ASSIGNMENT_SOURCE_TYPES
);

export const profileMediaAsset = pgTable(
  "profile_media_asset",
  {
    durationMs: integer("duration_ms"),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    height: integer("height").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    isAnimated: boolean("is_animated").notNull().default(false),
    mimeType: text("mime_type").notNull(),
    objectKey: text("object_key").notNull().unique(),
    ownerUserId: text("owner_user_id"),
    slot: profileMediaSlotEnum("slot").notNull(),
    validationStatus: profileMediaValidationStatusEnum("validation_status")
      .notNull()
      .default("pending"),
    width: integer("width").notNull(),
    ...timestamps,
  },
  (table) => [
    index("profile_media_asset_owner_idx").on(table.ownerUserId),
    index("profile_media_asset_slot_idx").on(table.slot),
    index("profile_media_asset_validation_idx").on(table.validationStatus),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [user.id],
      name: "pma_owner_fk",
    }).onDelete("set null"),
  ]
);

export const profileMediaDeletion = pgTable(
  "profile_media_deletion",
  {
    objectKey: text("object_key").primaryKey(),
    retryAfter: timestamp("retry_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("profile_media_deletion_retry_idx").on(
      table.retryAfter,
      table.createdAt
    ),
  ]
);

export const profileSettings = pgTable(
  "profile_settings",
  {
    bannerAssetId: text("banner_asset_id"),
    bannerColor: text("banner_color")
      .notNull()
      .default(PROFILE_DEFAULTS.bannerColor),
    bannerMode: profileBannerModeEnum("banner_mode").notNull().default("color"),
    inboundTradesEnabled: boolean("inbound_trades_enabled")
      .notNull()
      .default(true),
    inboundGiftsEnabled: boolean("inbound_gifts_enabled")
      .notNull()
      .default(true),
    replyNotificationsEnabled: boolean("reply_notifications_enabled")
      .notNull()
      .default(true),
    userId: text("user_id").primaryKey(),
    visibilityConfig: jsonb("visibility_config")
      .$type<ProfileVisibilityConfig>()
      .notNull()
      .default(
        sql`'{"favorites": true, "publicCollection": false, "reviews": true, "reserved": {}, "streak": false}'::jsonb`
      ),
    ...timestamps,
  },
  (table) => [
    index("profile_settings_banner_asset_idx").on(table.bannerAssetId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "ps_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.bannerAssetId],
      foreignColumns: [profileMediaAsset.id],
      name: "ps_banner_asset_fk",
    }).onDelete("set null"),
  ]
);

export const profileCatalogKindEnum = pgEnum(
  "profile_catalog_kind",
  PROFILE_CATALOG_KINDS
);
export const profileCatalogLifecycleEnum = pgEnum(
  "profile_catalog_lifecycle",
  PROFILE_CATALOG_LIFECYCLES
);
export const profileCatalogRevisionStateEnum = pgEnum(
  "profile_catalog_revision_state",
  PROFILE_CATALOG_REVISION_STATES
);
export const profileDecorationSlotEnum = pgEnum(
  "profile_decoration_slot",
  PROFILE_DECORATION_SLOTS
);
export const profileLayoutKeyEnum = pgEnum(
  "profile_layout_key",
  PROFILE_LAYOUT_KEYS
);
export const profileShowcaseTypeKeyEnum = pgEnum(
  "profile_showcase_type_key",
  PROFILE_SHOWCASE_TYPE_KEYS
);
export const profileShowcaseVariantEnum = pgEnum(
  "profile_showcase_variant",
  PROFILE_SHOWCASE_VARIANTS
);
export const profileCatalogOwnershipSourceEnum = pgEnum(
  "profile_catalog_ownership_source",
  PROFILE_CATALOG_OWNERSHIP_SOURCES
);

export const profileCatalogItem = pgTable(
  "profile_catalog_item",
  {
    currentPublishedRevisionId: text("current_published_revision_id"),
    id: text("id").primaryKey().$defaultFn(generateId),
    isProtectedDefault: boolean("is_protected_default")
      .notNull()
      .default(false),
    kind: profileCatalogKindEnum("kind").notNull(),
    lifecycle: profileCatalogLifecycleEnum("lifecycle")
      .notNull()
      .default("draft"),
    stableKey: text("stable_key").notNull().unique(),
    ...timestamps,
  },
  (table) => [index("profile_catalog_item_kind_idx").on(table.kind)]
);

export const profileCatalogItemRevision = pgTable(
  "profile_catalog_item_revision",
  {
    catalogOrder: integer("catalog_order").notNull().default(0),
    createdByUserId: text("created_by_user_id"),
    description: text("description").notNull().default(""),
    eterisPrice: bigint("eteris_price", { mode: "bigint" }),
    id: text("id").primaryKey().$defaultFn(generateId),
    isFree: boolean("is_free").notNull().default(false),
    itemId: text("item_id").notNull(),
    name: text("name").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: text("published_by_user_id"),
    requiredTier:
      text("required_tier").$type<(typeof PATRON_TIER_KEYS)[number]>(),
    revision: integer("revision").notNull(),
    state: profileCatalogRevisionStateEnum("state").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profile_catalog_item_revision_number_uq").on(
      table.itemId,
      table.revision
    ),
    check(
      "profile_catalog_item_revision_price_nonnegative",
      sql`${table.eterisPrice} IS NULL OR ${table.eterisPrice} >= 0`
    ),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [profileCatalogItem.id],
      name: "pcir_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [user.id],
      name: "pcir_creator_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.publishedByUserId],
      foreignColumns: [user.id],
      name: "pcir_publisher_fk",
    }).onDelete("set null"),
  ]
);

export const profileCatalogLayoutRevision = pgTable(
  "profile_catalog_layout_revision",
  {
    revisionId: text("revision_id").primaryKey(),
    rendererKey: profileLayoutKeyEnum("renderer_key").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId],
      foreignColumns: [profileCatalogItemRevision.id],
      name: "pclr_revision_fk",
    }).onDelete("cascade"),
  ]
);

export const profileCatalogSkinRevision = pgTable(
  "profile_catalog_skin_revision",
  {
    backgroundAssetId: text("background_asset_id"),
    revisionId: text("revision_id").primaryKey(),
    tokens: jsonb("tokens").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId],
      foreignColumns: [profileCatalogItemRevision.id],
      name: "pcsr_revision_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.backgroundAssetId],
      foreignColumns: [media.id],
      name: "pcsr_background_asset_fk",
    }).onDelete("restrict"),
  ]
);

export const profileCatalogDecorationRevision = pgTable(
  "profile_catalog_decoration_revision",
  {
    effectKey: text("effect_key"),
    fontKey: text("font_key"),
    mediaAssetId: text("media_asset_id"),
    reducedMotion: jsonb("reduced_motion").$type<Record<string, unknown>>(),
    revisionId: text("revision_id").primaryKey(),
    slot: profileDecorationSlotEnum("slot").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId],
      foreignColumns: [profileCatalogItemRevision.id],
      name: "pcdr_revision_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.mediaAssetId],
      foreignColumns: [media.id],
      name: "pcdr_media_asset_fk",
    }).onDelete("restrict"),
  ]
);

export const profileCustomization = pgTable(
  "profile_customization",
  {
    revision: integer("revision").notNull().default(1),
    selectedLayoutItemId: text("selected_layout_item_id").notNull(),
    selectedSkinItemId: text("selected_skin_item_id").notNull(),
    userId: text("user_id").primaryKey(),
    ...timestamps,
  },
  (table) => [
    check(
      "profile_customization_revision_positive",
      sql`${table.revision} > 0`
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "pc_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.selectedLayoutItemId],
      foreignColumns: [profileCatalogItem.id],
      name: "pc_layout_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.selectedSkinItemId],
      foreignColumns: [profileCatalogItem.id],
      name: "pc_skin_item_fk",
    }).onDelete("restrict"),
  ]
);

export const profileEquippedDecoration = pgTable(
  "profile_equipped_decoration",
  {
    catalogItemId: text("catalog_item_id").notNull(),
    slot: profileDecorationSlotEnum("slot").notNull(),
    userId: text("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.slot] }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "ped_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.catalogItemId],
      foreignColumns: [profileCatalogItem.id],
      name: "ped_catalog_item_fk",
    }).onDelete("restrict"),
  ]
);

export const profileShowcaseType = pgTable("profile_showcase_type", {
  isActive: boolean("is_active").notNull().default(true),
  key: profileShowcaseTypeKeyEnum("key").primaryKey(),
  requiredTier: text("required_tier")
    .$type<(typeof PATRON_TIER_KEYS)[number]>()
    .notNull()
    .default("none"),
  publishedConfigRevision: integer("published_config_revision")
    .notNull()
    .default(1),
  ...timestamps,
});

export const profileShowcaseConfig = pgTable(
  "profile_showcase_config",
  {
    enabled: boolean("enabled").notNull().default(false),
    id: text("id").primaryKey().$defaultFn(generateId),
    order: integer("display_order").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadSchemaVersion: integer("payload_schema_version").notNull(),
    typeKey: profileShowcaseTypeKeyEnum("type_key").notNull(),
    userId: text("user_id").notNull(),
    variant: profileShowcaseVariantEnum("variant")
      .notNull()
      .default("standard"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profile_showcase_config_user_type_uq").on(
      table.userId,
      table.typeKey
    ),
    uniqueIndex("profile_showcase_config_user_order_uq").on(
      table.userId,
      table.order
    ),
    check(
      "profile_showcase_config_order_nonnegative",
      sql`${table.order} >= 0`
    ),
    check(
      "profile_showcase_config_payload_version_positive",
      sql`${table.payloadSchemaVersion} > 0`
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "psc_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.typeKey],
      foreignColumns: [profileShowcaseType.key],
      name: "psc_type_fk",
    }).onDelete("restrict"),
  ]
);

export const profileCatalogOwnership = pgTable(
  "profile_catalog_ownership",
  {
    catalogItemId: text("catalog_item_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    grantedByUserId: text("granted_by_user_id"),
    grantReason: text("grant_reason"),
    id: text("id").primaryKey().$defaultFn(generateId),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id"),
    revokeReason: text("revoke_reason"),
    sourceReference: text("source_reference").notNull(),
    sourceType: profileCatalogOwnershipSourceEnum("source_type").notNull(),
    userId: text("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profile_catalog_ownership_source_uq").on(
      table.sourceType,
      table.sourceReference
    ),
    index("profile_catalog_ownership_user_item_idx").on(
      table.userId,
      table.catalogItemId
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "pco_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.catalogItemId],
      foreignColumns: [profileCatalogItem.id],
      name: "pco_catalog_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.grantedByUserId],
      foreignColumns: [user.id],
      name: "pco_granter_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.revokedByUserId],
      foreignColumns: [user.id],
      name: "pco_revoker_fk",
    }).onDelete("set null"),
  ]
);

export const profileCatalogAudit = pgTable(
  "profile_catalog_audit",
  {
    action: text("action").notNull(),
    actorUserId: text("actor_user_id"),
    after: jsonb("after").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    id: text("id").primaryKey().$defaultFn(generateId),
    note: text("note"),
    targetId: text("target_id").notNull(),
    targetKind: text("target_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("profile_catalog_audit_target_idx").on(
      table.targetKind,
      table.targetId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [user.id],
      name: "pca_actor_fk",
    }).onDelete("set null"),
  ]
);

export const profileRoleDefinition = pgTable(
  "profile_role_definition",
  {
    description: text("description").notNull().default(""),
    iconAssetId: text("icon_asset_id"),
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    isExclusive: boolean("is_exclusive").notNull().default(false),
    isVisible: boolean("is_visible").notNull().default(true),
    name: text("name").notNull(),
    overlayAssetId: text("overlay_asset_id"),
    priority: integer("priority").notNull().default(0),
    slug: text("slug").notNull().unique(),
    visualConfig: jsonb("visual_config")
      .$type<ProfileRoleVisualConfig>()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index("profile_role_definition_priority_idx").on(table.priority),
    index("profile_role_definition_visible_idx").on(table.isVisible),
    foreignKey({
      columns: [table.iconAssetId],
      foreignColumns: [profileMediaAsset.id],
      name: "prd_icon_asset_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.overlayAssetId],
      foreignColumns: [profileMediaAsset.id],
      name: "prd_overlay_asset_fk",
    }).onDelete("set null"),
  ]
);

export const profileRoleAssignment = pgTable(
  "profile_role_assignment",
  {
    endsAt: timestamp("ends_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    isVisible: boolean("is_visible").notNull().default(true),
    roleDefinitionId: text("role_definition_id").notNull(),
    sourceKey: text("source_key"),
    sourceType: profileAssignmentSourceTypeEnum("source_type")
      .notNull()
      .default("manual"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    userId: text("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    index("profile_role_assignment_user_idx").on(table.userId),
    index("profile_role_assignment_role_idx").on(table.roleDefinitionId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "pra_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roleDefinitionId],
      foreignColumns: [profileRoleDefinition.id],
      name: "pra_role_def_fk",
    }).onDelete("cascade"),
  ]
);

export const profileEmblemDefinition = pgTable(
  "profile_emblem_definition",
  {
    iconAssetId: text("icon_asset_id"),
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    isVisible: boolean("is_visible").notNull().default(true),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(0),
    slug: text("slug").notNull().unique(),
    tooltip: text("tooltip").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    index("profile_emblem_definition_priority_idx").on(table.priority),
    foreignKey({
      columns: [table.iconAssetId],
      foreignColumns: [profileMediaAsset.id],
      name: "ped_icon_asset_fk",
    }).onDelete("set null"),
  ]
);

export const profileEmblemAssignment = pgTable(
  "profile_emblem_assignment",
  {
    emblemDefinitionId: text("emblem_definition_id").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    isVisible: boolean("is_visible").notNull().default(true),
    sourceKey: text("source_key"),
    sourceType: profileAssignmentSourceTypeEnum("source_type")
      .notNull()
      .default("manual"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    userId: text("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    index("profile_emblem_assignment_user_idx").on(table.userId),
    index("profile_emblem_assignment_emblem_idx").on(table.emblemDefinitionId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "pea_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.emblemDefinitionId],
      foreignColumns: [profileEmblemDefinition.id],
      name: "pea_emblem_def_fk",
    }).onDelete("cascade"),
  ]
);

export const profileSystemConfig = pgTable("profile_system_config", {
  id: text("id").primaryKey(),
  maxVisibleEmblems: integer("max_visible_emblems")
    .notNull()
    .default(PROFILE_DEFAULTS.maxVisibleEmblems),
  ...timestamps,
});

export const profileMediaAssetRelations = relations(
  profileMediaAsset,
  ({ one }) => ({
    owner: one(user, {
      fields: [profileMediaAsset.ownerUserId],
      references: [user.id],
    }),
  })
);

export const profileSettingsRelations = relations(
  profileSettings,
  ({ one }) => ({
    bannerAsset: one(profileMediaAsset, {
      fields: [profileSettings.bannerAssetId],
      references: [profileMediaAsset.id],
    }),
    user: one(user, {
      fields: [profileSettings.userId],
      references: [user.id],
    }),
  })
);

export const profileRoleDefinitionRelations = relations(
  profileRoleDefinition,
  ({ one, many }) => ({
    assignments: many(profileRoleAssignment),
    iconAsset: one(profileMediaAsset, {
      fields: [profileRoleDefinition.iconAssetId],
      references: [profileMediaAsset.id],
    }),
    overlayAsset: one(profileMediaAsset, {
      fields: [profileRoleDefinition.overlayAssetId],
      references: [profileMediaAsset.id],
    }),
  })
);

export const profileRoleAssignmentRelations = relations(
  profileRoleAssignment,
  ({ one }) => ({
    roleDefinition: one(profileRoleDefinition, {
      fields: [profileRoleAssignment.roleDefinitionId],
      references: [profileRoleDefinition.id],
    }),
    user: one(user, {
      fields: [profileRoleAssignment.userId],
      references: [user.id],
    }),
  })
);

export const profileEmblemDefinitionRelations = relations(
  profileEmblemDefinition,
  ({ one, many }) => ({
    assignments: many(profileEmblemAssignment),
    iconAsset: one(profileMediaAsset, {
      fields: [profileEmblemDefinition.iconAssetId],
      references: [profileMediaAsset.id],
    }),
  })
);

export const profileEmblemAssignmentRelations = relations(
  profileEmblemAssignment,
  ({ one }) => ({
    emblemDefinition: one(profileEmblemDefinition, {
      fields: [profileEmblemAssignment.emblemDefinitionId],
      references: [profileEmblemDefinition.id],
    }),
    user: one(user, {
      fields: [profileEmblemAssignment.userId],
      references: [user.id],
    }),
  })
);

export const profileSystemConfigRelations = relations(
  profileSystemConfig,
  () => ({})
);

export const emojiTypeEnum = pgEnum("emoji_type", ["static", "animated"]);

export const emoji = pgTable(
  "emoji",
  {
    assetFormat: text("asset_format").notNull(),
    assetKey: text("asset_key").notNull(),
    displayName: text("display_name").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    mediaId: text("media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull().unique(),
    order: integer("order").notNull().default(0),
    requiredTier: text("required_tier", { enum: PATRON_TIER_KEYS })
      .notNull()
      .default("level1"),
    type: emojiTypeEnum("type").notNull().default("static"),
    ...timestamps,
  },
  (table) => [
    index("emoji_media_id_idx").on(table.mediaId),
    index("emoji_name_idx").on(table.name),
    index("emoji_required_tier_idx").on(table.requiredTier),
  ]
);

export const sticker = pgTable(
  "sticker",
  {
    assetFormat: text("asset_format").notNull(),
    assetKey: text("asset_key").notNull(),
    displayName: text("display_name").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    isActive: boolean("is_active").notNull().default(true),
    mediaId: text("media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull().unique(),
    order: integer("order").notNull().default(0),
    requiredTier: text("required_tier", { enum: PATRON_TIER_KEYS })
      .notNull()
      .default("level3"),
    type: emojiTypeEnum("type").notNull().default("static"),
    ...timestamps,
  },
  (table) => [
    index("sticker_media_id_idx").on(table.mediaId),
    index("sticker_name_idx").on(table.name),
    index("sticker_required_tier_idx").on(table.requiredTier),
  ]
);

export const emojiRelations = relations(emoji, ({ one }) => ({
  media: one(media, {
    fields: [emoji.mediaId],
    references: [media.id],
  }),
}));

export const stickerRelations = relations(sticker, ({ one }) => ({
  media: one(media, {
    fields: [sticker.mediaId],
    references: [media.id],
  }),
}));

/** -------------------------------------------------------- */

export const creatorRelations = relations(creator, ({ many, one }) => ({
  media: one(media, {
    fields: [creator.mediaId],
    references: [media.id],
  }),
  posts: many(post),
}));

export const comicCreatorRelations = relations(comicCreator, ({ many }) => ({
  posts: many(post),
}));

export const translatorRelations = relations(translator, ({ many }) => ({
  posts: many(post),
}));

export const contentSeriesRelations = relations(contentSeries, ({ many }) => ({
  posts: many(post),
}));

export const postRelations = relations(post, ({ many, one }) => ({
  comments: many(comment),
  comicProgress: many(userComicProgress),
  coverMedia: one(media, {
    fields: [post.coverMediaId],
    references: [media.id],
  }),
  creator: one(creator, {
    fields: [post.creatorId],
    references: [creator.id],
  }),
  comicCreator: one(comicCreator, {
    fields: [post.comicCreatorId],
    references: [comicCreator.id],
  }),
  engagementOverrides: many(postEngagementOverride),
  favorites: many(postBookmark),
  featured: many(featuredPost),
  likes: many(postLikes),
  mediaRelations: many(postMedia),
  ratings: many(postRating),
  series: one(contentSeries, {
    fields: [post.seriesId],
    references: [contentSeries.id],
  }),
  terms: many(termPostRelation),
  translator: one(translator, {
    fields: [post.translatorId],
    references: [translator.id],
  }),
}));

export const mediaRelations = relations(media, ({ many, one }) => ({
  cardTemplates: many(cardTemplate),
  coveredPosts: many(post),
  creators: many(creator),
  featuredPosts: many(featuredPost),
  folder: one(mediaFolder, {
    fields: [media.folderId],
    references: [mediaFolder.id],
  }),
  emojis: many(emoji),
  postRelations: many(postMedia),
  packTemplates: many(packTemplate),
  stickers: many(sticker),
}));

export const cardCharacterRelations = relations(
  cardCharacter,
  ({ many, one }) => ({
    createdBy: one(user, {
      fields: [cardCharacter.createdByUserId],
      references: [user.id],
      relationName: "card_character_created_by",
    }),
    templates: many(cardTemplate),
    updatedBy: one(user, {
      fields: [cardCharacter.updatedByUserId],
      references: [user.id],
      relationName: "card_character_updated_by",
    }),
  })
);

export const cardSeriesRelations = relations(cardSeries, ({ many, one }) => ({
  createdBy: one(user, {
    fields: [cardSeries.createdByUserId],
    references: [user.id],
    relationName: "card_series_created_by",
  }),
  templates: many(cardTemplate),
  updatedBy: one(user, {
    fields: [cardSeries.updatedByUserId],
    references: [user.id],
    relationName: "card_series_updated_by",
  }),
}));

export const cardTemplateRelations = relations(
  cardTemplate,
  ({ many, one }) => ({
    auditEvents: many(cardTemplateAuditEvent),
    character: one(cardCharacter, {
      fields: [cardTemplate.characterId],
      references: [cardCharacter.id],
    }),
    createdBy: one(user, {
      fields: [cardTemplate.createdByUserId],
      references: [user.id],
      relationName: "card_template_created_by",
    }),
    disabledBy: one(user, {
      fields: [cardTemplate.disabledByUserId],
      references: [user.id],
      relationName: "card_template_disabled_by",
    }),
    grantCampaigns: many(collectibleGrantCampaign),
    instances: many(cardInstance),
    portraitMedia: one(media, {
      fields: [cardTemplate.portraitMediaId],
      references: [media.id],
    }),
    publishedBy: one(user, {
      fields: [cardTemplate.publishedByUserId],
      references: [user.id],
      relationName: "card_template_published_by",
    }),
    renderedVariants: many(cardTemplateRenderedVariant),
    series: one(cardSeries, {
      fields: [cardTemplate.seriesId],
      references: [cardSeries.id],
    }),
    updatedBy: one(user, {
      fields: [cardTemplate.updatedByUserId],
      references: [user.id],
      relationName: "card_template_updated_by",
    }),
  })
);

export const cardTemplateRenderedVariantRelations = relations(
  cardTemplateRenderedVariant,
  ({ one }) => ({
    template: one(cardTemplate, {
      fields: [cardTemplateRenderedVariant.templateId],
      references: [cardTemplate.id],
    }),
  })
);

export const cardTemplateAuditEventRelations = relations(
  cardTemplateAuditEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [cardTemplateAuditEvent.actorUserId],
      references: [user.id],
    }),
    template: one(cardTemplate, {
      fields: [cardTemplateAuditEvent.templateId],
      references: [cardTemplate.id],
    }),
  })
);

export const cardInstanceRelations = relations(
  cardInstance,
  ({ many, one }) => ({
    custodies: many(collectibleCustody),
    pack: one(packInstance, {
      fields: [cardInstance.packInstanceId],
      references: [packInstance.id],
    }),
    owner: one(user, {
      fields: [cardInstance.ownerUserId],
      references: [user.id],
    }),
    template: one(cardTemplate, {
      fields: [cardInstance.templateId],
      references: [cardTemplate.id],
    }),
  })
);

export const packInstanceRelations = relations(
  packInstance,
  ({ many, one }) => ({
    cards: many(cardInstance),
    custodies: many(collectibleCustody),
    events: many(collectibleOwnershipEvent),
    execution: one(collectibleGrantExecution, {
      fields: [packInstance.id],
      references: [collectibleGrantExecution.packInstanceId],
    }),
    gachaponActivation: one(gachaponActivation, {
      fields: [packInstance.id],
      references: [gachaponActivation.packInstanceId],
    }),
    opening: one(packOpening, {
      fields: [packInstance.id],
      references: [packOpening.packInstanceId],
    }),
    officialCardShopPurchaseItem: one(officialCardShopPurchaseItem, {
      fields: [packInstance.id],
      references: [officialCardShopPurchaseItem.packInstanceId],
    }),
    owner: one(user, {
      fields: [packInstance.ownerUserId],
      references: [user.id],
      relationName: "pack_instance_owner",
    }),
    revision: one(packRevision, {
      fields: [packInstance.revisionId],
      references: [packRevision.id],
    }),
    template: one(packTemplate, {
      fields: [packInstance.templateId],
      references: [packTemplate.id],
    }),
  })
);

export const collectibleCustodyRelations = relations(
  collectibleCustody,
  ({ one }) => ({
    card: one(cardInstance, {
      fields: [collectibleCustody.cardInstanceId],
      references: [cardInstance.id],
    }),
    pack: one(packInstance, {
      fields: [collectibleCustody.packInstanceId],
      references: [packInstance.id],
    }),
    tradeOffer: one(tradeOffer, {
      fields: [collectibleCustody.tradeOfferId],
      references: [tradeOffer.id],
    }),
    giftOffer: one(giftOffer, {
      fields: [collectibleCustody.giftOfferId],
      references: [giftOffer.id],
    }),
    blackMarketListing: one(blackMarketListing, {
      fields: [collectibleCustody.blackMarketListingId],
      references: [blackMarketListing.id],
    }),
  })
);

export const tradeOfferRelations = relations(tradeOffer, ({ many, one }) => ({
  actor: one(user, {
    fields: [tradeOffer.actorUserId],
    references: [user.id],
    relationName: "trade_offer_actor",
  }),
  custodies: many(collectibleCustody),
  history: many(tradeOfferHistory),
  proposer: one(user, {
    fields: [tradeOffer.proposerUserId],
    references: [user.id],
    relationName: "trade_offer_proposer",
  }),
  recipient: one(user, {
    fields: [tradeOffer.recipientUserId],
    references: [user.id],
    relationName: "trade_offer_recipient",
  }),
}));

export const tradeOfferHistoryRelations = relations(
  tradeOfferHistory,
  ({ one }) => ({
    actor: one(user, {
      fields: [tradeOfferHistory.actorUserId],
      references: [user.id],
      relationName: "trade_offer_history_actor",
    }),
    offer: one(tradeOffer, {
      fields: [tradeOfferHistory.offerId],
      references: [tradeOffer.id],
    }),
  })
);

export const giftOfferRelations = relations(giftOffer, ({ many, one }) => ({
  actor: one(user, {
    fields: [giftOffer.actorUserId],
    references: [user.id],
    relationName: "gift_offer_actor",
  }),
  custodies: many(collectibleCustody),
  history: many(giftOfferHistory),
  recipient: one(user, {
    fields: [giftOffer.recipientUserId],
    references: [user.id],
    relationName: "gift_offer_recipient",
  }),
  sender: one(user, {
    fields: [giftOffer.senderUserId],
    references: [user.id],
    relationName: "gift_offer_sender",
  }),
}));

export const giftOfferHistoryRelations = relations(
  giftOfferHistory,
  ({ one }) => ({
    actor: one(user, {
      fields: [giftOfferHistory.actorUserId],
      references: [user.id],
      relationName: "gift_offer_history_actor",
    }),
    offer: one(giftOffer, {
      fields: [giftOfferHistory.giftOfferId],
      references: [giftOffer.id],
    }),
  })
);

export const blackMarketListingRelations = relations(
  blackMarketListing,
  ({ many, one }) => ({
    audits: many(blackMarketListingAudit),
    custodies: many(collectibleCustody),
    feeReversalTransaction: one(eterisTransaction, {
      fields: [blackMarketListing.feeReversalTransactionId],
      references: [eterisTransaction.id],
      relationName: "black_market_listing_fee_reversal",
    }),
    feeTransaction: one(eterisTransaction, {
      fields: [blackMarketListing.feeTransactionId],
      references: [eterisTransaction.id],
      relationName: "black_market_listing_fee",
    }),
    seller: one(user, {
      fields: [blackMarketListing.sellerUserId],
      references: [user.id],
      relationName: "black_market_listing_seller",
    }),
    sale: one(blackMarketSale, {
      fields: [blackMarketListing.id],
      references: [blackMarketSale.listingId],
    }),
  })
);

export const blackMarketListingAuditRelations = relations(
  blackMarketListingAudit,
  ({ one }) => ({
    actor: one(user, {
      fields: [blackMarketListingAudit.actorUserId],
      references: [user.id],
    }),
    listing: one(blackMarketListing, {
      fields: [blackMarketListingAudit.listingId],
      references: [blackMarketListing.id],
    }),
  })
);

export const blackMarketSaleRelations = relations(
  blackMarketSale,
  ({ one }) => ({
    buyer: one(user, {
      fields: [blackMarketSale.buyerUserId],
      references: [user.id],
      relationName: "black_market_sale_buyer",
    }),
    eterisTransaction: one(eterisTransaction, {
      fields: [blackMarketSale.eterisTransactionId],
      references: [eterisTransaction.id],
    }),
    listing: one(blackMarketListing, {
      fields: [blackMarketSale.listingId],
      references: [blackMarketListing.id],
    }),
    seller: one(user, {
      fields: [blackMarketSale.sellerUserId],
      references: [user.id],
      relationName: "black_market_sale_seller",
    }),
  })
);

export const blackMarketRiskSignalRelations = relations(
  blackMarketRiskSignal,
  ({ one }) => ({
    listing: one(blackMarketListing, {
      fields: [blackMarketRiskSignal.listingId],
      references: [blackMarketListing.id],
    }),
    sale: one(blackMarketSale, {
      fields: [blackMarketRiskSignal.saleId],
      references: [blackMarketSale.id],
    }),
    subject: one(user, {
      fields: [blackMarketRiskSignal.subjectUserId],
      references: [user.id],
    }),
  })
);

export const packOpeningRelations = relations(packOpening, ({ one }) => ({
  owner: one(user, {
    fields: [packOpening.ownerUserId],
    references: [user.id],
    relationName: "pack_opening_owner",
  }),
  pack: one(packInstance, {
    fields: [packOpening.packInstanceId],
    references: [packInstance.id],
  }),
  revision: one(packRevision, {
    fields: [packOpening.revisionId],
    references: [packRevision.id],
  }),
  template: one(packTemplate, {
    fields: [packOpening.templateId],
    references: [packTemplate.id],
  }),
}));

export const collectibleOwnershipEventRelations = relations(
  collectibleOwnershipEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [collectibleOwnershipEvent.actorUserId],
      references: [user.id],
      relationName: "collectible_ownership_event_actor",
    }),
    card: one(cardInstance, {
      fields: [collectibleOwnershipEvent.cardInstanceId],
      references: [cardInstance.id],
    }),
    fromUser: one(user, {
      fields: [collectibleOwnershipEvent.fromUserId],
      references: [user.id],
      relationName: "collectible_ownership_event_from",
    }),
    pack: one(packInstance, {
      fields: [collectibleOwnershipEvent.packInstanceId],
      references: [packInstance.id],
    }),
    toUser: one(user, {
      fields: [collectibleOwnershipEvent.toUserId],
      references: [user.id],
      relationName: "collectible_ownership_event_to",
    }),
  })
);

export const userBlockRelations = relations(userBlock, ({ one }) => ({
  blocked: one(user, {
    fields: [userBlock.blockedUserId],
    references: [user.id],
    relationName: "user_block_blocked",
  }),
  blocker: one(user, {
    fields: [userBlock.blockerUserId],
    references: [user.id],
    relationName: "user_block_blocker",
  }),
}));

export const collectibleGrantCampaignRelations = relations(
  collectibleGrantCampaign,
  ({ many, one }) => ({
    cardTemplate: one(cardTemplate, {
      fields: [collectibleGrantCampaign.cardTemplateId],
      references: [cardTemplate.id],
    }),
    createdBy: one(user, {
      fields: [collectibleGrantCampaign.createdByUserId],
      references: [user.id],
      relationName: "collectible_grant_campaign_creator",
    }),
    executions: many(collectibleGrantExecution),
    packTemplate: one(packTemplate, {
      fields: [collectibleGrantCampaign.packTemplateId],
      references: [packTemplate.id],
    }),
  })
);

export const collectibleGrantExecutionRelations = relations(
  collectibleGrantExecution,
  ({ one }) => ({
    actor: one(user, {
      fields: [collectibleGrantExecution.actorUserId],
      references: [user.id],
      relationName: "collectible_grant_execution_actor",
    }),
    campaign: one(collectibleGrantCampaign, {
      fields: [collectibleGrantExecution.campaignId],
      references: [collectibleGrantCampaign.id],
    }),
    card: one(cardInstance, {
      fields: [collectibleGrantExecution.cardInstanceId],
      references: [cardInstance.id],
    }),
    pack: one(packInstance, {
      fields: [collectibleGrantExecution.packInstanceId],
      references: [packInstance.id],
    }),
    recipient: one(user, {
      fields: [collectibleGrantExecution.recipientUserId],
      references: [user.id],
      relationName: "collectible_grant_execution_recipient",
    }),
  })
);

export const officialCardShopOfferRelations = relations(
  officialCardShopOffer,
  ({ many, one }) => ({
    auditEvents: many(officialCardShopOfferAuditEvent),
    createdBy: one(user, {
      fields: [officialCardShopOffer.createdByUserId],
      references: [user.id],
      relationName: "official_card_shop_offer_created_by",
    }),
    packTemplate: one(packTemplate, {
      fields: [officialCardShopOffer.packTemplateId],
      references: [packTemplate.id],
    }),
    purchases: many(officialCardShopPurchase),
    updatedBy: one(user, {
      fields: [officialCardShopOffer.updatedByUserId],
      references: [user.id],
      relationName: "official_card_shop_offer_updated_by",
    }),
    usage: many(officialCardShopOfferUsage),
  })
);

export const officialCardShopOfferAuditEventRelations = relations(
  officialCardShopOfferAuditEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [officialCardShopOfferAuditEvent.actorUserId],
      references: [user.id],
    }),
    offer: one(officialCardShopOffer, {
      fields: [officialCardShopOfferAuditEvent.offerId],
      references: [officialCardShopOffer.id],
    }),
  })
);

export const officialCardShopOfferUsageRelations = relations(
  officialCardShopOfferUsage,
  ({ one }) => ({
    offer: one(officialCardShopOffer, {
      fields: [officialCardShopOfferUsage.offerId],
      references: [officialCardShopOffer.id],
    }),
    user: one(user, {
      fields: [officialCardShopOfferUsage.userId],
      references: [user.id],
    }),
  })
);

export const officialCardShopPurchaseRelations = relations(
  officialCardShopPurchase,
  ({ many, one }) => ({
    buyer: one(user, {
      fields: [officialCardShopPurchase.buyerUserId],
      references: [user.id],
      relationName: "official_card_shop_purchase_buyer",
    }),
    eterisTransaction: one(eterisTransaction, {
      fields: [officialCardShopPurchase.eterisTransactionId],
      references: [eterisTransaction.id],
    }),
    items: many(officialCardShopPurchaseItem),
    offer: one(officialCardShopOffer, {
      fields: [officialCardShopPurchase.offerId],
      references: [officialCardShopOffer.id],
    }),
    packTemplate: one(packTemplate, {
      fields: [officialCardShopPurchase.packTemplateId],
      references: [packTemplate.id],
    }),
    revision: one(packRevision, {
      fields: [officialCardShopPurchase.revisionId],
      references: [packRevision.id],
    }),
  })
);

export const officialCardShopPurchaseItemRelations = relations(
  officialCardShopPurchaseItem,
  ({ one }) => ({
    pack: one(packInstance, {
      fields: [officialCardShopPurchaseItem.packInstanceId],
      references: [packInstance.id],
    }),
    purchase: one(officialCardShopPurchase, {
      fields: [officialCardShopPurchaseItem.purchaseId],
      references: [officialCardShopPurchase.id],
    }),
    revision: one(packRevision, {
      fields: [officialCardShopPurchaseItem.revisionId],
      references: [packRevision.id],
    }),
  })
);

export const gachaponMachineRelations = relations(
  gachaponMachine,
  ({ many, one }) => ({
    activations: many(gachaponActivation),
    auditEvents: many(gachaponMachineAuditEvent),
    createdBy: one(user, {
      fields: [gachaponMachine.createdByUserId],
      references: [user.id],
      relationName: "gachapon_machine_created_by",
    }),
    entries: many(gachaponMachinePackEntry),
    updatedBy: one(user, {
      fields: [gachaponMachine.updatedByUserId],
      references: [user.id],
      relationName: "gachapon_machine_updated_by",
    }),
    usage: many(gachaponMachineUsage),
  })
);

export const gachaponMachinePackEntryRelations = relations(
  gachaponMachinePackEntry,
  ({ one }) => ({
    machine: one(gachaponMachine, {
      fields: [gachaponMachinePackEntry.machineId],
      references: [gachaponMachine.id],
    }),
    packTemplate: one(packTemplate, {
      fields: [gachaponMachinePackEntry.packTemplateId],
      references: [packTemplate.id],
    }),
  })
);

export const gachaponMachineUsageRelations = relations(
  gachaponMachineUsage,
  ({ one }) => ({
    machine: one(gachaponMachine, {
      fields: [gachaponMachineUsage.machineId],
      references: [gachaponMachine.id],
    }),
    user: one(user, {
      fields: [gachaponMachineUsage.userId],
      references: [user.id],
    }),
  })
);

export const gachaponActivationRelations = relations(
  gachaponActivation,
  ({ one }) => ({
    eterisTransaction: one(eterisTransaction, {
      fields: [gachaponActivation.eterisTransactionId],
      references: [eterisTransaction.id],
    }),
    machine: one(gachaponMachine, {
      fields: [gachaponActivation.machineId],
      references: [gachaponMachine.id],
    }),
    pack: one(packInstance, {
      fields: [gachaponActivation.packInstanceId],
      references: [packInstance.id],
    }),
    packTemplate: one(packTemplate, {
      fields: [gachaponActivation.packTemplateId],
      references: [packTemplate.id],
    }),
    revision: one(packRevision, {
      fields: [gachaponActivation.revisionId],
      references: [packRevision.id],
    }),
    user: one(user, {
      fields: [gachaponActivation.userId],
      references: [user.id],
      relationName: "gachapon_activation_user",
    }),
  })
);

export const gachaponMachineAuditEventRelations = relations(
  gachaponMachineAuditEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [gachaponMachineAuditEvent.actorUserId],
      references: [user.id],
    }),
    machine: one(gachaponMachine, {
      fields: [gachaponMachineAuditEvent.machineId],
      references: [gachaponMachine.id],
    }),
  })
);

export const collectibleAdminActionRelations = relations(
  collectibleAdminAction,
  ({ one }) => ({
    actor: one(user, {
      fields: [collectibleAdminAction.actorUserId],
      references: [user.id],
    }),
    cardInstance: one(cardInstance, {
      fields: [collectibleAdminAction.cardInstanceId],
      references: [cardInstance.id],
    }),
    cardTemplate: one(cardTemplate, {
      fields: [collectibleAdminAction.cardTemplateId],
      references: [cardTemplate.id],
    }),
    gachaponMachine: one(gachaponMachine, {
      fields: [collectibleAdminAction.gachaponMachineId],
      references: [gachaponMachine.id],
    }),
    giftOffer: one(giftOffer, {
      fields: [collectibleAdminAction.giftOfferId],
      references: [giftOffer.id],
    }),
    linkedEterisTransaction: one(eterisTransaction, {
      fields: [collectibleAdminAction.linkedEterisTransactionId],
      references: [eterisTransaction.id],
    }),
    marketListing: one(blackMarketListing, {
      fields: [collectibleAdminAction.marketListingId],
      references: [blackMarketListing.id],
    }),
    packInstance: one(packInstance, {
      fields: [collectibleAdminAction.packInstanceId],
      references: [packInstance.id],
    }),
    packRevision: one(packRevision, {
      fields: [collectibleAdminAction.packRevisionId],
      references: [packRevision.id],
    }),
    packTemplate: one(packTemplate, {
      fields: [collectibleAdminAction.packTemplateId],
      references: [packTemplate.id],
    }),
    tradeOffer: one(tradeOffer, {
      fields: [collectibleAdminAction.tradeOfferId],
      references: [tradeOffer.id],
    }),
  })
);

export const packTemplateRelations = relations(
  packTemplate,
  ({ many, one }) => ({
    assetMedia: one(media, {
      fields: [packTemplate.assetMediaId],
      references: [media.id],
    }),
    createdBy: one(user, {
      fields: [packTemplate.createdByUserId],
      references: [user.id],
      relationName: "pack_template_created_by",
    }),
    gachaponActivations: many(gachaponActivation),
    gachaponEntries: many(gachaponMachinePackEntry),
    latestPublishedRevision: one(packRevision, {
      fields: [packTemplate.latestPublishedRevisionId],
      references: [packRevision.id],
      relationName: "pack_template_latest_revision",
    }),
    instances: many(packInstance),
    officialCardShopOffers: many(officialCardShopOffer),
    officialCardShopPurchases: many(officialCardShopPurchase),
    revisions: many(packRevision),
    retiredBy: one(user, {
      fields: [packTemplate.retiredByUserId],
      references: [user.id],
      relationName: "pack_template_retired_by",
    }),
    updatedBy: one(user, {
      fields: [packTemplate.updatedByUserId],
      references: [user.id],
      relationName: "pack_template_updated_by",
    }),
  })
);

export const packRevisionRelations = relations(
  packRevision,
  ({ many, one }) => ({
    createdBy: one(user, {
      fields: [packRevision.createdByUserId],
      references: [user.id],
      relationName: "pack_revision_created_by",
    }),
    drawGroups: many(packDrawGroup),
    gachaponActivations: many(gachaponActivation),
    instances: many(packInstance),
    officialCardShopPurchaseItems: many(officialCardShopPurchaseItem),
    officialCardShopPurchases: many(officialCardShopPurchase),
    publishedBy: one(user, {
      fields: [packRevision.publishedByUserId],
      references: [user.id],
      relationName: "pack_revision_published_by",
    }),
    template: one(packTemplate, {
      fields: [packRevision.templateId],
      references: [packTemplate.id],
    }),
    updatedBy: one(user, {
      fields: [packRevision.updatedByUserId],
      references: [user.id],
      relationName: "pack_revision_updated_by",
    }),
  })
);

export const packDrawGroupRelations = relations(
  packDrawGroup,
  ({ many, one }) => ({
    cardWeights: many(packDrawGroupCardWeight),
    rarityWeights: many(packDrawGroupRarityWeight),
    revision: one(packRevision, {
      fields: [packDrawGroup.revisionId],
      references: [packRevision.id],
    }),
  })
);

export const packDrawGroupRarityWeightRelations = relations(
  packDrawGroupRarityWeight,
  ({ one }) => ({
    drawGroup: one(packDrawGroup, {
      fields: [packDrawGroupRarityWeight.drawGroupId],
      references: [packDrawGroup.id],
    }),
  })
);

export const packDrawGroupCardWeightRelations = relations(
  packDrawGroupCardWeight,
  ({ one }) => ({
    cardTemplate: one(cardTemplate, {
      fields: [packDrawGroupCardWeight.cardTemplateId],
      references: [cardTemplate.id],
    }),
    drawGroup: one(packDrawGroup, {
      fields: [packDrawGroupCardWeight.drawGroupId],
      references: [packDrawGroup.id],
    }),
  })
);

export const mediaFolderRelations = relations(mediaFolder, ({ many, one }) => ({
  children: many(mediaFolder, {
    relationName: "media_folder_hierarchy",
  }),
  mediaItems: many(media),
  parent: one(mediaFolder, {
    fields: [mediaFolder.parentId],
    references: [mediaFolder.id],
    relationName: "media_folder_hierarchy",
  }),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  media: one(media, {
    fields: [postMedia.mediaId],
    references: [media.id],
  }),
  post: one(post, {
    fields: [postMedia.postId],
    references: [post.id],
  }),
}));

export const featuredPostRelations = relations(featuredPost, ({ one }) => ({
  post: one(post, {
    fields: [featuredPost.postId],
    references: [post.id],
  }),
  thumbnailMedia: one(media, {
    fields: [featuredPost.thumbnailMediaId],
    references: [media.id],
  }),
}));

export const termRelations = relations(term, ({ many }) => ({
  engagementQuestionIncompatibleTagRelations: many(
    engagementQuestionIncompatibleTagRelation
  ),
  engagementQuestions: many(engagementQuestion),
  engagementQuestionTagRelations: many(engagementQuestionTagRelation),
  posts: many(termPostRelation),
}));

export const commentRelations = relations(comment, ({ many, one }) => ({
  likes: many(commentLikes),
  parent: one(comment, {
    fields: [comment.parentId],
    references: [comment.id],
    relationName: "comment_replies",
  }),
  post: one(post, {
    fields: [comment.postId],
    references: [post.id],
  }),
  replies: many(comment, {
    relationName: "comment_replies",
  }),
}));

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comment, {
    fields: [commentLikes.commentId],
    references: [comment.id],
  }),
  user: one(user, {
    fields: [commentLikes.userId],
    references: [user.id],
  }),
}));

export const engagementQuestionRelations = relations(
  engagementQuestion,
  ({ many, one }) => ({
    incompatibleTagRelations: many(engagementQuestionIncompatibleTagRelation),
    tagRelations: many(engagementQuestionTagRelation),
    tagTerm: one(term, {
      fields: [engagementQuestion.tagTermId],
      references: [term.id],
    }),
  })
);

export const engagementQuestionIncompatibleTagRelationRelations = relations(
  engagementQuestionIncompatibleTagRelation,
  ({ one }) => ({
    engagementQuestion: one(engagementQuestion, {
      fields: [engagementQuestionIncompatibleTagRelation.engagementQuestionId],
      references: [engagementQuestion.id],
    }),
    term: one(term, {
      fields: [engagementQuestionIncompatibleTagRelation.termId],
      references: [term.id],
    }),
  })
);

export const engagementQuestionTagRelationRelations = relations(
  engagementQuestionTagRelation,
  ({ one }) => ({
    engagementQuestion: one(engagementQuestion, {
      fields: [engagementQuestionTagRelation.engagementQuestionId],
      references: [engagementQuestion.id],
    }),
    term: one(term, {
      fields: [engagementQuestionTagRelation.termId],
      references: [term.id],
    }),
  })
);

export const postEngagementOverrideRelations = relations(
  postEngagementOverride,
  ({ one }) => ({
    post: one(post, {
      fields: [postEngagementOverride.postId],
      references: [post.id],
    }),
  })
);

export const termPostRelationRelations = relations(
  termPostRelation,
  ({ one }) => ({
    post: one(post, {
      fields: [termPostRelation.postId],
      references: [post.id],
    }),
    term: one(term, {
      fields: [termPostRelation.termId],
      references: [term.id],
    }),
  })
);

export const postBookmarkRelations = relations(postBookmark, ({ one }) => ({
  post: one(post, {
    fields: [postBookmark.postId],
    references: [post.id],
  }),
}));

export const postRatingRelations = relations(postRating, ({ many, one }) => ({
  likes: many(postRatingLikes),
  post: one(post, {
    fields: [postRating.postId],
    references: [post.id],
  }),
  user: one(user, {
    fields: [postRating.userId],
    references: [user.id],
  }),
}));

export const postRatingLikesRelations = relations(
  postRatingLikes,
  ({ one }) => ({
    postRating: one(postRating, {
      fields: [postRatingLikes.ratingId],
      references: [postRating.id],
    }),
    user: one(user, {
      fields: [postRatingLikes.userId],
      references: [user.id],
    }),
  })
);

export const forbiddenContentRuleRelations = relations(
  forbiddenContentRule,
  ({ one }) => ({
    createdByUser: one(user, {
      fields: [forbiddenContentRule.createdBy],
      references: [user.id],
      relationName: "forbidden_content_rule_created_by",
    }),
    updatedByUser: one(user, {
      fields: [forbiddenContentRule.updatedBy],
      references: [user.id],
      relationName: "forbidden_content_rule_updated_by",
    }),
  })
);

export const userComicProgressRelations = relations(
  userComicProgress,
  ({ one }) => ({
    comic: one(post, {
      fields: [userComicProgress.comicId],
      references: [post.id],
    }),
    user: one(user, {
      fields: [userComicProgress.userId],
      references: [user.id],
    }),
  })
);

export const userProgressionRelations = relations(
  userProgression,
  ({ many, one }) => ({
    events: many(xpEvent),
    user: one(user, {
      fields: [userProgression.userId],
      references: [user.id],
    }),
  })
);

export const userStreakRelations = relations(userStreak, ({ one }) => ({
  user: one(user, {
    fields: [userStreak.userId],
    references: [user.id],
  }),
}));

export const xpRewardSubjectRelations = relations(
  xpRewardSubject,
  ({ many, one }) => ({
    events: many(xpEvent),
    user: one(user, {
      fields: [xpRewardSubject.userId],
      references: [user.id],
    }),
  })
);

export const xpIntegrityCaseRelations = relations(
  xpIntegrityCase,
  ({ many, one }) => ({
    blocks: many(xpRewardBlock),
    decidedByUser: one(user, {
      fields: [xpIntegrityCase.decidedBy],
      references: [user.id],
      relationName: "xp_integrity_case_decided_by",
    }),
    disqualifications: many(xpLikeDisqualification),
    events: many(xpEvent),
    user: one(user, {
      fields: [xpIntegrityCase.userId],
      references: [user.id],
      relationName: "xp_integrity_case_user",
    }),
  })
);

export const xpRewardBlockRelations = relations(xpRewardBlock, ({ one }) => ({
  createdByUser: one(user, {
    fields: [xpRewardBlock.createdBy],
    references: [user.id],
    relationName: "xp_reward_block_created_by",
  }),
  integrityCase: one(xpIntegrityCase, {
    fields: [xpRewardBlock.integrityCaseId],
    references: [xpIntegrityCase.id],
  }),
  user: one(user, {
    fields: [xpRewardBlock.userId],
    references: [user.id],
    relationName: "xp_reward_block_user",
  }),
}));

export const xpEventRelations = relations(xpEvent, ({ one }) => ({
  integrityCase: one(xpIntegrityCase, {
    fields: [xpEvent.integrityCaseId],
    references: [xpIntegrityCase.id],
  }),
  subject: one(xpRewardSubject, {
    fields: [xpEvent.subjectId],
    references: [xpRewardSubject.id],
  }),
  user: one(user, {
    fields: [xpEvent.userId],
    references: [user.id],
  }),
}));

export const xpLikeDisqualificationRelations = relations(
  xpLikeDisqualification,
  ({ one }) => ({
    case: one(xpIntegrityCase, {
      fields: [xpLikeDisqualification.integrityCaseId],
      references: [xpIntegrityCase.id],
    }),
    createdByUser: one(user, {
      fields: [xpLikeDisqualification.createdBy],
      references: [user.id],
    }),
    liker: one(user, {
      fields: [xpLikeDisqualification.likerUserId],
      references: [user.id],
    }),
    subject: one(xpRewardSubject, {
      fields: [xpLikeDisqualification.subjectId],
      references: [xpRewardSubject.id],
    }),
  })
);

export const eterisWalletRelations = relations(
  eterisWallet,
  ({ many, one }) => ({
    balance: one(eterisWalletBalance),
    postings: many(eterisPosting),
    user: one(user, {
      fields: [eterisWallet.userId],
      references: [user.id],
    }),
  })
);

export const eterisWalletBalanceRelations = relations(
  eterisWalletBalance,
  ({ one }) => ({
    wallet: one(eterisWallet, {
      fields: [eterisWalletBalance.walletId],
      references: [eterisWallet.id],
    }),
  })
);

export const eterisTransactionRelations = relations(
  eterisTransaction,
  ({ many, one }) => ({
    actor: one(user, {
      fields: [eterisTransaction.actorUserId],
      references: [user.id],
    }),
    gachaponActivation: one(gachaponActivation, {
      fields: [eterisTransaction.id],
      references: [gachaponActivation.eterisTransactionId],
    }),
    officialCardShopPurchase: one(officialCardShopPurchase, {
      fields: [eterisTransaction.id],
      references: [officialCardShopPurchase.eterisTransactionId],
    }),
    blackMarketListingFee: one(blackMarketListing, {
      fields: [eterisTransaction.id],
      references: [blackMarketListing.feeTransactionId],
      relationName: "black_market_listing_fee",
    }),
    blackMarketListingFeeReversal: one(blackMarketListing, {
      fields: [eterisTransaction.id],
      references: [blackMarketListing.feeReversalTransactionId],
      relationName: "black_market_listing_fee_reversal",
    }),
    blackMarketSale: one(blackMarketSale, {
      fields: [eterisTransaction.id],
      references: [blackMarketSale.eterisTransactionId],
    }),
    postings: many(eterisPosting),
  })
);

export const eterisPostingRelations = relations(eterisPosting, ({ one }) => ({
  transaction: one(eterisTransaction, {
    fields: [eterisPosting.transactionId],
    references: [eterisTransaction.id],
  }),
  wallet: one(eterisWallet, {
    fields: [eterisPosting.walletId],
    references: [eterisWallet.id],
  }),
}));
