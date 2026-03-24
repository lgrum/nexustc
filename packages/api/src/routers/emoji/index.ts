import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getLogger } from "@orpc/experimental-pino";
import { asc, eq } from "@repo/db";
import { emoji, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { PATRON_TIER_KEYS, userMeetsTierLevel } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../../index";
import { getS3Client } from "../../utils/s3";

const ASSET_MAX_SIZE_BYTES = 1024 * 1024 * 2; // 2MB

export default {
  admin: {
    create: permissionProcedure({ emojis: ["create"] })
      .input(
        z.object({
          assetFormat: z.string().min(1),
          assetKey: z.string().min(1),
          displayName: z.string().min(1).max(128),
          isActive: z.boolean().default(true),
          name: z
            .string()
            .min(1)
            .max(64)
            .regex(/^\w[\w-]*$/),
          order: z.number().int().default(0),
          requiredTier: z.enum(PATRON_TIER_KEYS).default("level1"),
          type: z.enum(["static", "animated"]),
        })
      )
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Creating emoji "${input.name}"`);

        const [created] = await db.insert(emoji).values(input).returning();
        logger?.info(`Emoji created with id: ${created?.id}`);
        return created;
      }),

    delete: permissionProcedure({ emojis: ["delete"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Soft-deleting emoji ${input}`);

        await db
          .update(emoji)
          .set({ isActive: false })
          .where(eq(emoji.id, input));
      }),

    getById: permissionProcedure({ emojis: ["update"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Fetching emoji ${input}`);

        const result = await db.query.emoji.findFirst({
          where: eq(emoji.id, input),
        });
        if (!result) {
          throw errors.NOT_FOUND();
        }
        return result;
      }),

    getUploadUrl: permissionProcedure({ emojis: ["create"] })
      .input(
        z.object({
          contentLength: z.number().max(ASSET_MAX_SIZE_BYTES),
          extension: z.enum(["webp", "gif"]),
          name: z
            .string()
            .min(1)
            .max(64)
            .regex(/^\w[\w-]*$/),
        })
      )
      .handler(async ({ context: { ...ctx }, input }) => {
        const logger = getLogger(ctx);
        const objectKey = `emojis/${input.name}.${input.extension}`;
        logger?.info(`Generating presigned URL for emoji asset: ${objectKey}`);

        const presignedUrl = await getSignedUrl(
          getS3Client(),
          new PutObjectCommand({
            Bucket: env.R2_ASSETS_BUCKET_NAME,
            ContentLength: input.contentLength,
            ContentType: `image/${input.extension}`,
            Key: objectKey,
          }),
          { expiresIn: 3600 }
        );

        return { objectKey, presignedUrl };
      }),

    list: permissionProcedure({ emojis: ["list"] }).handler(
      async ({ context: { db, ...ctx } }) => {
        const logger = getLogger(ctx);
        logger?.info("Admin: Fetching all emojis");

        return await db
          .select()
          .from(emoji)
          .orderBy(asc(emoji.order), asc(emoji.name));
      }
    ),

    update: permissionProcedure({ emojis: ["update"] })
      .input(
        z.object({
          assetFormat: z.string().min(1).optional(),
          assetKey: z.string().min(1).optional(),
          displayName: z.string().min(1).max(128).optional(),
          id: z.string(),
          isActive: z.boolean().optional(),
          name: z
            .string()
            .min(1)
            .max(64)
            .regex(/^\w[\w-]*$/)
            .optional(),
          order: z.number().int().optional(),
          requiredTier: z.enum(PATRON_TIER_KEYS).optional(),
          type: z.enum(["static", "animated"]).optional(),
        })
      )
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Updating emoji ${input.id}`);

        const { id, ...data } = input;
        const [updated] = await db
          .update(emoji)
          .set(data)
          .where(eq(emoji.id, id))
          .returning();
        return updated;
      }),
  },

  list: publicProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching emoji list");

      const emojis = await db
        .select()
        .from(emoji)
        .where(eq(emoji.isActive, true))
        .orderBy(asc(emoji.order), asc(emoji.name));

      let tier: PatronTier = "none";
      if (session?.user) {
        const patronRecord = await db.query.patron.findFirst({
          columns: { isActivePatron: true, tier: true },
          where: eq(patron.userId, session.user.id),
        });
        if (patronRecord?.isActivePatron) {
          ({ tier } = patronRecord);
        }
      }

      logger?.debug(`Returning ${emojis.length} emojis for tier ${tier}`);
      return emojis.map((e) => ({
        ...e,
        locked: !userMeetsTierLevel(
          { role: session?.user.role, tier },
          e.requiredTier as PatronTier
        ),
      }));
    }
  ),
};
