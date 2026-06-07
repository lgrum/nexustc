import { getLogger } from "@orpc/experimental-pino";
import { asc, eq, sql } from "@repo/db";
import { comicCreator, post } from "@repo/db/schema/app";
import { webUrlSchema } from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure } from "../index";

const comicCreatorInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: webUrlSchema,
});

export default {
  admin: {
    create: permissionProcedure({ comics: ["create"] })
      .input(comicCreatorInputSchema)
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Creating comic creator "${input.name}"`);

        const [createdComicCreator] = await db
          .insert(comicCreator)
          .values({
            name: input.name,
            url: input.url,
          })
          .returning({
            id: comicCreator.id,
            name: comicCreator.name,
            url: comicCreator.url,
          });

        return createdComicCreator
          ? {
              ...createdComicCreator,
              usageCount: 0,
            }
          : null;
      }),

    list: permissionProcedure({ comics: ["list"] }).handler(
      async ({ context: { db, ...ctx } }) => {
        const logger = getLogger(ctx);
        logger?.info("Admin: Fetching comic creators");

        const usageAgg = db
          .select({
            comicCreatorId: post.comicCreatorId,
            usageCount: sql<number>`COUNT(*)::integer`.as("usage_count"),
          })
          .from(post)
          .where(
            sql`${post.type} = 'comic' AND ${post.comicCreatorId} IS NOT NULL`
          )
          .groupBy(post.comicCreatorId)
          .as("comic_creator_usage");

        return await db
          .select({
            id: comicCreator.id,
            name: comicCreator.name,
            url: comicCreator.url,
            usageCount: sql<number>`COALESCE(${usageAgg.usageCount}, 0)`,
          })
          .from(comicCreator)
          .leftJoin(usageAgg, eq(usageAgg.comicCreatorId, comicCreator.id))
          .orderBy(asc(comicCreator.name), asc(comicCreator.createdAt));
      }
    ),
  },
};
