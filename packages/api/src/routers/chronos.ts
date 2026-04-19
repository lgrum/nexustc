import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getLogger } from "@orpc/experimental-pino";
import { chronosPage, eq } from "@repo/db";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import { MEDIA_IMAGE_MIME_TYPES } from "@repo/shared/media";
import { chronosUpdateSchema } from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../index";
import { optimizeFile } from "../utils/images";
import { getS3Client } from "../utils/s3";

export default {
  getCurrent: publicProcedure.handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching current chronos page");

    const result = await db
      .select()
      .from(chronosPage)
      .where(eq(chronosPage.isActive, true))
      .limit(1);

    if (result.length === 0) {
      logger?.info("No active chronos page found, returning defaults");
      return {
        carouselImageKeys: [],
        createdAt: new Date(),
        headerImageKey: null,
        id: "",
        isActive: true,
        markdownContent: "",
        markdownImageKeys: [],
        stickyImageKey: null,
        updatedAt: new Date(),
      };
    }

    logger?.info(`Returning chronos page: ${result[0]?.id}`);
    return result[0];
  }),

  getForEdit: permissionProcedure({ chronos: ["update"] }).handler(
    async ({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching chronos page for editing");

      const result = await db
        .select()
        .from(chronosPage)
        .where(eq(chronosPage.isActive, true))
        .limit(1);

      if (result.length === 0) {
        logger?.info("No active chronos page found, returning defaults");
        return {
          carouselImageKeys: [],
          createdAt: new Date(),
          headerImageKey: null,
          id: "",
          isActive: true,
          markdownContent: "",
          markdownImageKeys: [],
          stickyImageKey: null,
          updatedAt: new Date(),
        };
      }

      logger?.info(`Returning chronos page for edit: ${result[0]?.id}`);
      return result[0];
    }
  ),

  uploadImages: permissionProcedure({ chronos: ["update"] })
    .input(
      z.object({
        files: z.array(z.file().mime([...MEDIA_IMAGE_MIME_TYPES])).min(1),
        type: z.enum(["sticky", "header", "carousel", "markdown"]),
      })
    )
    .handler(async ({ context: { ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Uploading ${input.files.length} optimized chronos ${input.type} images`
      );

      const objectKeys = await Promise.all(
        input.files.map(async (file, index) => {
          logger?.debug(
            `Optimizing chronos image ${index + 1}/${input.files.length}: ${file.name}`
          );

          const optimizedFile = await optimizeFile(file);
          const objectKey = `images/chronos/${input.type}/${generateId()}.${optimizedFile.extension}`;

          await getS3Client().send(
            new PutObjectCommand({
              Body: optimizedFile.buffer,
              Bucket: env.R2_ASSETS_BUCKET_NAME,
              ContentLength: optimizedFile.buffer.byteLength,
              ContentType: optimizedFile.mimeType,
              Key: objectKey,
            })
          );

          return objectKey;
        })
      );

      logger?.info(
        `Successfully uploaded ${objectKeys.length} optimized chronos ${input.type} images`
      );
      return objectKeys;
    }),

  update: permissionProcedure({ chronos: ["update"] })
    .input(chronosUpdateSchema)
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info("Updating chronos page");

      const existing = await db
        .select()
        .from(chronosPage)
        .where(eq(chronosPage.isActive, true))
        .limit(1);

      if (existing.length === 0) {
        logger?.info("Creating new chronos page");
        const result = await db
          .insert(chronosPage)
          .values({
            carouselImageKeys: input.carouselImageKeys ?? [],
            headerImageKey: input.headerImageKey ?? null,
            isActive: true,
            markdownContent: input.markdownContent,
            markdownImageKeys: input.markdownImageKeys ?? [],
            stickyImageKey: input.stickyImageKey ?? null,
          })
          .returning();

        logger?.info(`Chronos page created successfully: ${result[0]?.id}`);
        return result[0];
      }

      logger?.info(`Updating existing chronos page: ${existing[0]?.id}`);
      const result = await db
        .update(chronosPage)
        .set({
          carouselImageKeys:
            input.carouselImageKeys ?? existing[0]!.carouselImageKeys,
          headerImageKey: input.headerImageKey ?? existing[0]!.headerImageKey,
          markdownContent: input.markdownContent,
          markdownImageKeys:
            input.markdownImageKeys ?? existing[0]!.markdownImageKeys,
          stickyImageKey: input.stickyImageKey ?? existing[0]!.stickyImageKey,
        })
        .where(eq(chronosPage.id, existing[0]!.id))
        .returning();

      logger?.info(`Chronos page updated successfully: ${result[0]?.id}`);
      return result[0];
    }),
};
