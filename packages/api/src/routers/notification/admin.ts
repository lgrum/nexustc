import { and, desc, eq, newsArticle, notification } from "@repo/db";
import {
  globalAnnouncementUpdateSchema,
  notificationArchiveSchema,
} from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure } from "../../index";
import {
  archiveNotification,
  createGlobalAnnouncement,
  publishContentNewsArticle,
} from "../../services/notification";
import {
  globalAnnouncementCreateInputSchema,
  newsArticleCreateInputSchema,
  withDeferredMediaSelection,
} from "../../utils/deferred-media";

export default {
  archive: permissionProcedure({
    notifications: ["delete"],
  })
    .input(notificationArchiveSchema)
    .handler(async ({ context: { db }, input }) => {
      await archiveNotification(db, input.id);
    }),

  createGlobalAnnouncement: permissionProcedure({
    notifications: ["create"],
  })
    .input(globalAnnouncementCreateInputSchema)
    .handler(
      async ({ context: { db, session }, input }) =>
        await withDeferredMediaSelection({
          db,
          onComplete: async ({ orderedMedia, tx }) =>
            await createGlobalAnnouncement(tx, {
              description: input.description,
              expirationAt: input.expirationAt,
              imageObjectKey: orderedMedia[0]?.objectKey,
              metadata: input.metadata,
              sourceUserId: session.user.id,
              title: input.title,
            }),
          ownerKind: "Anuncio",
          resourceName: input.title,
          selection: input.imageSelection,
        })
    ),

  createNewsArticle: permissionProcedure({
    notifications: ["create"],
  })
    .input(newsArticleCreateInputSchema)
    .handler(
      async ({ context: { db, session }, input }) =>
        await withDeferredMediaSelection({
          db,
          onComplete: async ({ orderedMedia, tx }) =>
            await publishContentNewsArticle(tx, {
              authorUserId: session.user.id,
              bannerImageObjectKey: orderedMedia[0]?.objectKey,
              body: input.body,
              contentId: input.contentId,
              expirationAt: input.expirationAt,
              metadata: input.metadata,
              publishedAt: input.publishedAt,
              summary: input.summary,
              title: input.title,
            }),
          ownerKind: "Articulo",
          resourceName: input.title,
          selection: input.bannerImageSelection,
        })
    ),

  listGlobalAnnouncements: permissionProcedure({
    notifications: ["list"],
  }).handler(({ context: { db } }) =>
    db.query.notification.findMany({
      orderBy: (table, { desc: descOrder }) => [descOrder(table.publishedAt)],
      where: (table, { eq: equals }) =>
        equals(table.type, "global_announcement"),
    })
  ),

  listNewsArticles: permissionProcedure({
    notifications: ["list"],
  })
    .input(
      z
        .object({
          contentId: z.string().optional(),
        })
        .optional()
    )
    .handler(({ context: { db }, input }) => {
      const query = db
        .select({
          bannerImageObjectKey: newsArticle.bannerImageObjectKey,
          contentId: newsArticle.contentId,
          expirationAt: newsArticle.expirationAt,
          id: newsArticle.id,
          notificationId: newsArticle.notificationId,
          publishedAt: newsArticle.publishedAt,
          status: newsArticle.status,
          summary: newsArticle.summary,
          title: newsArticle.title,
        })
        .from(newsArticle)
        .$dynamic();

      return (
        input?.contentId
          ? query.where(and(eq(newsArticle.contentId, input.contentId)))
          : query
      ).orderBy(desc(newsArticle.publishedAt));
    }),

  updateGlobalAnnouncement: permissionProcedure({
    notifications: ["update"],
  })
    .input(globalAnnouncementUpdateSchema)
    .handler(async ({ context: { db }, input, errors }) => {
      const [updatedNotification] = await db
        .update(notification)
        .set({
          description: input.description,
          expirationAt: input.expirationAt,
          imageObjectKey: input.imageObjectKey,
          metadata: {
            category: "global_announcement",
            ...input.metadata,
          },
          title: input.title,
        })
        .where(
          and(
            eq(notification.id, input.id),
            eq(notification.type, "global_announcement")
          )
        )
        .returning({
          id: notification.id,
        });

      if (!updatedNotification) {
        throw errors.NOT_FOUND();
      }

      return updatedNotification;
    }),
};
