import { getLogger } from "@orpc/experimental-pino";
import { and, asc, desc, eq, getRedis, sql } from "@repo/db";
import { post, term, termPostRelation } from "@repo/db/schema/app";
import { TAXONOMIES } from "@repo/shared/constants";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../index";
import { publicCatalogVisibilityCondition } from "../utils/early-access";

const POPULAR_TAGS_CACHE_SECONDS = 300;

export default {
  create: permissionProcedure({ terms: ["create"] })
    .input(
      z.object({
        color: z.string().trim(),
        name: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .transform((val) => val.trim()),
        taxonomy: z.enum(TAXONOMIES),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Creating new term: "${input.name}" (taxonomy: ${input.taxonomy})`
      );

      try {
        if (input.color === "") {
          await db.insert(term).values({
            color: null,
            name: input.name,
            taxonomy: input.taxonomy,
          });

          logger?.debug(`Term created without color: ${input.name}`);
        } else {
          await db.insert(term).values(input);
          logger?.debug(
            `Term created with color: ${input.name} (${input.color})`
          );
        }
        logger?.info(`Term successfully created: ${input.name}`);
      } catch (error) {
        logger?.error(`Failed to create term "${input.name}": ${error}`);
        throw errors.INTERNAL_SERVER_ERROR({
          message: `Error desconocido. Info: ${error}`,
        });
      }
    }),

  delete: permissionProcedure({ terms: ["delete"] })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Deleting term: ${input.id}`);

      await db.delete(term).where(eq(term.id, input.id));
      logger?.debug(`Term ${input.id} deleted successfully`);
    }),

  edit: permissionProcedure({ terms: ["update"] })
    .input(
      z.object({
        color: z.string().trim(),
        id: z.string(),
        name: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .transform((val) => val.trim()),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Editing term ${input.id}: "${input.name}"`);

      await db.update(term).set(input).where(eq(term.id, input.id));
      logger?.debug(`Term ${input.id} updated successfully`);
    }),

  getAll: publicProcedure.handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching all terms");
    return db.query.term.findMany({
      columns: {
        color: true,
        id: true,
        name: true,
        taxonomy: true,
      },
    });
  }),

  getPopularTags: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(24),
        minPostUsage: z.number().int().min(1).max(100).default(3),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching popular tags with at least ${input.minPostUsage} post uses`
      );

      const cacheKey = `terms:popular-tags:v1:${input.minPostUsage}:${input.limit}`;
      try {
        const redis = await getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as {
            color: string | null;
            id: string;
            name: string;
            taxonomy: (typeof TAXONOMIES)[number];
            usageCount: number;
          }[];
        }
      } catch (error) {
        logger?.warn("Redis cache read failed for popular tags");
        logger?.warn(error);
      }

      const tagUsageCount = sql<number>`COUNT(${termPostRelation.postId})`;

      const tags = await db
        .select({
          color: term.color,
          id: term.id,
          name: term.name,
          taxonomy: term.taxonomy,
          usageCount: sql<number>`${tagUsageCount}::integer`,
        })
        .from(termPostRelation)
        .innerJoin(term, eq(term.id, termPostRelation.termId))
        .innerJoin(post, eq(post.id, termPostRelation.postId))
        .where(
          and(
            eq(term.taxonomy, "tag"),
            eq(post.status, "publish"),
            eq(post.type, "post"),
            publicCatalogVisibilityCondition()
          )
        )
        .groupBy(term.id, term.name, term.taxonomy, term.color)
        .having(sql`${tagUsageCount} >= ${input.minPostUsage}`)
        .orderBy(desc(tagUsageCount), asc(term.name))
        .limit(input.limit);

      try {
        const redis = await getRedis();
        await redis.set(cacheKey, JSON.stringify(tags), {
          EX: POPULAR_TAGS_CACHE_SECONDS,
        });
      } catch (error) {
        logger?.warn("Redis cache write failed for popular tags");
        logger?.warn(error);
      }

      return tags;
    }),

  getDashboardList: permissionProcedure({ terms: ["list"] }).handler(
    ({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching term dashboard list");

      return db.query.term.findMany();
    }
  ),
};
