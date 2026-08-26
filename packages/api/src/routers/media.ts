import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getLogger } from "@orpc/experimental-pino";
import { and, asc, eq, gt, inArray, isNull, sql } from "@repo/db";
import type * as RepoDb from "@repo/db";
import {
  cardTemplate,
  comicUploadSession,
  emoji,
  featuredPost,
  media,
  mediaFolder,
  packTemplate,
  post,
  postMedia,
  profileCatalogDecorationRevision,
  profileCatalogSkinRevision,
  sticker,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  COMIC_MEDIA_MAX_ITEMS,
  COMIC_UPLOAD_BATCH_SIZE,
  COMIC_UPLOAD_MAX_BYTES,
} from "@repo/shared/media";
import z from "zod";

import { permissionProcedure } from "../index";
import {
  COMIC_UPLOAD_URL_TTL_SECONDS,
  getComicUploadObjectKey,
  isIssuedComicUploadObjectKey,
  listComicUploadObjects,
} from "../utils/comic-upload";
import { adminImageFilesSchema, optimizeFile } from "../utils/images";
import { getS3Client } from "../utils/s3";

const comicUploadObjectsSchema = z
  .array(
    z.object({
      contentLength: z.number().int().positive().max(COMIC_UPLOAD_MAX_BYTES),
      objectKey: z.string().min(1).optional(),
    })
  )
  .min(1)
  .max(COMIC_UPLOAD_BATCH_SIZE);

