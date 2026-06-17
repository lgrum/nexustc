import { getLogger } from "@orpc/experimental-pino";
import { and, asc, desc, eq, sql } from "@repo/db";
import {
  comicCreator,
  post,
  postBookmark,
  postLikes,
  postRating,
  term,
  termPostRelation,
  user,
} from "@repo/db/schema/app";
import type { TAXONOMIES } from "@repo/shared/constants";
import { webUrlSchema } from "@repo/shared/schemas";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../index";
import { attachComicCatalogProgress } from "../services/comic-progress";
import { publicCatalogVisibilityCondition } from "../utils/early-access";
import { createPostCoverImageObjectKeySelect } from "../utils/post-media";

const comicCreatorInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.union([webUrlSchema, z.literal("")]),
});
const releasedAtSort = sql<Date>`COALESCE(${post.releasedAt}, ${post.createdAt})`;

export default {
  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching public comic creator ${input.id}`);

      const [creatorRecord] = await db
        .select({
          id: comicCreator.id,
          name: comicCreator.name,
          url: comicCreator.url,
        })
        .from(comicCreator)
        .where(eq(comicCreator.id, input.id))
        .limit(1);

      if (!creatorRecord) {
        throw errors.NOT_FOUND();
      }

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .innerJoin(user, eq(user.id, postLikes.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
        .innerJoin(user, eq(user.id, postBookmark.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const termsAgg = db
        .select({
          postId: termPostRelation.postId,
          terms: sql`
            json_agg(
              json_build_object(
                'id', ${term.id},
                'name', ${term.name},
                'taxonomy', ${term.taxonomy},
                'color', ${term.color}
              )
            )
          `.as("terms"),
        })
        .from(termPostRelation)
        .innerJoin(term, eq(term.id, termPostRelation.termId))
        .groupBy(termPostRelation.postId)
        .as("terms_agg");

      const ratingsAgg = db
        .select({
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          postId: postRating.postId,
        })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const comics = await db
        .select({
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          slug: post.slug,
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,
          title: post.title,
          type: post.type,
          version: post.version,
          views: post.views,
        })
        .from(post)
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(
          and(
            eq(post.status, "publish"),
            eq(post.type, "comic"),
            eq(post.comicCreatorId, input.id),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(desc(releasedAtSort), desc(post.createdAt), desc(post.id));

      const items = await attachComicCatalogProgress(db, {
        items: comics,
        userId: session?.user.id,
      });

      return {
        creator: creatorRecord,
        items,
        stats: {
          averageRating:
            items.length > 0
              ? items.reduce((total, item) => total + item.averageRating, 0) /
                items.length
              : 0,
          totalFavorites: items.reduce(
            (total, item) => total + item.favorites,
            0
          ),
          totalLikes: items.reduce((total, item) => total + item.likes, 0),
          totalViews: items.reduce((total, item) => total + item.views, 0),
        },
      };
    }),

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
