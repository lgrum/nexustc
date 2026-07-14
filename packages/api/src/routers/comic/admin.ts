import { getLogger } from "@orpc/experimental-pino";
import { and, eq, inArray, lt, sql } from "@repo/db";
import { comicUploadSession, media, post } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import z from "zod";

import type { Context } from "../../context";
import { permissionProcedure } from "../../index";
import {
  COMIC_UPLOAD_SESSION_TTL_MS,
  COMIC_UPLOAD_URL_TTL_SECONDS,
  deleteComicUploadObjects,
  getUnreferencedComicUploadKeys,
  listComicUploadObjects,
} from "../../utils/comic-upload";
import {
  createContent,
  deleteContent,
  editContent,
  resolveContentSlug,
} from "../../utils/content-handlers";
import {
  comicCreateInputSchema,
  comicEditInputSchema,
} from "../../utils/deferred-media";
import { mapPostWithMedia } from "../../utils/post-media";

const comicUploadSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
});

async function cleanupExpiredComicUploads(db: Context["db"], userId: string) {
  const cleanupBefore = new Date(
    Date.now() - COMIC_UPLOAD_URL_TTL_SECONDS * 1000
  );
  const expiredSessions = await db.query.comicUploadSession.findMany({
    limit: 5,
    where: and(
      eq(comicUploadSession.userId, userId),
      lt(comicUploadSession.expiresAt, cleanupBefore)
    ),
  });

  for (const session of expiredSessions) {
    try {
      const objectKeys = await listComicUploadObjects(
        session.comicId,
        session.id
      );
      const referencedMedia =
        session.finalizedAt && objectKeys.length > 0
          ? await db
              .select({ objectKey: media.objectKey })
              .from(media)
              .where(inArray(media.objectKey, objectKeys))
          : [];
      const unusedKeys = getUnreferencedComicUploadKeys(
        objectKeys,
        referencedMedia.map((item) => item.objectKey)
      );
      await deleteComicUploadObjects(unusedKeys);
      await db
        .delete(comicUploadSession)
        .where(eq(comicUploadSession.id, session.id));
    } catch {
      // ponytail: cleanup is opportunistic; add a scheduled sweep if abandoned uploads become frequent.
    }
  }
}

async function createComicUploadSession(params: {
  comicId?: string;
  db: Context["db"];
  title: string;
  userId: string;
}) {
  await cleanupExpiredComicUploads(params.db, params.userId);
  const expiresAt = new Date(Date.now() + COMIC_UPLOAD_SESSION_TTL_MS);
  const [uploadSession] = await params.db
    .insert(comicUploadSession)
    .values({
      comicId: params.comicId ?? generateId(),
      expiresAt,
      title: params.title,
      userId: params.userId,
    })
    .returning({
      comicId: comicUploadSession.comicId,
      expiresAt: comicUploadSession.expiresAt,
      sessionId: comicUploadSession.id,
    });

  if (!uploadSession) {
    throw new Error("Failed to create comic upload session");
  }

  return uploadSession;
}

export default {
  beginCreateUpload: permissionProcedure({
    comics: ["create"],
  })
    .input(comicUploadSessionInputSchema)
    .handler(
      async ({ context: { db, session }, input }) =>
        await createComicUploadSession({
          db,
          title: input.title,
          userId: session.user.id,
        })
    ),

  beginEditUpload: permissionProcedure({
    comics: ["update"],
  })
    .input(
      comicUploadSessionInputSchema.extend({
        comicId: z.string().min(1),
      })
    )
    .handler(async ({ context: { db, session }, errors, input }) => {
      const existingComic = await db.query.post.findFirst({
        columns: { id: true },
        where: and(eq(post.id, input.comicId), eq(post.type, "comic")),
      });

      if (!existingComic) {
        throw errors.NOT_FOUND();
      }

      return await createComicUploadSession({
        comicId: existingComic.id,
        db,
        title: input.title,
        userId: session.user.id,
      });
    }),

  checkSlug: permissionProcedure({
    comics: ["list"],
  })
    .input(
      z.object({
        excludeId: z.string().optional(),
        title: z.string().trim().min(1).max(255),
      })
    )
    .handler(
      async ({ context: { db }, input }) =>
        await resolveContentSlug({
          db,
          excludeId: input.excludeId,
          title: input.title,
          type: "comic",
        })
    ),

  create: permissionProcedure({
    comics: ["create"],
  })
    .input(comicCreateInputSchema)
    .handler(createContent),

  createComicPrerequisites: permissionProcedure({
    comics: ["create"],
  }).handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching comic creation prerequisites");

    const terms = await db.query.term.findMany();
    logger?.debug(`Retrieved ${terms.length} terms for prerequisites`);
    const series = await db.query.contentSeries.findMany({
      orderBy: (table, { asc }) => [asc(table.title)],
      where: (table, { eq: equals }) => equals(table.type, "comic"),
    });
    logger?.debug(`Retrieved ${series.length} comic series for prerequisites`);

    return {
      series,
      terms,
    };
  }),

  delete: permissionProcedure({
    comics: ["delete"],
  })
    .input(z.string())
    .handler((params) =>
      deleteContent({
        ...params,
        input: {
          id: params.input,
          type: "comic",
        },
      })
    ),

  edit: permissionProcedure({
    comics: ["update"],
  })
    .input(comicEditInputSchema)
    .handler(editContent),

  getDashboardList: permissionProcedure({
    comics: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching comic dashboard list");

    return db.query.post.findMany({
      columns: {
        comicLastUpdateAt: true,
        comicPageCount: true,
        createdAt: true,
        creatorName: true,
        id: true,
        releasedAt: true,
        slug: true,
        status: true,
        title: true,
        updatedAt: true,
        version: true,
        views: true,
      },
      orderBy: (p, { desc }) => [
        sql`${p.releasedAt} DESC NULLS LAST`,
        desc(p.id),
      ],
      where: (p, { eq: equals }) => equals(p.type, "comic"),
      with: {
        terms: {
          with: {
            term: true,
          },
        },
      },
    });
  }),

  getEdit: permissionProcedure({
    comics: ["update"],
  })
    .input(z.string())
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching comic for editing: ${input}`);

      return db.query.post
        .findFirst({
          where: (p, { and: all, eq: equals }) =>
            all(equals(p.id, input), equals(p.type, "comic")),
          with: {
            coverMedia: true,
            engagementOverrides: {
              orderBy: (table, { asc: ascOrder }) => [
                ascOrder(table.sortOrder),
              ],
            },
            mediaRelations: {
              orderBy: (table, { asc: ascOrder }) => [
                ascOrder(table.sortOrder),
              ],
              with: {
                media: true,
              },
            },
            terms: {
              with: {
                term: true,
              },
            },
            translator: true,
          },
        })
        .then((result) => (result ? mapPostWithMedia(result) : null));
    }),
};