const mediaUploadSchema = z.object({
  folderId: z.string().nullable().optional(),
  files: adminImageFilesSchema,
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
  const cardTemplateUsageAgg = db
    .select({
      cardTemplateUsageCount: sql<number>`COUNT(*)::integer`.as(
        "card_template_usage_count"
      ),
      mediaId: cardTemplate.portraitMediaId,
    })
    .from(cardTemplate)
    .groupBy(cardTemplate.portraitMediaId)
    .as("card_template_media_usage");

  const coverUsageAgg = db
    .select({
      coverUsageCount: sql<number>`COUNT(*)::integer`.as("cover_usage_count"),
      mediaId: post.coverMediaId,
    })
    .from(post)
    .where(sql`${post.coverMediaId} IS NOT NULL`)
    .groupBy(post.coverMediaId)
    .as("post_cover_media_usage");

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

  const featuredUsageAgg = db
    .select({
      featuredUsageCount: sql<number>`COUNT(*)::integer`.as(
        "featured_usage_count"
      ),
      mediaId: featuredPost.thumbnailMediaId,
    })
    .from(featuredPost)
    .where(sql`${featuredPost.thumbnailMediaId} IS NOT NULL`)
    .groupBy(featuredPost.thumbnailMediaId)
    .as("featured_media_usage");

  const profileSkinUsageAgg = db
    .select({
      mediaId: profileCatalogSkinRevision.backgroundAssetId,
      profileSkinUsageCount: sql<number>`COUNT(*)::integer`.as(
        "profile_skin_usage_count"
      ),
    })
    .from(profileCatalogSkinRevision)
    .where(sql`${profileCatalogSkinRevision.backgroundAssetId} IS NOT NULL`)
    .groupBy(profileCatalogSkinRevision.backgroundAssetId)
    .as("profile_skin_media_usage");

  const packTemplateUsageAgg = db
    .select({
      mediaId: packTemplate.assetMediaId,
      packTemplateUsageCount: sql<number>`COUNT(*)::integer`.as(
        "pack_template_usage_count"
      ),
    })
    .from(packTemplate)
    .groupBy(packTemplate.assetMediaId)
    .as("pack_template_media_usage");

  const profileDecorationUsageAgg = db
    .select({
      mediaId: profileCatalogDecorationRevision.mediaAssetId,
      profileDecorationUsageCount: sql<number>`COUNT(*)::integer`.as(
        "profile_decoration_usage_count"
      ),
    })
    .from(profileCatalogDecorationRevision)
    .where(sql`${profileCatalogDecorationRevision.mediaAssetId} IS NOT NULL`)
    .groupBy(profileCatalogDecorationRevision.mediaAssetId)
    .as("profile_decoration_media_usage");

  return {
    cardTemplateUsageAgg,
    coverUsageAgg,
    emojiUsageAgg,
    featuredUsageAgg,
    packTemplateUsageAgg,
    profileDecorationUsageAgg,
    profileSkinUsageAgg,
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
    createComicUploadUrls: permissionProcedure({
      files: ["upload"],
    })
      .input(
        z.object({
          objects: comicUploadObjectsSchema,
          sessionId: z.string().min(1),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        const newObjectCount = input.objects.filter(
          (object) => !object.objectKey
        ).length;
        const [uploadSession] = await db
          .update(comicUploadSession)
          .set({
            issuedObjectCount: sql`${comicUploadSession.issuedObjectCount} + ${newObjectCount}`,
          })
          .where(
            and(
              eq(comicUploadSession.id, input.sessionId),
              eq(comicUploadSession.userId, session.user.id),
              gt(comicUploadSession.expiresAt, new Date()),
              isNull(comicUploadSession.finalizedAt),
              sql`${comicUploadSession.issuedObjectCount} <= ${COMIC_MEDIA_MAX_ITEMS - newObjectCount}`
            )
          )
          .returning({
            comicId: comicUploadSession.comicId,
            id: comicUploadSession.id,
            issuedObjectCount: comicUploadSession.issuedObjectCount,
          });

        if (!uploadSession) {
          throw errors.BAD_REQUEST({
            message: "Comic upload session expired or full",
          });
        }

        const previousIssuedObjectCount =
          uploadSession.issuedObjectCount - newObjectCount;
        if (
          input.objects.some(
            ({ objectKey }) =>
              objectKey &&
              !isIssuedComicUploadObjectKey(
                uploadSession.comicId,
                uploadSession.id,
                objectKey,
                previousIssuedObjectCount
              )
          )
        ) {
          throw errors.BAD_REQUEST({ message: "Invalid comic upload object" });
        }

        const uploadedObjectKeys = input.objects.some(
          ({ objectKey }) => objectKey
        )
          ? new Set(
              await listComicUploadObjects(
                uploadSession.comicId,
                uploadSession.id
              )
            )
          : new Set<string>();
        let nextObjectIndex = previousIssuedObjectCount + 1;

        return await Promise.all(
          input.objects.map(async ({ contentLength, objectKey }) => {
            const nextObjectKey =
              objectKey ??
              getComicUploadObjectKey(
                uploadSession.comicId,
                uploadSession.id,
                nextObjectIndex
              );
            if (!objectKey) {
              nextObjectIndex += 1;
            }
            if (uploadedObjectKeys.has(nextObjectKey)) {
              return { objectKey: nextObjectKey, presignedUrl: null };
            }
            const presignedUrl = await getSignedUrl(
              getS3Client(),
              new PutObjectCommand({
                Bucket: env.R2_ASSETS_BUCKET_NAME,
                ContentLength: contentLength,
                ContentType: "image/webp",
                IfNoneMatch: "*",
                Key: nextObjectKey,
              }),
              { expiresIn: COMIC_UPLOAD_URL_TTL_SECONDS }
            );

            return { objectKey: nextObjectKey, presignedUrl };
          })
        );
      }),

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

        const {
          cardTemplateUsageAgg,
          coverUsageAgg,
          emojiUsageAgg,
          featuredUsageAgg,
          packTemplateUsageAgg,
          profileDecorationUsageAgg,
          profileSkinUsageAgg,
          postUsageAgg,
          stickerUsageAgg,
        } = buildMediaUsageAggs(db);

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
              + COALESCE(${cardTemplateUsageAgg.cardTemplateUsageCount}, 0)
              + COALESCE(${coverUsageAgg.coverUsageCount}, 0)
              + COALESCE(${emojiUsageAgg.emojiUsageCount}, 0)
              + COALESCE(${featuredUsageAgg.featuredUsageCount}, 0)
              + COALESCE(${packTemplateUsageAgg.packTemplateUsageCount}, 0)
              + COALESCE(${profileDecorationUsageAgg.profileDecorationUsageCount}, 0)
              + COALESCE(${profileSkinUsageAgg.profileSkinUsageCount}, 0)
              + COALESCE(${stickerUsageAgg.stickerUsageCount}, 0)
            `,
          })
          .from(media)
          .leftJoin(
            cardTemplateUsageAgg,
            eq(cardTemplateUsageAgg.mediaId, media.id)
          )
          .leftJoin(coverUsageAgg, eq(coverUsageAgg.mediaId, media.id))
          .leftJoin(postUsageAgg, eq(postUsageAgg.mediaId, media.id))
          .leftJoin(emojiUsageAgg, eq(emojiUsageAgg.mediaId, media.id))
          .leftJoin(featuredUsageAgg, eq(featuredUsageAgg.mediaId, media.id))
          .leftJoin(
            packTemplateUsageAgg,
            eq(packTemplateUsageAgg.mediaId, media.id)
          )
          .leftJoin(
            profileDecorationUsageAgg,
            eq(profileDecorationUsageAgg.mediaId, media.id)
          )
          .leftJoin(
            profileSkinUsageAgg,
            eq(profileSkinUsageAgg.mediaId, media.id)
          )
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

      const {
        cardTemplateUsageAgg,
        coverUsageAgg,
        emojiUsageAgg,
        featuredUsageAgg,
        packTemplateUsageAgg,
        profileDecorationUsageAgg,
        profileSkinUsageAgg,
        postUsageAgg,
        stickerUsageAgg,
      } = buildMediaUsageAggs(db);

      return db
        .select({
          createdAt: media.createdAt,
          folderId: media.folderId,
          id: media.id,
          objectKey: media.objectKey,
          usageCount: sql<number>`
            COALESCE(${postUsageAgg.postUsageCount}, 0)
            + COALESCE(${cardTemplateUsageAgg.cardTemplateUsageCount}, 0)
            + COALESCE(${coverUsageAgg.coverUsageCount}, 0)
            + COALESCE(${emojiUsageAgg.emojiUsageCount}, 0)
            + COALESCE(${featuredUsageAgg.featuredUsageCount}, 0)
            + COALESCE(${packTemplateUsageAgg.packTemplateUsageCount}, 0)
            + COALESCE(${profileDecorationUsageAgg.profileDecorationUsageCount}, 0)
            + COALESCE(${profileSkinUsageAgg.profileSkinUsageCount}, 0)
            + COALESCE(${stickerUsageAgg.stickerUsageCount}, 0)
          `,
        })
        .from(media)
        .leftJoin(
          cardTemplateUsageAgg,
          eq(cardTemplateUsageAgg.mediaId, media.id)
        )
        .leftJoin(coverUsageAgg, eq(coverUsageAgg.mediaId, media.id))
        .leftJoin(postUsageAgg, eq(postUsageAgg.mediaId, media.id))
        .leftJoin(emojiUsageAgg, eq(emojiUsageAgg.mediaId, media.id))
        .leftJoin(featuredUsageAgg, eq(featuredUsageAgg.mediaId, media.id))
        .leftJoin(
          packTemplateUsageAgg,
          eq(packTemplateUsageAgg.mediaId, media.id)
        )
        .leftJoin(
          profileDecorationUsageAgg,
          eq(profileDecorationUsageAgg.mediaId, media.id)
        )
        .leftJoin(
          profileSkinUsageAgg,
          eq(profileSkinUsageAgg.mediaId, media.id)
        )
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

        const uploadedKeys: string[] = [];

        try {
          const optimizedUploads: { isAnimated: boolean; objectKey: string }[] =
            [];
          for (const file of input.files) {
            const { buffer, extension, isAnimated, mimeType } =
              await optimizeFile(file);
            const objectKey = `media/${generateId()}.${extension}`;

            await getS3Client().send(
              new PutObjectCommand({
                Body: buffer,
                Bucket: env.R2_ASSETS_BUCKET_NAME,
                ContentLength: buffer.byteLength,
                ContentType: mimeType,
                Key: objectKey,
              })
            );

            uploadedKeys.push(objectKey);
            optimizedUploads.push({ isAnimated, objectKey });
          }

          const createdRows = await db
            .insert(media)
            .values(
              uploadedKeys.map((objectKey) => ({
                folderId: targetFolder?.id ?? null,
                isAnimated:
                  optimizedUploads.find(
                    (upload) => upload.objectKey === objectKey
                  )?.isAnimated ?? null,
                objectKey,
              }))
            )
            .returning({
              createdAt: media.createdAt,
              folderId: media.folderId,
              id: media.id,
              isAnimated: media.isAnimated,
              objectKey: media.objectKey,
            });
          const createdRowsByKey = new Map(
            createdRows.map((row) => [row.objectKey, row])
          );

          return uploadedKeys.map((objectKey) => {
            const row = createdRowsByKey.get(objectKey);
            if (!row) {
              throw new Error(`Failed to create media row for ${objectKey}`);
            }
            return row;
          });
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
