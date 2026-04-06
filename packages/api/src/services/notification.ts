import {
  and,
  contentFollower,
  contentUpdate,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  newsArticle,
  notification,
  notificationRead,
  notificationTarget,
  or,
  post,
  sql,
} from "@repo/db";

import type { Context } from "../context";

const CONTENT_UPDATE_COOLDOWN_MS = 30 * 60 * 1000;
const MIN_COMIC_PAGE_DELTA = 1;

type NotificationDb = Pick<
  Context["db"],
  "delete" | "execute" | "insert" | "query" | "select" | "update"
>;

type EditableContentSnapshot = {
  id: string;
  mediaCount: number;
  status: "draft" | "pending" | "publish" | "trash";
  title: string;
  type: "comic" | "post";
  version: string | null;
};

type EditableContentInput = {
  documentStatus: "draft" | "pending" | "publish" | "trash";
  mediaIds: string[];
  title: string;
  type: "comic" | "post";
  version?: string | null;
};

type ContentUpdateEventCandidate =
  | {
      contentId: string;
      contentTitle: string;
      contentType: "post";
      currentVersion: string;
      dedupeKey: string;
      metadata: Record<string, unknown>;
      previousVersion: string | null;
      updateType: "game_version";
    }
  | {
      contentId: string;
      contentTitle: string;
      contentType: "comic";
      currentPageCount: number;
      dedupeKey: string;
      metadata: Record<string, unknown>;
      pagesAdded: number;
      previousPageCount: number;
      updateType: "comic_pages";
    };

type FeedParams = {
  allowedAudiences?: ("broadcast" | "content_followers" | "user")[];
  cursor?: Date;
  limit: number;
  unreadOnly?: boolean;
  userId: string;
};

