import { getLogger } from "@orpc/experimental-pino";
import { eq, staticPage } from "@repo/db";
import { staticPageUpdateSchema } from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../index";

const STATIC_PAGE_SLUGS = ["about", "legal", "privacy", "terms"] as const;

export default {
  getBySlug: publicProcedure
    .input(z.object({ slug: z.enum(STATIC_PAGE_SLUGS) }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching static page: ${input.slug}`);

      const result = await db
        .select()
        .from(staticPage)
        .where(eq(staticPage.slug, input.slug))
        .limit(1);

      if (result.length === 0) {
        logger?.info(`Static page not found: ${input.slug}`);
        return null;
      }

      logger?.info(`Returning static page: ${result[0]?.id}`);
      return result[0];
    }),

  getForEdit: permissionProcedure({ staticPages: ["update"] })
    .input(z.object({ slug: z.enum(STATIC_PAGE_SLUGS) }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching static page for editing: ${input.slug}`);

      const result = await db
        .select()
        .from(staticPage)
        .where(eq(staticPage.slug, input.slug))
        .limit(1);

      if (result.length === 0) {
        logger?.info(
          `Static page not found, returning defaults: ${input.slug}`
        );
        return {
          content: "",
          createdAt: new Date(),
          id: "",
          slug: input.slug,
          title: "",
          updatedAt: new Date(),
        };
      }

      logger?.info(`Returning static page for edit: ${result[0]?.id}`);
      return result[0];
    }),

  update: permissionProcedure({ staticPages: ["update"] })
    .input(staticPageUpdateSchema)
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Updating static page: ${input.slug}`);

      const existing = await db
        .select()
        .from(staticPage)
        .where(eq(staticPage.slug, input.slug))
        .limit(1);

      if (existing.length === 0) {
        logger?.info(`Creating new static page: ${input.slug}`);
        const result = await db
          .insert(staticPage)
          .values({
            content: input.content,
            slug: input.slug,
            title: input.title,
          })
          .returning();

        logger?.info(`Static page created successfully: ${result[0]?.id}`);
        return result[0];
      }

      logger?.info(`Updating existing static page: ${existing[0]?.id}`);
      const result = await db
        .update(staticPage)
        .set({
          content: input.content,
          title: input.title,
        })
        .where(eq(staticPage.id, existing[0]!.id))
        .returning();

      logger?.info(`Static page updated successfully: ${result[0]?.id}`);
      return result[0];
    }),
};
