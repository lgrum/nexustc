import { getLogger } from "@orpc/experimental-pino";
import { asc, eq, sql } from "@repo/db";
import { post, translator } from "@repo/db/schema/app";
import { webUrlSchema } from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure } from "../index";

const translatorInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: webUrlSchema,
});

export default {
  admin: {
    create: permissionProcedure({ comics: ["create"] })
      .input(translatorInputSchema)
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info(`Admin: Creating translator "${input.name}"`);

        const [createdTranslator] = await db
          .insert(translator)
          .values({
            name: input.name,
            url: input.url,
          })
          .returning({
            id: translator.id,
            name: translator.name,
            url: translator.url,
          });

        return createdTranslator
          ? {
              ...createdTranslator,
              usageCount: 0,
            }
          : null;
      }),

    list: permissionProcedure({ comics: ["list"] }).handler(
      async ({ context: { db, ...ctx } }) => {
        const logger = getLogger(ctx);
        logger?.info("Admin: Fetching translators");

        const usageAgg = db
          .select({
            translatorId: post.translatorId,
            usageCount: sql<number>`COUNT(*)::integer`.as("usage_count"),
          })
          .from(post)
          .where(sql`${post.translatorId} IS NOT NULL`)
          .groupBy(post.translatorId)
          .as("translator_usage");

        return await db
          .select({
            id: translator.id,
            name: translator.name,
            url: translator.url,
            usageCount: sql<number>`COALESCE(${usageAgg.usageCount}, 0)`,
          })
          .from(translator)
          .leftJoin(usageAgg, eq(usageAgg.translatorId, translator.id))
          .orderBy(asc(translator.name), asc(translator.createdAt));
      }
    ),
  },
};
