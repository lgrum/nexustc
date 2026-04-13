import { getLogger } from "@orpc/experimental-pino";
import { asc, eq, sql } from "@repo/db";
import { creator, media, post } from "@repo/db/schema/app";
import z from "zod";

import { permissionProcedure } from "../index";
import {
  requiredSingleDeferredMediaSelectionInputSchema,
  withDeferredMediaSelection,
} from "../utils/deferred-media";

const creatorInputSchema = z.object({
  mediaSelection: requiredSingleDeferredMediaSelectionInputSchema,
  name: z.string().trim().min(1).max(255),
  url: z.url(),
});

export default {
  admin: {
    create: permissionProcedure({ creators: ["create"] })
      .input(creatorInputSchema)
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Creating creator "${input.name}"`);

        return await withDeferredMediaSelection({
          db,
          onComplete: async ({ orderedMedia, tx }) => {
            const [createdCreator] = await tx
              .insert(creator)
              .values({
                mediaId: orderedMedia[0]!.id,
                name: input.name,
                url: input.url,
              })
              .returning({
                id: creator.id,
                mediaId: creator.mediaId,
                name: creator.name,
                url: creator.url,
              });

            return createdCreator
              ? {
                  ...createdCreator,
                  media: {
                    id: orderedMedia[0]!.id,
                    objectKey: orderedMedia[0]!.objectKey,
                  },
                  usageCount: 0,
                }
              : null;
          },
          ownerKind: "Creador",
          resourceName: input.name,
          selection: input.mediaSelection,
        });
      }),

    delete: permissionProcedure({ creators: ["delete"] })
      .input(z.string())
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Deleting creator ${input}`);

        await db.delete(creator).where(eq(creator.id, input));
      }),

    list: permissionProcedure({ creators: ["list"] }).handler(
      async ({ context: { db, ...ctx } }) => {
        const logger = getLogger(ctx);
        logger?.info("Admin: Fetching creators");

        const usageAgg = db
          .select({
            creatorId: post.creatorId,
            usageCount: sql<number>`COUNT(*)::integer`.as("usage_count"),
          })
          .from(post)
          .where(sql`${post.creatorId} IS NOT NULL`)
          .groupBy(post.creatorId)
          .as("creator_usage");

        return await db
          .select({
            id: creator.id,
            media: {
              id: media.id,
              objectKey: media.objectKey,
            },
            mediaId: creator.mediaId,
            name: creator.name,
            url: creator.url,
            usageCount: sql<number>`COALESCE(${usageAgg.usageCount}, 0)`,
          })
          .from(creator)
          .innerJoin(media, eq(media.id, creator.mediaId))
          .leftJoin(usageAgg, eq(usageAgg.creatorId, creator.id))
          .orderBy(asc(creator.name), asc(creator.createdAt));
      }
    ),
  },
};
