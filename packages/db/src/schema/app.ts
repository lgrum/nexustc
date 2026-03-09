import {
  DOCUMENT_STATUSES,
  PATRON_TIER_KEYS,
  TAXONOMIES,
} from "@repo/shared/constants";
import { relations } from "drizzle-orm";
import {
  boolean,
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
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: text("role").default("user").notNull(),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
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
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const patron = pgTable(
  "patron",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    patreonUserId: text("patreon_user_id").notNull().unique(),
    tier: text("tier", { enum: PATRON_TIER_KEYS }).notNull().default("none"),
    pledgeAmountCents: integer("pledge_amount_cents").notNull().default(0),
    isActivePatron: boolean("is_active_patron").notNull().default(false),
    patronSince: timestamp("patron_since", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }).notNull(),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("patron_user_id_idx").on(table.userId),
    index("patron_patreon_user_id_idx").on(table.patreonUserId),
    index("patron_tier_idx").on(table.tier),
  ]
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  patron: one(patron),
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
export const featuredPositionEnum = pgEnum("featured_position", [
  "main",
  "secondary",
]);

export const term = pgTable("term", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull(),
  color: text("color"),
  taxonomy: text("taxonomy", { enum: TAXONOMIES }).notNull(),
  ...timestamps,
});

export const post = pgTable(
  "post",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    type: postTypeEnum("type").notNull().default("post"),
    isWeekly: boolean("is_weekly").notNull().default(false),
    authorId: text("author_id").notNull(),
    creatorName: text("creator_name").notNull().default(""),
    creatorLink: text("creator_link").notNull().default(""),
    status: documentStatusEnum("status").notNull().default("draft"),
    version: text("version"),
    adsLinks: text("ads_links"),
    premiumLinks: text("premium_links"),
    changelog: text("changelog").notNull().default(""),
    views: integer("views").notNull().default(0),
    imageObjectKeys: jsonb("image_object_keys").$type<string[]>(),
    ...timestamps,
  },
  (table) => [
    index("post_title_gin_idx").using("gin", table.title.op("gin_trgm_ops")),
    index("post_status_idx").on(table.status),
    index("post_created_at_idx").on(table.createdAt),
  ]
);

export const featuredPost = pgTable(
  "featured_post",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    position: featuredPositionEnum("position").notNull(),
    order: integer("order").notNull(),
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
    id: text("id").primaryKey().$defaultFn(generateId),
    postId: text("post_id").references(() => post.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => [index("comment_post_id_idx").on(table.postId)]
);

export const termPostRelation = pgTable(
  "term_post_relation",
  {
    termId: text("term_id")
      .notNull()
      .references(() => term.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
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
    tagTermId: text("tag_term_id").references(() => term.id, {
      onDelete: "cascade",
    }),
    isGlobal: boolean("is_global").notNull().default(false),
    text: text("text").notNull(),
    locale: text("locale").notNull().default("es"),
    isActive: boolean("is_active").notNull().default(true),
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
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
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
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
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
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
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
    postId: text("post_id")
      .references(() => post.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    rating: integer("rating").notNull(),
    review: text("review").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("post_rating_post_id_idx").on(table.postId),
    index("post_rating_created_at_idx").on(table.createdAt),
  ]
);

export const tutorials = pgTable("tutorial", {
  id: text("id").primaryKey().$defaultFn(generateId),
  title: text("title").notNull(),
  description: text("content").notNull(),
  embedUrl: text("embed_url").notNull(),
  ...timestamps,
});

export const chronosPage = pgTable("chronos_page", {
  id: text("id").primaryKey().$defaultFn(generateId),
  stickyImageKey: text("sticky_image_key"),
  headerImageKey: text("header_image_key"),
  carouselImageKeys: jsonb("carousel_image_keys").$type<string[]>(),
  markdownContent: text("markdown_content").notNull().default(""),
  markdownImageKeys: jsonb("markdown_image_keys").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const staticPage = pgTable(
  "static_page",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    ...timestamps,
  },
  (table) => [index("static_page_slug_idx").on(table.slug)]
);

/** -------------------------------------------------------- */

export const emojiTypeEnum = pgEnum("emoji_type", ["static", "animated"]);

export const emoji = pgTable(
  "emoji",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull().unique(),
    displayName: text("display_name").notNull(),
    type: emojiTypeEnum("type").notNull().default("static"),
    assetKey: text("asset_key").notNull(),
    assetFormat: text("asset_format").notNull(),
    requiredTier: text("required_tier", { enum: PATRON_TIER_KEYS })
      .notNull()
      .default("level1"),
    order: integer("order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("emoji_name_idx").on(table.name),
    index("emoji_required_tier_idx").on(table.requiredTier),
  ]
);

export const sticker = pgTable(
  "sticker",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    name: text("name").notNull().unique(),
    displayName: text("display_name").notNull(),
    type: emojiTypeEnum("type").notNull().default("static"),
    assetKey: text("asset_key").notNull(),
    assetFormat: text("asset_format").notNull(),
    requiredTier: text("required_tier", { enum: PATRON_TIER_KEYS })
      .notNull()
      .default("level3"),
    order: integer("order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("sticker_name_idx").on(table.name),
    index("sticker_required_tier_idx").on(table.requiredTier),
  ]
);

export const emojiRelations = relations(emoji, () => ({}));

export const stickerRelations = relations(sticker, () => ({}));

/** -------------------------------------------------------- */

export const postRelations = relations(post, ({ many }) => ({
  terms: many(termPostRelation),
  comments: many(comment),
  favorites: many(postBookmark),
  likes: many(postLikes),
  ratings: many(postRating),
  featured: many(featuredPost),
  engagementOverrides: many(postEngagementOverride),
}));

export const featuredPostRelations = relations(featuredPost, ({ one }) => ({
  post: one(post, {
    fields: [featuredPost.postId],
    references: [post.id],
  }),
}));

export const termRelations = relations(term, ({ many }) => ({
  posts: many(termPostRelation),
  engagementQuestions: many(engagementQuestion),
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
    term: one(term, {
      fields: [termPostRelation.termId],
      references: [term.id],
    }),
    post: one(post, {
      fields: [termPostRelation.postId],
      references: [post.id],
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
