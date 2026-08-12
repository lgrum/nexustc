import { DEFAULT_APP_THEME_ID } from "@repo/shared/app-theme";
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
    objectKey: text("object_key").notNull().unique(),
  },
  (table) => [
    index("media_created_at_idx").on(table.createdAt),
    index("media_folder_id_idx").on(table.folderId),
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
    ownerUserId: text("owner_user_id").notNull(),
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
    }).onDelete("cascade"),
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
    replyNotificationsEnabled: boolean("reply_notifications_enabled")
      .notNull()
      .default(true),
    userId: text("user_id").primaryKey(),
    visibilityConfig: jsonb("visibility_config")
      .$type<ProfileVisibilityConfig>()
      .notNull()
      .default(
        sql`'{"favorites": true, "reviews": true, "reserved": {}, "streak": false}'::jsonb`
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
  coveredPosts: many(post),
  creators: many(creator),
  featuredPosts: many(featuredPost),
  folder: one(mediaFolder, {
    fields: [media.folderId],
    references: [mediaFolder.id],
  }),
  emojis: many(emoji),
  postRelations: many(postMedia),
  stickers: many(sticker),
}));

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
