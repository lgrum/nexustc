import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateId } from "../utils";
import { post, postTypeEnum, user } from "./app";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
};

export const notificationTypeEnum = pgEnum("notification_type", [
  "global_announcement",
  "content_update",
  "content_news",
  "system",
]);

export const notificationAudienceEnum = pgEnum("notification_audience", [
  "broadcast",
  "content_followers",
  "user",
]);

export const contentUpdateTypeEnum = pgEnum("content_update_type", [
  "game_version",
  "comic_pages",
]);

export const newsArticleStatusEnum = pgEnum("news_article_status", [
  "draft",
  "published",
  "archived",
]);

export const notification = pgTable(
  "notification",
  {
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    collapseKey: text("collapse_key"),
    dedupeKey: text("dedupe_key"),
    description: text("description").notNull().default(""),
    expirationAt: timestamp("expiration_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    imageObjectKey: text("image_object_key"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    priority: integer("priority").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sourceUserId: text("source_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    targetContentId: text("target_content_id").references(() => post.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    type: notificationTypeEnum("type").notNull(),
    ...timestamps,
  },
  (table) => [
    index("notification_published_at_idx").on(table.publishedAt),
    index("notification_type_idx").on(table.type),
    index("notification_target_content_id_idx").on(table.targetContentId),
    index("notification_collapse_key_idx").on(table.collapseKey),
    uniqueIndex("notification_dedupe_key_idx").on(table.dedupeKey),
  ]
);

export const notificationTarget = pgTable(
  "notification_target",
  {
    audienceType: notificationAudienceEnum("audience_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    targetContentId: text("target_content_id").references(() => post.id, {
      onDelete: "cascade",
    }),
    targetUserId: text("target_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("notification_target_notification_id_idx").on(table.notificationId),
    index("notification_target_audience_content_idx").on(
      table.audienceType,
      table.targetContentId
    ),
    index("notification_target_audience_user_idx").on(
      table.audienceType,
      table.targetUserId
    ),
  ]
);

export const notificationRead = pgTable(
  "notification_read",
  {
    notificationId: text("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.notificationId] }),
    index("notification_read_notification_id_idx").on(table.notificationId),
  ]
);

export const contentFollower = pgTable(
  "content_follower",
  {
    contentId: text("content_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    contentType: postTypeEnum("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.contentId] }),
    index("content_follower_content_id_idx").on(table.contentId),
    index("content_follower_user_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
  ]
);

export const newsArticle = pgTable(
  "news_article",
  {
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    bannerImageObjectKey: text("banner_image_object_key"),
    body: text("body").notNull(),
    contentId: text("content_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    expirationAt: timestamp("expiration_at", { withTimezone: true }),
    id: text("id").primaryKey().$defaultFn(generateId),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    notificationId: text("notification_id").references(() => notification.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: newsArticleStatusEnum("status").notNull().default("draft"),
    summary: text("summary").notNull().default(""),
    title: text("title").notNull(),
    ...timestamps,
  },
  (table) => [
    index("news_article_content_published_idx").on(
      table.contentId,
      table.publishedAt
    ),
    index("news_article_status_idx").on(table.status),
    uniqueIndex("news_article_notification_id_idx").on(table.notificationId),
  ]
);

export const contentUpdate = pgTable(
  "content_update",
  {
    contentId: text("content_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    currentPageCount: integer("current_page_count"),
    currentVersion: text("current_version"),
    dedupeKey: text("dedupe_key").notNull(),
    id: text("id").primaryKey().$defaultFn(generateId),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    notificationId: text("notification_id").references(() => notification.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    pagesAdded: integer("pages_added"),
    previousPageCount: integer("previous_page_count"),
    previousVersion: text("previous_version"),
    updateType: contentUpdateTypeEnum("update_type").notNull(),
  },
  (table) => [
    index("content_update_content_occurred_idx").on(
      table.contentId,
      table.occurredAt
    ),
    index("content_update_type_content_idx").on(
      table.updateType,
      table.contentId
    ),
    uniqueIndex("content_update_dedupe_key_idx").on(table.dedupeKey),
    uniqueIndex("content_update_notification_id_idx").on(table.notificationId),
  ]
);

export const notificationRelations = relations(
  notification,
  ({ many, one }) => ({
    reads: many(notificationRead),
    sourceUser: one(user, {
      fields: [notification.sourceUserId],
      references: [user.id],
    }),
    targetContent: one(post, {
      fields: [notification.targetContentId],
      references: [post.id],
    }),
    targets: many(notificationTarget),
  })
);

export const notificationTargetRelations = relations(
  notificationTarget,
  ({ one }) => ({
    notification: one(notification, {
      fields: [notificationTarget.notificationId],
      references: [notification.id],
    }),
    targetContent: one(post, {
      fields: [notificationTarget.targetContentId],
      references: [post.id],
    }),
    targetUser: one(user, {
      fields: [notificationTarget.targetUserId],
      references: [user.id],
    }),
  })
);

export const notificationReadRelations = relations(
  notificationRead,
  ({ one }) => ({
    notification: one(notification, {
      fields: [notificationRead.notificationId],
      references: [notification.id],
    }),
    user: one(user, {
      fields: [notificationRead.userId],
      references: [user.id],
    }),
  })
);

export const contentFollowerRelations = relations(
  contentFollower,
  ({ one }) => ({
    content: one(post, {
      fields: [contentFollower.contentId],
      references: [post.id],
    }),
    user: one(user, {
      fields: [contentFollower.userId],
      references: [user.id],
    }),
  })
);

export const newsArticleRelations = relations(newsArticle, ({ one }) => ({
  author: one(user, {
    fields: [newsArticle.authorUserId],
    references: [user.id],
  }),
  content: one(post, {
    fields: [newsArticle.contentId],
    references: [post.id],
  }),
  notification: one(notification, {
    fields: [newsArticle.notificationId],
    references: [notification.id],
  }),
}));

export const contentUpdateRelations = relations(contentUpdate, ({ one }) => ({
  content: one(post, {
    fields: [contentUpdate.contentId],
    references: [post.id],
  }),
  notification: one(notification, {
    fields: [contentUpdate.notificationId],
    references: [notification.id],
  }),
}));