function normalizeVersion(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function pluralizePages(count: number): string {
  return count === 1 ? "page" : "pages";
}

function getContentPath(contentId: string): string {
  return `/post/${contentId}`;
}

function buildNotificationMetadata(
  candidate: ContentUpdateEventCandidate
): Record<string, unknown> {
  const baseMetadata = {
    contentId: candidate.contentId,
    contentType: candidate.contentType,
    linkPath: getContentPath(candidate.contentId),
  };

  if (candidate.updateType === "game_version") {
    return {
      ...baseMetadata,
      currentVersion: candidate.currentVersion,
      previousVersion: candidate.previousVersion,
      updateType: candidate.updateType,
      ...candidate.metadata,
    };
  }

  return {
    ...baseMetadata,
    currentPageCount: candidate.currentPageCount,
    pagesAdded: candidate.pagesAdded,
    previousPageCount: candidate.previousPageCount,
    updateType: candidate.updateType,
    ...candidate.metadata,
  };
}

function buildNotificationContent(candidate: ContentUpdateEventCandidate): {
  description: string;
  metadata: Record<string, unknown>;
  title: string;
} {
  if (candidate.updateType === "game_version") {
    return {
      description: candidate.previousVersion
        ? `${candidate.contentTitle} se actualizó de la versión ${candidate.previousVersion} a ${candidate.currentVersion}.`
        : `${candidate.contentTitle} ahora tiene una nueva versión jugable disponible.`,
      metadata: buildNotificationMetadata(candidate),
      title: `${candidate.contentTitle} actualizado a ${candidate.currentVersion}`,
    };
  }

  return {
    description: `${candidate.contentTitle} ahora tiene ${candidate.currentPageCount} ${pluralizePages(candidate.currentPageCount)} disponibles.`,
    metadata: buildNotificationMetadata(candidate),
    title: `${candidate.pagesAdded} ${pluralizePages(candidate.pagesAdded)} nuevas agregadas a ${candidate.contentTitle}`,
  };
}

export function deriveContentUpdateEvent(params: {
  next: EditableContentInput;
  previous: EditableContentSnapshot;
}): ContentUpdateEventCandidate | null {
  const { next, previous } = params;

  if (previous.status !== "publish" || next.documentStatus !== "publish") {
    return null;
  }

  if (previous.type === "post" && next.type === "post") {
    const previousVersion = normalizeVersion(previous.version);
    const nextVersion = normalizeVersion(next.version);

    if (!nextVersion || previousVersion === nextVersion) {
      return null;
    }

    return {
      contentId: previous.id,
      contentTitle: next.title,
      contentType: "post",
      currentVersion: nextVersion,
      dedupeKey: `game-version:${previous.id}:${nextVersion}`,
      metadata: {},
      previousVersion,
      updateType: "game_version",
    };
  }

  if (previous.type === "comic" && next.type === "comic") {
    const currentPageCount = next.mediaIds.length;
    const pagesAdded = currentPageCount - previous.mediaCount;

    if (pagesAdded < MIN_COMIC_PAGE_DELTA) {
      return null;
    }

    return {
      contentId: previous.id,
      contentTitle: next.title,
      contentType: "comic",
      currentPageCount,
      dedupeKey: `comic-pages:${previous.id}:${currentPageCount}`,
      metadata: {},
      pagesAdded,
      previousPageCount: previous.mediaCount,
      updateType: "comic_pages",
    };
  }

  return null;
}

async function createNotificationRecord(
  db: NotificationDb,
  params: {
    audienceType: "broadcast" | "content_followers" | "user";
    dedupeKey?: string;
    description: string;
    expirationAt?: Date;
    imageObjectKey?: string;
    metadata?: Record<string, unknown>;
    publishedAt?: Date;
    sourceUserId?: string;
    targetContentId?: string;
    targetUserId?: string;
    title: string;
    type: "content_news" | "content_update" | "global_announcement" | "system";
  }
) {
  const [createdNotification] = await db
    .insert(notification)
    .values({
      dedupeKey: params.dedupeKey,
      description: params.description,
      expirationAt: params.expirationAt,
      imageObjectKey: params.imageObjectKey,
      metadata: params.metadata ?? {},
      publishedAt: params.publishedAt ?? new Date(),
      sourceUserId: params.sourceUserId,
      targetContentId: params.targetContentId,
      title: params.title,
      type: params.type,
    })
    .returning({
      id: notification.id,
    });

  if (!createdNotification) {
    throw new Error("Failed to create notification");
  }

  await db.insert(notificationTarget).values({
    audienceType: params.audienceType,
    notificationId: createdNotification.id,
    targetContentId: params.targetContentId,
    targetUserId: params.targetUserId,
  });

  return createdNotification.id;
}

async function fetchNotificationFeed(db: NotificationDb, params: FeedParams) {
  const now = new Date();
  const accessibleTargets = db
    .select({
      audienceType: notificationTarget.audienceType,
      notificationId: notificationTarget.notificationId,
    })
    .from(notificationTarget)
    .leftJoin(
      contentFollower,
      and(
        eq(contentFollower.contentId, notificationTarget.targetContentId),
        eq(contentFollower.userId, params.userId)
      )
    )
    .where(
      and(
        params.allowedAudiences
          ? inArray(notificationTarget.audienceType, params.allowedAudiences)
          : sql`TRUE`,
        or(
          eq(notificationTarget.audienceType, "broadcast"),
          and(
            eq(notificationTarget.audienceType, "user"),
            eq(notificationTarget.targetUserId, params.userId)
          ),
          and(
            eq(notificationTarget.audienceType, "content_followers"),
            eq(contentFollower.userId, params.userId)
          )
        )
      )
    )
    .as("accessible_targets");

  const conditions = [
    lte(notification.publishedAt, now),
    or(isNull(notification.expirationAt), gt(notification.expirationAt, now)),
    isNull(notification.archivedAt),
  ];

  if (params.cursor) {
    conditions.push(lt(notification.publishedAt, params.cursor));
  }

  const rows = await db
    .select({
      audienceType: accessibleTargets.audienceType,
      contentType: post.type,
      description: notification.description,
      expirationAt: notification.expirationAt,
      id: notification.id,
      imageObjectKey: notification.imageObjectKey,
      isRead: sql<boolean>`${notificationRead.userId} IS NOT NULL`,
      metadata: notification.metadata,
      publishedAt: notification.publishedAt,
      targetContentId: notification.targetContentId,
      title: notification.title,
      type: notification.type,
    })
    .from(notification)
    .innerJoin(
      accessibleTargets,
      eq(accessibleTargets.notificationId, notification.id)
    )
    .leftJoin(post, eq(post.id, notification.targetContentId))
    .leftJoin(
      notificationRead,
      and(
        eq(notificationRead.notificationId, notification.id),
        eq(notificationRead.userId, params.userId)
      )
    )
    .where(
      and(
        ...conditions,
        params.unreadOnly ? isNull(notificationRead.userId) : sql`TRUE`
      )
    )
    .orderBy(desc(notification.publishedAt))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const nextCursor = hasMore ? (items.at(-1)?.publishedAt ?? null) : null;

  return {
    items,
    nextCursor,
  };
}

export function createGlobalAnnouncement(
  db: NotificationDb,
  params: {
    description: string;
    expirationAt?: Date;
    imageObjectKey?: string;
    metadata?: Record<string, unknown>;
    sourceUserId: string;
    title: string;
  }
) {
  return createNotificationRecord(db, {
    audienceType: "broadcast",
    description: params.description,
    expirationAt: params.expirationAt,
    imageObjectKey: params.imageObjectKey,
    metadata: {
      category: "global_announcement",
      ...params.metadata,
    },
    sourceUserId: params.sourceUserId,
    title: params.title,
    type: "global_announcement",
  });
}

export function createUserNotification(
  db: NotificationDb,
  params: {
    description: string;
    metadata?: Record<string, unknown>;
    sourceUserId?: string;
    targetUserId: string;
    title: string;
  }
) {
  return createNotificationRecord(db, {
    audienceType: "user",
    description: params.description,
    metadata: params.metadata,
    sourceUserId: params.sourceUserId,
    targetUserId: params.targetUserId,
    title: params.title,
    type: "system",
  });
}

export async function publishContentNewsArticle(
  db: NotificationDb,
  params: {
    authorUserId: string;
    bannerImageObjectKey?: string;
    body: string;
    contentId: string;
    expirationAt?: Date;
    metadata?: Record<string, unknown>;
    publishedAt?: Date;
    summary: string;
    title: string;
  }
) {
  const content = await db.query.post.findFirst({
    columns: {
      id: true,
      status: true,
      title: true,
      type: true,
    },
    where: eq(post.id, params.contentId),
  });

  if (!content || content.status !== "publish") {
    throw new Error("NEWS_ARTICLE_TARGET_MUST_BE_PUBLISHED");
  }

  const existingArticles = await db.query.newsArticle.findMany({
    columns: {
      id: true,
      notificationId: true,
    },
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(
        equals(table.contentId, params.contentId),
        equals(table.status, "published")
      ),
  });

  const previousNotificationIds = existingArticles
    .map((article) => article.notificationId)
    .filter(
      (notificationId): notificationId is string => notificationId !== null
    );

  if (existingArticles.length > 0) {
    await db
      .update(newsArticle)
      .set({
        status: "archived",
      })
      .where(
        inArray(
          newsArticle.id,
          existingArticles.map((article) => article.id)
        )
      );
  }

  if (previousNotificationIds.length > 0) {
    await db
      .update(notification)
      .set({
        archivedAt: new Date(),
      })
      .where(inArray(notification.id, previousNotificationIds));
  }

  const notificationId = await createNotificationRecord(db, {
    audienceType: "content_followers",
    description:
      params.summary || `New staff article published for ${content.title}.`,
    expirationAt: params.expirationAt,
    imageObjectKey: params.bannerImageObjectKey,
    metadata: {
      articleType: "manual_news",
      contentId: params.contentId,
      contentType: content.type,
      linkPath: getContentPath(params.contentId),
      ...params.metadata,
    },
    publishedAt: params.publishedAt,
    sourceUserId: params.authorUserId,
    targetContentId: params.contentId,
    title: params.title,
    type: "content_news",
  });

  const [article] = await db
    .insert(newsArticle)
    .values({
      authorUserId: params.authorUserId,
      bannerImageObjectKey: params.bannerImageObjectKey,
      body: params.body,
      contentId: params.contentId,
      expirationAt: params.expirationAt,
      metadata: params.metadata ?? {},
      notificationId,
      publishedAt: params.publishedAt ?? new Date(),
      status: "published",
      summary: params.summary,
      title: params.title,
    })
    .returning({
      id: newsArticle.id,
      notificationId: newsArticle.notificationId,
    });

  if (article?.id && notificationId) {
    await db
      .update(notification)
      .set({
        metadata: {
          articleId: article.id,
          articleType: "manual_news",
          contentId: params.contentId,
          contentType: content.type,
          linkPath: getContentPath(params.contentId),
          ...params.metadata,
        },
      })
      .where(eq(notification.id, notificationId));
  }

  return article;
}

export async function getPublishedNewsArticleById(
  db: NotificationDb,
  articleId: string
) {
  const now = new Date();

  const [article] = await db
    .select({
      bannerImageObjectKey: newsArticle.bannerImageObjectKey,
      body: newsArticle.body,
      contentId: newsArticle.contentId,
      contentTitle: post.title,
      contentType: post.type,
      expirationAt: newsArticle.expirationAt,
      id: newsArticle.id,
      publishedAt: newsArticle.publishedAt,
      summary: newsArticle.summary,
      title: newsArticle.title,
    })
    .from(newsArticle)
    .innerJoin(post, eq(post.id, newsArticle.contentId))
    .where(
      and(
        eq(newsArticle.id, articleId),
        eq(newsArticle.status, "published"),
        eq(post.status, "publish"),
        lte(newsArticle.publishedAt, now),
        or(isNull(newsArticle.expirationAt), gt(newsArticle.expirationAt, now))
      )
    )
    .limit(1);

  return article ?? null;
}

export function listPublishedNewsArticles(
  db: NotificationDb,
  params: {
    limit: number;
  }
) {
  const now = new Date();

  return db
    .select({
      bannerImageObjectKey: newsArticle.bannerImageObjectKey,
      contentId: newsArticle.contentId,
      contentTitle: post.title,
      contentType: post.type,
      id: newsArticle.id,
      publishedAt: newsArticle.publishedAt,
      summary: newsArticle.summary,
      title: newsArticle.title,
    })
    .from(newsArticle)
    .innerJoin(post, eq(post.id, newsArticle.contentId))
    .where(
      and(
        eq(newsArticle.status, "published"),
        eq(post.status, "publish"),
        lte(newsArticle.publishedAt, now),
        or(isNull(newsArticle.expirationAt), gt(newsArticle.expirationAt, now))
      )
    )
    .orderBy(desc(newsArticle.publishedAt))
    .limit(params.limit);
}

export async function createOrCollapseContentUpdateNotification(
  db: NotificationDb,
  candidate: ContentUpdateEventCandidate
) {
  const existingByDedupe = await db.query.contentUpdate.findFirst({
    columns: {
      id: true,
      notificationId: true,
    },
    where: eq(contentUpdate.dedupeKey, candidate.dedupeKey),
  });

  if (existingByDedupe) {
    return {
      notificationId: existingByDedupe.notificationId,
      status: "duplicate" as const,
      updateId: existingByDedupe.id,
    };
  }

  const cooldownStart = new Date(Date.now() - CONTENT_UPDATE_COOLDOWN_MS);
  const recentUpdate = await db.query.contentUpdate.findFirst({
    columns: {
      currentPageCount: true,
      currentVersion: true,
      dedupeKey: true,
      id: true,
      notificationId: true,
      pagesAdded: true,
      previousPageCount: true,
      previousVersion: true,
      updateType: true,
    },
    orderBy: (table, { desc: descOrder }) => [descOrder(table.occurredAt)],
    where: (table, { and: andWhere, eq: equals, gte: gteWhere }) =>
      andWhere(
        equals(table.contentId, candidate.contentId),
        equals(table.updateType, candidate.updateType),
        gteWhere(table.occurredAt, cooldownStart)
      ),
  });

  if (recentUpdate?.notificationId) {
    if (candidate.updateType === "game_version") {
      const collapsedCandidate: ContentUpdateEventCandidate = {
        ...candidate,
        previousVersion:
          recentUpdate.previousVersion ?? candidate.previousVersion,
      };
      const content = buildNotificationContent(collapsedCandidate);

      await db
        .update(notification)
        .set({
          dedupeKey: candidate.dedupeKey,
          description: content.description,
          metadata: content.metadata,
          publishedAt: new Date(),
          title: content.title,
        })
        .where(eq(notification.id, recentUpdate.notificationId));

      await db
        .update(contentUpdate)
        .set({
          currentVersion: candidate.currentVersion,
          dedupeKey: candidate.dedupeKey,
          metadata: content.metadata,
          occurredAt: new Date(),
          previousVersion: collapsedCandidate.previousVersion,
        })
        .where(eq(contentUpdate.id, recentUpdate.id));

      return {
        notificationId: recentUpdate.notificationId,
        status: "collapsed" as const,
        updateId: recentUpdate.id,
      };
    }

    const previousPageCount =
      recentUpdate.previousPageCount ?? candidate.previousPageCount;
    const pagesAdded = candidate.currentPageCount - previousPageCount;
    const collapsedCandidate: ContentUpdateEventCandidate = {
      ...candidate,
      pagesAdded,
      previousPageCount,
    };
    const content = buildNotificationContent(collapsedCandidate);

    await db
      .update(notification)
      .set({
        dedupeKey: candidate.dedupeKey,
        description: content.description,
        metadata: content.metadata,
        publishedAt: new Date(),
        title: content.title,
      })
      .where(eq(notification.id, recentUpdate.notificationId));

    await db
      .update(contentUpdate)
      .set({
        currentPageCount: candidate.currentPageCount,
        dedupeKey: candidate.dedupeKey,
        metadata: content.metadata,
        occurredAt: new Date(),
        pagesAdded,
        previousPageCount,
      })
      .where(eq(contentUpdate.id, recentUpdate.id));

    return {
      notificationId: recentUpdate.notificationId,
      status: "collapsed" as const,
      updateId: recentUpdate.id,
    };
  }

  const content = buildNotificationContent(candidate);
  const notificationId = await createNotificationRecord(db, {
    audienceType: "content_followers",
    dedupeKey: candidate.dedupeKey,
    description: content.description,
    metadata: content.metadata,
    targetContentId: candidate.contentId,
    title: content.title,
    type: "content_update",
  });

  const [createdUpdate] = await db
    .insert(contentUpdate)
    .values({
      contentId: candidate.contentId,
      currentPageCount:
        candidate.updateType === "comic_pages"
          ? candidate.currentPageCount
          : null,
      currentVersion:
        candidate.updateType === "game_version"
          ? candidate.currentVersion
          : null,
      dedupeKey: candidate.dedupeKey,
      metadata: content.metadata,
      notificationId,
      pagesAdded:
        candidate.updateType === "comic_pages" ? candidate.pagesAdded : null,
      previousPageCount:
        candidate.updateType === "comic_pages"
          ? candidate.previousPageCount
          : null,
      previousVersion:
        candidate.updateType === "game_version"
          ? candidate.previousVersion
          : null,
      updateType: candidate.updateType,
    })
    .returning({
      id: contentUpdate.id,
    });

  return {
    notificationId,
    status: "created" as const,
    updateId: createdUpdate?.id ?? null,
  };
}

export function getNotificationFeed(db: NotificationDb, params: FeedParams) {
  return fetchNotificationFeed(db, params);
}

export async function getFollowingOverview(
  db: NotificationDb,
  params: {
    limit: number;
    userId: string;
  }
) {
  const follows = await db
    .select({
      contentId: contentFollower.contentId,
      contentType: contentFollower.contentType,
      followedAt: contentFollower.createdAt,
      imageObjectKeys: post.imageObjectKeys,
      title: post.title,
      version: post.version,
    })
    .from(contentFollower)
    .innerJoin(post, eq(post.id, contentFollower.contentId))
    .where(eq(contentFollower.userId, params.userId))
    .orderBy(desc(contentFollower.createdAt))
    .limit(params.limit);

  const updates = await fetchNotificationFeed(db, {
    allowedAudiences: ["content_followers"],
    limit: params.limit,
    userId: params.userId,
  });

  return {
    follows,
    updates: updates.items,
  };
}

export async function getUnreadNotificationCount(
  db: NotificationDb,
  userId: string
) {
  const accessibleTargets = db
    .select({
      notificationId: notificationTarget.notificationId,
    })
    .from(notificationTarget)
    .leftJoin(
      contentFollower,
      and(
        eq(contentFollower.contentId, notificationTarget.targetContentId),
        eq(contentFollower.userId, userId)
      )
    )
    .where(
      or(
        eq(notificationTarget.audienceType, "broadcast"),
        and(
          eq(notificationTarget.audienceType, "user"),
          eq(notificationTarget.targetUserId, userId)
        ),
        and(
          eq(notificationTarget.audienceType, "content_followers"),
          eq(contentFollower.userId, userId)
        )
      )
    )
    .as("accessible_targets");

  const [result] = await db
    .select({
      count: sql<number>`COUNT(*)::integer`,
    })
    .from(notification)
    .innerJoin(
      accessibleTargets,
      eq(accessibleTargets.notificationId, notification.id)
    )
    .leftJoin(
      notificationRead,
      and(
        eq(notificationRead.notificationId, notification.id),
        eq(notificationRead.userId, userId)
      )
    )
    .where(
      and(
        lte(notification.publishedAt, new Date()),
        or(
          isNull(notification.expirationAt),
          gt(notification.expirationAt, new Date())
        ),
        isNull(notification.archivedAt),
        isNull(notificationRead.userId)
      )
    );

  return result?.count ?? 0;
}

export async function followContent(
  db: NotificationDb,
  params: {
    contentId: string;
    userId: string;
  }
) {
  const content = await db.query.post.findFirst({
    columns: {
      id: true,
      status: true,
      title: true,
      type: true,
    },
    where: eq(post.id, params.contentId),
  });

  if (!content || content.status !== "publish") {
    throw new Error("FOLLOW_TARGET_NOT_FOUND");
  }

  await db
    .insert(contentFollower)
    .values({
      contentId: content.id,
      contentType: content.type,
      userId: params.userId,
    })
    .onConflictDoNothing();

  return content;
}

export async function unfollowContent(
  db: NotificationDb,
  params: {
    contentId: string;
    userId: string;
  }
) {
  await db
    .delete(contentFollower)
    .where(
      and(
        eq(contentFollower.contentId, params.contentId),
        eq(contentFollower.userId, params.userId)
      )
    );
}

export async function getFollowState(
  db: NotificationDb,
  params: {
    contentId: string;
    userId: string;
  }
) {
  const follow = await db.query.contentFollower.findFirst({
    columns: {
      contentId: true,
    },
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(
        equals(table.contentId, params.contentId),
        equals(table.userId, params.userId)
      ),
  });

  return Boolean(follow);
}

export async function markNotificationsRead(
  db: NotificationDb,
  params: {
    notificationIds: string[];
    userId: string;
  }
) {
  const accessibleTargets = db
    .select({
      notificationId: notificationTarget.notificationId,
    })
    .from(notificationTarget)
    .leftJoin(
      contentFollower,
      and(
        eq(contentFollower.contentId, notificationTarget.targetContentId),
        eq(contentFollower.userId, params.userId)
      )
    )
    .where(
      and(
        inArray(notificationTarget.notificationId, params.notificationIds),
        or(
          eq(notificationTarget.audienceType, "broadcast"),
          and(
            eq(notificationTarget.audienceType, "user"),
            eq(notificationTarget.targetUserId, params.userId)
          ),
          and(
            eq(notificationTarget.audienceType, "content_followers"),
            eq(contentFollower.userId, params.userId)
          )
        )
      )
    );

  const accessibleTargetRows = await accessibleTargets;
  const accessibleNotificationIds = accessibleTargetRows.map(
    (item) => item.notificationId
  );

  if (accessibleNotificationIds.length === 0) {
    return 0;
  }

  await db
    .insert(notificationRead)
    .values(
      accessibleNotificationIds.map((notificationId) => ({
        notificationId,
        readAt: new Date(),
        userId: params.userId,
      }))
    )
    .onConflictDoNothing();

  return accessibleNotificationIds.length;
}

export async function markAllNotificationsRead(
  db: NotificationDb,
  userId: string
) {
  await db.execute(sql`
    INSERT INTO notification_read (notification_id, user_id, read_at)
    SELECT DISTINCT n.id, ${userId}, NOW()
    FROM notification n
    INNER JOIN notification_target nt ON nt.notification_id = n.id
    LEFT JOIN content_follower cf
      ON cf.content_id = nt.target_content_id
      AND cf.user_id = ${userId}
    LEFT JOIN notification_read nr
      ON nr.notification_id = n.id
      AND nr.user_id = ${userId}
    WHERE n.published_at <= NOW()
      AND (n.expiration_at IS NULL OR n.expiration_at > NOW())
      AND n.archived_at IS NULL
      AND nr.user_id IS NULL
      AND (
        nt.audience_type = 'broadcast'
        OR (nt.audience_type = 'user' AND nt.target_user_id = ${userId})
        OR (nt.audience_type = 'content_followers' AND cf.user_id = ${userId})
      )
    ON CONFLICT DO NOTHING
  `);
}

export async function archiveNotification(
  db: NotificationDb,
  notificationId: string
) {
  await db
    .update(notification)
    .set({
      archivedAt: new Date(),
    })
    .where(eq(notification.id, notificationId));
}
