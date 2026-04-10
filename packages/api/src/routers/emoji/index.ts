import { getLogger } from "@orpc/experimental-pino";
import { asc, eq } from "@repo/db";
import { emoji, patron } from "@repo/db/schema/app";
import { PATRON_TIER_KEYS, userMeetsTierLevel } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../../index";
import {
  requiredSingleDeferredMediaSelectionInputSchema,
  withDeferredMediaSelection,
} from "../../utils/deferred-media";
import { getManagedMediaAssetFromRecord } from "../../utils/managed-media";

export default {
  admin: {
    create: permissionProcedure({ emojis: ["create"] })
      .input(
        z.object({
          displayName: z.string().min(1).max(128),
          isActive: z.boolean().default(true),
          mediaSelection: requiredSingleDeferredMediaSelectionInputSchema,
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

        const { mediaSelection, ...data } = input;

        const created = await withDeferredMediaSelection({
          db,
          onComplete: async ({ orderedMedia, tx }) => {
            const mediaAsset = getManagedMediaAssetFromRecord(orderedMedia[0]!);
            const [createdEmoji] = await tx
              .insert(emoji)
              .values({
                ...data,
                assetFormat: mediaAsset.assetFormat,
                assetKey: mediaAsset.assetKey,
                mediaId: mediaAsset.id,
              })
              .returning();

            return createdEmoji;
          },
          ownerKind: "Emoji",
          resourceName: input.displayName,
          selection: mediaSelection,
        });

        logger?.info(`Emoji created with id: ${created?.id}`);
        return created;
      }),

    delete: permissionProcedure({ emojis: ["delete"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Deleting emoji ${input}`);

        await db.delete(emoji).where(eq(emoji.id, input));
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
          displayName: z.string().min(1).max(128).optional(),
          id: z.string(),
          isActive: z.boolean().optional(),
          mediaSelection: requiredSingleDeferredMediaSelectionInputSchema,
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

        const { id, mediaSelection, ...data } = input;
        const updated = await withDeferredMediaSelection({
          db,
          onComplete: async ({ orderedMedia, tx }) => {
            const managedAsset = getManagedMediaAssetFromRecord(
              orderedMedia[0]!
            );
            const [updatedEmoji] = await tx
              .update(emoji)
              .set({
                ...data,
                assetFormat: managedAsset.assetFormat,
                assetKey: managedAsset.assetKey,
                mediaId: managedAsset.id,
              })
              .where(eq(emoji.id, id))
              .returning();

            return updatedEmoji;
          },
          ownerKind: "Emoji",
          resourceName: input.displayName ?? input.name ?? input.id,
          selection: mediaSelection,
        });

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
