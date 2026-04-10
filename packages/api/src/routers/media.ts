import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getLogger } from "@orpc/experimental-pino";
import { asc, eq, inArray, isNull, sql } from "@repo/db";
import type * as RepoDb from "@repo/db";
import {
  emoji,
  media,
  mediaFolder,
  postMedia,
  sticker,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import z from "zod";

import { permissionProcedure } from "../index";
import { optimizeImageToWebp } from "../utils/images";
import { getS3Client } from "../utils/s3";

const mediaUploadSchema = z.object({
  folderId: z.string().nullable().optional(),
  files: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .min(1)
    .max(12),
});

const mediaBrowseSchema = z.object({
  folderId: z.string().nullable().optional(),
});

const mediaCreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

const mediaMoveSchema = z.object({
  folderId: z.string().nullable().optional(),
  mediaIds: z.array(z.string().min(1)).min(1).max(100),
});

type MediaFolderRecord = {
  createdAt: Date;
  id: string;
  name: string;
  parentId: string | null;
};

type Database = typeof RepoDb.db;
type MediaFolderLookupDb = Pick<Database, "query">;

function buildMediaUsageAggs(db: Database) {
  const postUsageAgg = db
    .select({
      mediaId: postMedia.mediaId,
      postUsageCount: sql<number>`COUNT(*)::integer`.as("post_usage_count"),
    })
    .from(postMedia)
    .groupBy(postMedia.mediaId)
    .as("post_media_usage");

  const emojiUsageAgg = db
    .select({
      emojiUsageCount: sql<number>`COUNT(*)::integer`.as("emoji_usage_count"),
      mediaId: emoji.mediaId,
    })
    .from(emoji)
    .where(sql`${emoji.mediaId} IS NOT NULL`)
    .groupBy(emoji.mediaId)
    .as("emoji_media_usage");

  const stickerUsageAgg = db
    .select({
      mediaId: sticker.mediaId,
      stickerUsageCount: sql<number>`COUNT(*)::integer`.as(
        "sticker_usage_count"
      ),
    })
    .from(sticker)
    .where(sql`${sticker.mediaId} IS NOT NULL`)
    .groupBy(sticker.mediaId)
    .as("sticker_media_usage");

  return {
    emojiUsageAgg,
    postUsageAgg,
    stickerUsageAgg,
  };
}

async function ensureMediaFolderExists(
  db: MediaFolderLookupDb,
  folderId: string | null | undefined
) {
  if (!folderId) {
    return null;
  }

  const folder = await db.query.mediaFolder.findFirst({
    columns: {
      createdAt: true,
      id: true,
      name: true,
      parentId: true,
    },
    where: eq(mediaFolder.id, folderId),
  });

  return folder ?? null;
}

async function getMediaFolderBreadcrumbs(
  db: MediaFolderLookupDb,
  folder: MediaFolderRecord
) {
  const breadcrumbs = [folder];
  let currentParentId = folder.parentId;

  while (currentParentId) {
    const parentFolder = await db.query.mediaFolder.findFirst({
      columns: {
        createdAt: true,
        id: true,
        name: true,
        parentId: true,
      },
      where: eq(mediaFolder.id, currentParentId),
    });

    if (!parentFolder) {
      break;
    }

    breadcrumbs.unshift(parentFolder);
    currentParentId = parentFolder.parentId;
  }

  return breadcrumbs;
}

export default {
  admin: {
    browse: permissionProcedure({
      media: ["list"],
    })
      .input(mediaBrowseSchema.optional())
      .handler(async ({ context: { db }, input, errors }) => {
        const targetFolder = await ensureMediaFolderExists(
          db,
          input?.folderId ?? null
        );

        if (input?.folderId && !targetFolder) {
          throw errors.NOT_FOUND();
        }

        const childFolderAgg = db
          .select({
            childFolderCount: sql<number>`COUNT(*)::integer`.as(
              "child_folder_count"
            ),
            parentId: mediaFolder.parentId,
          })
          .from(mediaFolder)
          .where(sql`${mediaFolder.parentId} IS NOT NULL`)
          .groupBy(mediaFolder.parentId)
          .as("media_folder_child_count");

        const folderMediaAgg = db
          .select({
            folderId: media.folderId,
            mediaCount: sql<number>`COUNT(*)::integer`.as("media_count"),
          })
          .from(media)
          .where(sql`${media.folderId} IS NOT NULL`)
          .groupBy(media.folderId)
          .as("media_folder_media_count");

        const { emojiUsageAgg, postUsageAgg, stickerUsageAgg } =
          buildMediaUsageAggs(db);

        const folders = await db
          .select({
            childFolderCount: sql<number>`COALESCE(${childFolderAgg.childFolderCount}, 0)`,
            createdAt: mediaFolder.createdAt,
            id: mediaFolder.id,
            mediaCount: sql<number>`COALESCE(${folderMediaAgg.mediaCount}, 0)`,
            name: mediaFolder.name,
            parentId: mediaFolder.parentId,
          })
          .from(mediaFolder)
          .leftJoin(childFolderAgg, eq(childFolderAgg.parentId, mediaFolder.id))
          .leftJoin(folderMediaAgg, eq(folderMediaAgg.folderId, mediaFolder.id))
          .where(
            targetFolder
              ? eq(mediaFolder.parentId, targetFolder.id)
              : isNull(mediaFolder.parentId)
          )
          .orderBy(asc(mediaFolder.name), asc(mediaFolder.createdAt));

        const items = await db
          .select({
            createdAt: media.createdAt,
            folderId: media.folderId,
            id: media.id,
            objectKey: media.objectKey,
            usageCount: sql<number>`
              COALESCE(${postUsageAgg.postUsageCount}, 0)
              + COALESCE(${emojiUsageAgg.emojiUsageCount}, 0)
              + COALESCE(${stickerUsageAgg.stickerUsageCount}, 0)
            `,
          })
          .from(media)
          .leftJoin(postUsageAgg, eq(postUsageAgg.mediaId, media.id))
          .leftJoin(emojiUsageAgg, eq(emojiUsageAgg.mediaId, media.id))
          .leftJoin(stickerUsageAgg, eq(stickerUsageAgg.mediaId, media.id))
          .where(
            targetFolder
              ? eq(media.folderId, targetFolder.id)
              : isNull(media.folderId)
          )
          .orderBy(sql`${media.createdAt} DESC`);

        return {
          breadcrumbs: targetFolder
            ? await getMediaFolderBreadcrumbs(db, targetFolder)
            : [],
          currentFolder: targetFolder,
          folders,
          items,
        };
      }),

    createFolder: permissionProcedure({
      media: ["list"],
    })
      .input(mediaCreateFolderSchema)
      .handler(async ({ context: { db }, input, errors }) => {
        const parentFolder = await ensureMediaFolderExists(db, input.parentId);

        if (input.parentId && !parentFolder) {
          throw errors.NOT_FOUND();
        }

        const [createdFolder] = await db
          .insert(mediaFolder)
          .values({
            name: input.name,
            parentId: parentFolder?.id ?? null,
          })
          .returning({
            createdAt: mediaFolder.createdAt,
            id: mediaFolder.id,
            name: mediaFolder.name,
            parentId: mediaFolder.parentId,
          });

        if (!createdFolder) {
          throw errors.INTERNAL_SERVER_ERROR();
        }

        return createdFolder;
      }),

    list: permissionProcedure({
      media: ["list"],
    }).handler(({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching admin media library");

      const { emojiUsageAgg, postUsageAgg, stickerUsageAgg } =
        buildMediaUsageAggs(db);

      return db
        .select({
          createdAt: media.createdAt,
          folderId: media.folderId,
          id: media.id,
          objectKey: media.objectKey,
          usageCount: sql<number>`
            COALESCE(${postUsageAgg.postUsageCount}, 0)
            + COALESCE(${emojiUsageAgg.emojiUsageCount}, 0)
            + COALESCE(${stickerUsageAgg.stickerUsageCount}, 0)
          `,
        })
        .from(media)
        .leftJoin(postUsageAgg, eq(postUsageAgg.mediaId, media.id))
        .leftJoin(emojiUsageAgg, eq(emojiUsageAgg.mediaId, media.id))
        .leftJoin(stickerUsageAgg, eq(stickerUsageAgg.mediaId, media.id))
        .orderBy(sql`${media.createdAt} DESC`);
    }),

    listFolders: permissionProcedure({
      media: ["list"],
    }).handler(({ context: { db } }) =>
      db
        .select({
          createdAt: mediaFolder.createdAt,
          id: mediaFolder.id,
          name: mediaFolder.name,
          parentId: mediaFolder.parentId,
        })
        .from(mediaFolder)
        .orderBy(asc(mediaFolder.name), asc(mediaFolder.createdAt))
    ),

    move: permissionProcedure({
      media: ["list"],
    })
      .input(mediaMoveSchema)
      .handler(async ({ context: { db }, input, errors }) => {
        const targetFolder = await ensureMediaFolderExists(db, input.folderId);

        if (input.folderId && !targetFolder) {
          throw errors.NOT_FOUND();
        }

        const updatedRows = await db
          .update(media)
          .set({
            folderId: targetFolder?.id ?? null,
          })
          .where(inArray(media.id, input.mediaIds))
          .returning({
            id: media.id,
          });

        if (updatedRows.length !== input.mediaIds.length) {
          throw errors.NOT_FOUND();
        }

        return {
          movedCount: updatedRows.length,
        };
      }),

    upload: permissionProcedure({
      files: ["upload"],
    })
      .input(mediaUploadSchema)
      .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(
          `Uploading ${input.files.length} media file(s) for user ${session.user.id}`
        );

        const targetFolder = await ensureMediaFolderExists(db, input.folderId);

        if (input.folderId && !targetFolder) {
          throw errors.NOT_FOUND();
        }

        const optimizedFiles = await Promise.all(
          input.files.map(async (file) => ({
            buffer: await optimizeImageToWebp(file),
            originalName: file.name,
          }))
        );

        const uploadedKeys: string[] = [];

        try {
          const uploadedMedia = await db.transaction(async (tx) => {
            const createdRows = [];

            for (const optimizedFile of optimizedFiles) {
              const objectKey = `media/${generateId()}.webp`;

              await getS3Client().send(
                new PutObjectCommand({
                  Body: optimizedFile.buffer,
                  Bucket: env.R2_ASSETS_BUCKET_NAME,
                  ContentLength: optimizedFile.buffer.byteLength,
                  ContentType: "image/webp",
                  Key: objectKey,
                })
              );

              uploadedKeys.push(objectKey);

              const [createdMedia] = await tx
                .insert(media)
                .values({
                  folderId: targetFolder?.id ?? null,
                  objectKey,
                })
                .returning({
                  createdAt: media.createdAt,
                  folderId: media.folderId,
                  id: media.id,
                  objectKey: media.objectKey,
                });

              if (!createdMedia) {
                throw new Error(
                  `Failed to create media row for ${optimizedFile.originalName}`
                );
              }

              createdRows.push(createdMedia);
            }

            return createdRows;
          });

          return uploadedMedia;
        } catch (error) {
          logger?.error("Failed to upload admin media");
          logger?.error(error);

          if (uploadedKeys.length > 0) {
            try {
              await getS3Client().send(
                new DeleteObjectsCommand({
                  Bucket: env.R2_ASSETS_BUCKET_NAME,
                  Delete: {
                    Objects: uploadedKeys.map((objectKey) => ({
                      Key: objectKey,
                    })),
                    Quiet: false,
                  },
                })
              );
            } catch (cleanupError) {
              logger?.error(
                `[IMPORTANT] Failed to clean up uploaded media: ${uploadedKeys.join(", ")}`
              );
              logger?.error(cleanupError);
            }
          }

          throw errors.INTERNAL_SERVER_ERROR();
        }
      }),
  },
};
