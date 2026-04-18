import { getLogger } from "@orpc/experimental-pino";
import { eq, siteConfig } from "@repo/db";
import {
  DEFAULT_MARQUEE_ITEMS,
  marqueeItemsSchema,
  marqueeUpdateSchema,
} from "@repo/shared/schemas";

import { ownerProcedure, publicProcedure } from "../index";

const MARQUEE_CONFIG_KEY = "main_marquee";

export default {
  getMarquee: publicProcedure.handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching marquee config");

    const result = await db
      .select({ value: siteConfig.value })
      .from(siteConfig)
      .where(eq(siteConfig.key, MARQUEE_CONFIG_KEY))
      .limit(1);

    const parsed = marqueeItemsSchema.safeParse(result[0]?.value);

    if (!parsed.success) {
      return { items: DEFAULT_MARQUEE_ITEMS };
    }

    return { items: parsed.data };
  }),

  getMarqueeForEdit: ownerProcedure.handler(
    async ({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching marquee config for editing");

      const result = await db
        .select({ value: siteConfig.value })
        .from(siteConfig)
        .where(eq(siteConfig.key, MARQUEE_CONFIG_KEY))
        .limit(1);

      const parsed = marqueeItemsSchema.safeParse(result[0]?.value);

      if (!parsed.success) {
        return { items: DEFAULT_MARQUEE_ITEMS };
      }

      return { items: parsed.data };
    }
  ),

  updateMarquee: ownerProcedure
    .input(marqueeUpdateSchema)
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info("Updating marquee config");

      const result = await db
        .insert(siteConfig)
        .values({
          key: MARQUEE_CONFIG_KEY,
          value: input.items,
        })
        .onConflictDoUpdate({
          set: {
            updatedAt: new Date(),
            value: input.items,
          },
          target: siteConfig.key,
        })
        .returning({ value: siteConfig.value });

      const parsed = marqueeItemsSchema.safeParse(result[0]?.value);

      if (!parsed.success) {
        return { items: DEFAULT_MARQUEE_ITEMS };
      }

      return { items: parsed.data };
    }),
};
