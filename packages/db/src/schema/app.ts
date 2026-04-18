import {
  DOCUMENT_STATUSES,
  PATRON_TIER_KEYS,
  PREMIUM_LINK_ACCESS_LEVELS,
  TAXONOMIES,
} from "@repo/shared/constants";
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
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
    emailVerified: boolean("email_verified").default(false).notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    name: text("name").notNull(),
    role: text("role").default("user").notNull(),
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

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account),
  comicProgress: many(userComicProgress),
  patron: one(patron),
  profileEmblemAssignments: many(profileEmblemAssignment),
  profileMediaAssets: many(profileMediaAsset),
  profileRoleAssignments: many(profileRoleAssignment),
  profileSettings: one(profileSettings),
  sessions: many(session),
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
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    ...timestamps,
  },
  (table) => [
    index("creator_media_id_idx").on(table.mediaId),
    index("creator_name_idx").on(table.name),
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
    premiumLinksAccessLevel: premiumLinksAccessLevelEnum(
      "premium_links_access_level"
    )
      .notNull()
      .default("auto"),
    premiumLinks: text("premium_links"),
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
    ...timestamps,
  },
  (table) => [
    index("post_cover_media_id_idx").on(table.coverMediaId),
    index("post_creator_id_idx").on(table.creatorId),
    index("post_status_type_early_access_idx").on(
      table.status,
      table.type,
      table.earlyAccessPublicAt
    ),
    index("post_early_access_enabled_idx").on(table.earlyAccessEnabled),
    index("post_early_access_public_at_idx").on(table.earlyAccessPublicAt),
    index("post_title_gin_idx").using("gin", table.title.op("gin_trgm_ops")),
    index("post_status_idx").on(table.status),
    index("post_created_at_idx").on(table.createdAt),
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
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("featured_post_post_id_idx").on(table.postId),
    index("featured_post_position_idx").on(table.position),
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
    id: text("id").primaryKey().$defaultFn(generateId),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    postId: text("post_id").references(() => post.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("comment_post_id_idx").on(table.postId)]
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
      onDelete: "cascade",
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
    primaryKey({ columns: [table.userId, table.postId] }),
    index("post_rating_post_id_idx").on(table.postId),
    index("post_rating_created_at_idx").on(table.createdAt),
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

export const profileSettings = pgTable(
  "profile_settings",
  {
    bannerAssetId: text("banner_asset_id"),
    bannerColor: text("banner_color")
      .notNull()
      .default(PROFILE_DEFAULTS.bannerColor),
    bannerMode: profileBannerModeEnum("banner_mode").notNull().default("color"),
    userId: text("user_id").primaryKey(),
    visibilityConfig: jsonb("visibility_config")
      .$type<ProfileVisibilityConfig>()
      .notNull()
      .default(sql`'{"reserved": {}}'::jsonb`),
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
  engagementOverrides: many(postEngagementOverride),
  favorites: many(postBookmark),
  featured: many(featuredPost),
  likes: many(postLikes),
  mediaRelations: many(postMedia),
  ratings: many(postRating),
  terms: many(termPostRelation),
}));

export const mediaRelations = relations(media, ({ many, one }) => ({
  coveredPosts: many(post),
  creators: many(creator),
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
}));

export const termRelations = relations(term, ({ many }) => ({
  engagementQuestions: many(engagementQuestion),
  posts: many(termPostRelation),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  post: one(post, {
    fields: [comment.postId],
    references: [post.id],
  }),
}));

export const engagementQuestionRelations = relations(
  engagementQuestion,
  ({ one }) => ({
    tagTerm: one(term, {
      fields: [engagementQuestion.tagTermId],
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

export const postRatingRelations = relations(postRating, ({ one }) => ({
  post: one(post, {
    fields: [postRating.postId],
    references: [post.id],
  }),
  user: one(user, {
    fields: [postRating.userId],
    references: [user.id],
  }),
}));

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
