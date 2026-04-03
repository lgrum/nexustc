import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getLogger } from "@orpc/experimental-pino";
import { eq, sql } from "@repo/db";
import { emoji, media, postMedia, sticker } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import z from "zod";

import { permissionProcedure } from "../index";
import { optimizeImageToWebp } from "../utils/images";
import { getS3Client } from "../utils/s3";

const mediaUploadSchema = z.object({
  files: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .min(1)
    .max(12),
});

export default {
  admin: {
    list: permissionProcedure({
      media: ["list"],
    }).handler(({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching admin media library");

      const usageAgg = db
        .select({
          mediaId: postMedia.mediaId,
          postUsageCount: sql<number>`COUNT(*)::integer`.as("post_usage_count"),
        })
        .from(postMedia)
        .groupBy(postMedia.mediaId)
        .as("post_media_usage");

      const emojiUsageAgg = db
        .select({
          mediaId: emoji.mediaId,
          emojiUsageCount: sql<number>`COUNT(*)::integer`.as(
            "emoji_usage_count"
          ),
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

      return db
        .select({
          createdAt: media.createdAt,
          id: media.id,
          objectKey: media.objectKey,
          usageCount: sql<number>`
            COALESCE(${usageAgg.postUsageCount}, 0)
            + COALESCE(${emojiUsageAgg.emojiUsageCount}, 0)
            + COALESCE(${stickerUsageAgg.stickerUsageCount}, 0)
          `,
        })
        .from(media)
        .leftJoin(usageAgg, eq(usageAgg.mediaId, media.id))
        .leftJoin(emojiUsageAgg, eq(emojiUsageAgg.mediaId, media.id))
        .leftJoin(stickerUsageAgg, eq(stickerUsageAgg.mediaId, media.id))
        .orderBy(sql`${media.createdAt} DESC`);
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
                .values({ objectKey })
                .returning({
                  createdAt: media.createdAt,
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
