import { getLogger } from "@orpc/experimental-pino";
import { asc, eq } from "@repo/db";
import { patron, sticker } from "@repo/db/schema/app";
import { PATRON_TIER_KEYS, userMeetsTierLevel } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../../index";
import { getManagedMediaAsset } from "../../utils/managed-media";

export default {
  admin: {
    create: permissionProcedure({ stickers: ["create"] })
      .input(
        z.object({
          displayName: z.string().min(1).max(128),
          isActive: z.boolean().default(true),
          mediaId: z.string().min(1),
          name: z
            .string()
            .min(1)
            .max(64)
            .regex(/^\w[\w-]*$/),
          order: z.number().int().default(0),
          requiredTier: z.enum(PATRON_TIER_KEYS).default("level3"),
          type: z.enum(["static", "animated"]),
        })
      )
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Creating sticker "${input.name}"`);

        const mediaAsset = await getManagedMediaAsset(db, input.mediaId);

        const [created] = await db
          .insert(sticker)
          .values({
            ...input,
            assetFormat: mediaAsset.assetFormat,
            assetKey: mediaAsset.assetKey,
          })
          .returning();
        logger?.info(`Sticker created with id: ${created?.id}`);
        return created;
      }),

    delete: permissionProcedure({ stickers: ["delete"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Deleting sticker ${input}`);

        await db.delete(sticker).where(eq(sticker.id, input));
      }),

    getById: permissionProcedure({ stickers: ["update"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Fetching sticker ${input}`);

        const result = await db.query.sticker.findFirst({
          where: eq(sticker.id, input),
        });
        if (!result) {
          throw errors.NOT_FOUND();
        }
        return result;
      }),

    list: permissionProcedure({ stickers: ["list"] }).handler(
      async ({ context: { db, ...ctx } }) => {
        const logger = getLogger(ctx);
        logger?.info("Admin: Fetching all stickers");

        return await db
          .select()
          .from(sticker)
          .orderBy(asc(sticker.order), asc(sticker.name));
      }
    ),

    update: permissionProcedure({ stickers: ["update"] })
      .input(
        z.object({
          displayName: z.string().min(1).max(128).optional(),
          id: z.string(),
          isActive: z.boolean().optional(),
          mediaId: z.string().min(1).optional(),
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
        logger?.info(`Admin: Updating sticker ${input.id}`);

        const { id, mediaId, ...data } = input;
        const managedAsset = mediaId
          ? await getManagedMediaAsset(db, mediaId)
          : null;

        const [updated] = await db
          .update(sticker)
          .set({
            ...data,
            ...(managedAsset
              ? {
                  assetFormat: managedAsset.assetFormat,
                  assetKey: managedAsset.assetKey,
                  mediaId: managedAsset.id,
                }
              : {}),
          })
          .where(eq(sticker.id, id))
          .returning();
        return updated;
      }),
  },

  list: publicProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching sticker list");

      const stickers = await db
        .select()
        .from(sticker)
        .where(eq(sticker.isActive, true))
        .orderBy(asc(sticker.order), asc(sticker.name));

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

      logger?.debug(`Returning ${stickers.length} stickers for tier ${tier}`);
      return stickers.map((s) => ({
        ...s,
        locked: !userMeetsTierLevel(
          { role: session?.user.role, tier },
          s.requiredTier as PatronTier
        ),
      }));
    }
  ),
};
