import { getLogger } from "@orpc/experimental-pino";
import { and, asc, desc, eq, getRedis, isNull, ne, not, sql } from "@repo/db";
import {
  comment,
  commentLikes,
  contentSeries,
  creator,
  featuredPost,
  media,
  post,
  postBookmark,
  postLikes,
  postRating,
  term,
  termPostRelation,
} from "@repo/db/schema/app";
import {
  MAX_PINNED_ITEMS_PER_POST,
  canAccessPremiumLinks,
  getRequiredTierLabel,
  userMeetsTierLevel,
} from "@repo/shared/constants";
import type {
  TAXONOMIES,
  PatronTier,
  PremiumLinksDescriptor,
} from "@repo/shared/constants";
import { getMaskedPostLabel } from "@repo/shared/early-access";
import { parseTokens, validateTokenLimit } from "@repo/shared/token-parser";
import z from "zod";

import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../../index";
import { attachComicCatalogProgress } from "../../services/comic-progress";
import { buildProfileSummaries } from "../../services/profile";
import {
  getResolvedEngagementPromptsForPost,
  getSelectableEngagementPromptsForPost,
  resolveCommentEngagementSelection,
} from "../../utils/comment-engagement";
import {
  activeVipCatalogCondition,
  getPostEarlyAccessView,
  getViewerPatronTier,
  publicCatalogVisibilityCondition,
} from "../../utils/early-access";
import { assertContentHasNoForbiddenTerms } from "../../utils/forbidden-content";
import { createPostCoverImageObjectKeySelect } from "../../utils/post-media";
import {
  getPostViewDedupeKey,
  getPostViewViewerKey,
  POST_VIEW_DEDUPE_TTL_SECONDS,
} from "../../utils/post-views";
import admin from "./admin";

const RECOMMENDATION_LIMIT = 5;

export default {
  // Future improvement: add caching here because this endpoint is heavily used.
  getRecent: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(24).default(12) }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching recent posts with limit: ${input.limit}`);

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
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
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          content: post.content,
          createdAt: post.createdAt,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,

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
            eq(post.type, "post"),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(desc(post.createdAt))
        .limit(input.limit);

      logger?.debug(`Successfully fetched ${posts.length} recent posts`);
      return posts;
    }),

  // Future improvement: add caching here as well.
  getWeekly: publicProcedure.handler(
    async ({ context: { db, ...context } }) => {
      const logger = getLogger(context);
      logger?.info("Fetching weekly posts");

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
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
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          content: post.content,
          createdAt: post.createdAt,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,
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
            eq(post.isWeekly, true),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(asc(post.title));

      logger?.debug(`Successfully fetched ${posts.length} weekly posts`);
      return posts;
    }
  ),

  // Future improvement: cache this listing too.
  getFeatured: publicProcedure.handler(
    async ({ context: { db, ...context } }) => {
      const logger = getLogger(context);
      logger?.info("Fetching featured posts");

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
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
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          adsLinks: post.adsLinks,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          changelog: post.changelog,
          content: post.content,
          createdAt: post.createdAt,
          creatorLink: post.creatorLink,
          creatorName: post.creatorName,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          order: featuredPost.order,
          position: featuredPost.position,

          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
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
        .from(featuredPost)
        .innerJoin(post, eq(post.id, featuredPost.postId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(
          and(eq(post.status, "publish"), publicCatalogVisibilityCondition())
        )
        .orderBy(
          sql`CASE WHEN ${featuredPost.position} = 'main' THEN 0 ELSE 1 END`,
          featuredPost.order
        );

      logger?.debug(`Successfully fetched ${posts.length} featured posts`);
      return posts;
    }
  ),

  search: publicProcedure
    .input(
      z.object({
        orderBy: z
          .enum([
            "newest",
            "oldest",
            "title_asc",
            "title_desc",
            "views",
            "rating_avg",
            "rating_count",
            "likes",
          ])
          .optional()
          .default("newest"),
        query: z.string().optional(),
        termIds: z.array(z.string()).optional(),
        type: z.enum(["post", "comic"]),
      })
    )
    .handler(async ({ context: { db, session, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(
        `Searching posts with type: ${input.type}, query: ${input.query || "none"}, termIds: ${input.termIds?.length || 0}`
      );

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
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
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      // Build conditions array
      const conditions = [
        eq(post.status, "publish"),
        eq(post.type, input.type),
        publicCatalogVisibilityCondition(),
      ];

      // Add search filter combining exact substring match (ILIKE) and fuzzy match (pg_trgm)
      if (input.query && input.query.trim() !== "") {
        const trimmedQuery = input.query.trim();
        // Combine ILIKE for exact substring matches with trigram similarity for fuzzy matching
        // This ensures short queries (1-2 chars) work while still providing fuzzy matching for longer queries
        conditions.push(
          sql`(${post.title} ILIKE ${`%${trimmedQuery}%`} OR ${post.title} % ${trimmedQuery})`
        );
      }

      // Add term filter - posts must have ALL specified terms
      if (input.termIds && input.termIds.length > 0) {
        const termMatchSubquery = db
          .select({ postId: termPostRelation.postId })
          .from(termPostRelation)
          .where(
            sql`${termPostRelation.termId} IN (${sql.join(
              input.termIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
          .groupBy(termPostRelation.postId)
          .having(
            sql`COUNT(DISTINCT ${termPostRelation.termId}) = ${input.termIds.length}`
          );

        conditions.push(sql`${post.id} IN (${termMatchSubquery})`);
      }

      // Build the base query
      const baseQuery = db
        .select({
          adsLinks: post.adsLinks,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          changelog: post.changelog,
          content: post.content,
          createdAt: post.createdAt,
          creatorLink: post.creatorLink,
          creatorName: post.creatorName,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,

          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
          similarity: sql<number>`similarity(${post.title}, ${input.query?.trim() || ""})`,

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
        .where(and(...conditions));

      // Build the order clause based on input.orderBy
      const getOrderClause = () => {
        // When searching, similarity should be the primary sort
        const hasQuery = input.query && input.query.trim() !== "";
        const similarityPrefix = hasQuery ? sql`similarity DESC, ` : sql``;

        switch (input.orderBy) {
          case "newest": {
            return sql`${similarityPrefix}${post.createdAt} DESC`;
          }
          case "oldest": {
            return sql`${similarityPrefix}${post.createdAt} ASC`;
          }
          case "title_asc": {
            return sql`${similarityPrefix}${post.title} ASC`;
          }
          case "title_desc": {
            return sql`${similarityPrefix}${post.title} DESC`;
          }
          case "views": {
            return sql`${similarityPrefix}${post.views} DESC`;
          }
          case "rating_avg": {
            return sql`${similarityPrefix}COALESCE(${ratingsAgg.averageRating}, 0) DESC`;
          }
          case "rating_count": {
            return sql`${similarityPrefix}COALESCE(${ratingsAgg.ratingCount}, 0) DESC`;
          }
          case "likes": {
            return sql`${similarityPrefix}COALESCE(${likesAgg.count}, 0) DESC`;
          }
          default: {
            return sql`${similarityPrefix}${post.createdAt} DESC`;
          }
        }
      };

      const posts = await baseQuery.orderBy(getOrderClause());

      // Remove similarity field from the final result
      const result = posts.map(({ similarity: _, ...postData }) => postData);
      logger?.debug(`Search returned ${result.length} posts`);

      return attachComicCatalogProgress(db, {
        items: result,
        userId: session?.user.id,
      });
    }),

  getRandom: publicProcedure
    .input(z.object({ type: z.enum(["post", "comic"]) }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching random ${input.type}`);

      const result = await db
        .select({ id: post.id })
        .from(post)
        .where(
          and(
            eq(post.status, "publish"),
            eq(post.type, input.type),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);

      if (!result.length) {
        logger?.warn(`No published ${input.type} found for random selection`);
        return null;
      }

      logger?.debug(`Random ${input.type} selected: ${result[0]?.id}`);
      return result[0];
    }),

  getVipFeed: publicProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
    .handler(async ({ context: { db, ...context } }) => {
      const logger = getLogger(context);
      logger?.info("Fetching VIP early access feed");

      const viewerTier = await getViewerPatronTier(db, context.session);
      const items = await db
        .select({
          content: post.content,
          createdAt: post.createdAt,
          earlyAccessEnabled: post.earlyAccessEnabled,
          earlyAccessPublicAt: post.earlyAccessPublicAt,
          earlyAccessStartedAt: post.earlyAccessStartedAt,
          earlyAccessVip12EndsAt: post.earlyAccessVip12EndsAt,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          title: post.title,
          type: post.type,
          vip12EarlyAccessHours: post.vip12EarlyAccessHours,
          vip8EarlyAccessHours: post.vip8EarlyAccessHours,
          version: post.version,
        })
        .from(post)
        .where(and(eq(post.status, "publish"), activeVipCatalogCondition()))
        .orderBy(asc(post.earlyAccessPublicAt), desc(post.createdAt));

      const result = items.map((item) => {
        const earlyAccess = getPostEarlyAccessView(
          {
            earlyAccessEnabled: item.earlyAccessEnabled,
            earlyAccessStartedAt: item.earlyAccessStartedAt,
            type: item.type,
            vip12EarlyAccessHours: item.vip12EarlyAccessHours,
            vip8EarlyAccessHours: item.vip8EarlyAccessHours,
          },
          {
            role: context.session?.user.role,
            tier: viewerTier,
          }
        );

        return {
          content: item.content,
          coverImageObjectKey: item.coverImageObjectKey,
          createdAt: item.createdAt,
          earlyAccess,
          id: item.id,
          imageObjectKeys: item.imageObjectKeys,
          title: earlyAccess.isRestrictedView
            ? getMaskedPostLabel(item.id)
            : item.title,
          version: earlyAccess.isRestrictedView ? null : item.version,
        };
      });

      logger?.debug(`VIP feed returned ${result.length} items`);
      return result;
    }),

  // Future improvement: cache this endpoint too, especially for hot posts.
  getPostById: publicProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 20, windowSeconds: 60 }))
    .input(z.string())
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);

      logger?.info(`Fetching post by ID: ${input}`);

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
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
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          adsLinks: post.adsLinks,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          changelog: post.changelog,
          content: post.content,
          createdAt: post.createdAt,
          creatorAvatarObjectKey: media.objectKey,
          creatorId: post.creatorId,
          creatorLink: post.creatorLink,
          creatorName: post.creatorName,
          earlyAccessEnabled: post.earlyAccessEnabled,
          earlyAccessPublicAt: post.earlyAccessPublicAt,
          earlyAccessStartedAt: post.earlyAccessStartedAt,
          earlyAccessVip12EndsAt: post.earlyAccessVip12EndsAt,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
          premiumLinksAccessLevel: post.premiumLinksAccessLevel,
          rawPremiumLinks: post.premiumLinks,
          seriesId: post.seriesId,
          seriesOrder: post.seriesOrder,
          seriesTitle: contentSeries.title,
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

          updatedAt: post.updatedAt,
          vip12EarlyAccessHours: post.vip12EarlyAccessHours,
          vip8EarlyAccessHours: post.vip8EarlyAccessHours,

          version: post.version,
          views: post.views,
        })
        .from(post)
        .leftJoin(contentSeries, eq(contentSeries.id, post.seriesId))
        .leftJoin(creator, eq(creator.id, post.creatorId))
        .leftJoin(media, eq(media.id, creator.mediaId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(and(eq(post.status, "publish"), eq(post.id, input)))
        .limit(1);

      if (!result.length) {
        logger?.warn(`Post not found with ID: ${input}`);
        throw errors.NOT_FOUND();
      }

      logger?.debug(`Successfully retrieved post with ID: ${input}`);

      const viewerTier = await getViewerPatronTier(db, context.session);
      const earlyAccess = getPostEarlyAccessView(
        {
          earlyAccessEnabled: result[0]!.earlyAccessEnabled,
          earlyAccessStartedAt: result[0]!.earlyAccessStartedAt,
          type: result[0]!.type,
          vip12EarlyAccessHours: result[0]!.vip12EarlyAccessHours,
          vip8EarlyAccessHours: result[0]!.vip8EarlyAccessHours,
        },
        {
          role: context.session?.user.role,
          tier: viewerTier,
        }
      );

      const {
        earlyAccessEnabled: _earlyAccessEnabled,
        earlyAccessPublicAt: _earlyAccessPublicAt,
        earlyAccessStartedAt: _earlyAccessStartedAt,
        earlyAccessVip12EndsAt: _earlyAccessVip12EndsAt,
        premiumLinksAccessLevel,
        rawPremiumLinks,
        vip12EarlyAccessHours: _vip12EarlyAccessHours,
        vip8EarlyAccessHours: _vip8EarlyAccessHours,
        ...postData
      } = result[0]!;

      const engagementPrompts = await getResolvedEngagementPromptsForPost(
        db,
        input
      );

      let premiumLinksAccess: PremiumLinksDescriptor;
      if (earlyAccess.isRestrictedView) {
        premiumLinksAccess = { status: "no_premium_links" };
      } else if (rawPremiumLinks) {
        const statusTerm = postData.terms.find((t) => t.taxonomy === "status");
        const statusName = statusTerm?.name;

        premiumLinksAccess = canAccessPremiumLinks(
          { role: context.session?.user.role, tier: viewerTier },
          statusName,
          premiumLinksAccessLevel
        )
          ? { content: rawPremiumLinks, status: "granted" }
          : {
              isManualAccessLevel: premiumLinksAccessLevel !== "auto",
              requiredTierLabel: getRequiredTierLabel(
                viewerTier,
                statusName,
                premiumLinksAccessLevel
              ),
              status:
                viewerTier === "none"
                  ? "denied_need_patron"
                  : "denied_need_upgrade",
            };
      } else {
        premiumLinksAccess = { status: "no_premium_links" };
      }

      const seriesParts =
        postData.seriesId && !earlyAccess.isRestrictedView
          ? await db
              .select({
                averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
                coverImageObjectKey: createPostCoverImageObjectKeySelect(),
                favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
                id: post.id,
                imageObjectKeys: post.imageObjectKeys,
                thumbnailImageCount: post.thumbnailImageCount,
                likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
                seriesOrder: post.seriesOrder,
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
                  eq(post.seriesId, postData.seriesId),
                  eq(post.type, postData.type),
                  publicCatalogVisibilityCondition()
                )
              )
              .orderBy(asc(post.seriesOrder), asc(post.createdAt), asc(post.id))
          : [];

      return {
        ...postData,
        adsLinks: earlyAccess.isRestrictedView ? "" : postData.adsLinks,
        changelog: earlyAccess.isRestrictedView ? "" : postData.changelog,
        creatorAvatarObjectKey: earlyAccess.hideCreatorSupport
          ? null
          : postData.creatorAvatarObjectKey,
        creatorLink: earlyAccess.hideCreatorSupport ? "" : postData.creatorLink,
        creatorName: earlyAccess.hideCreatorSupport ? "" : postData.creatorName,
        earlyAccess,
        engagementPrompts: earlyAccess.isRestrictedView
          ? []
          : engagementPrompts,
        premiumLinksAccess,
        series: postData.seriesId
          ? {
              id: postData.seriesId,
              title: postData.seriesTitle ?? "",
              type: postData.type,
            }
          : null,
        seriesParts,
        terms: postData.terms,
        title: earlyAccess.isRestrictedView
          ? getMaskedPostLabel(postData.id)
          : postData.title,
        version: earlyAccess.isRestrictedView ? null : postData.version,
      };
    }),

  recordView: publicProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
    .input(
      z.object({
        anonymousViewerId: z.string().uuid().optional(),
        postId: z.string(),
      })
    )
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);
      logger?.info(`Recording post view for: ${input.postId}`);

      const targetPost = await db.query.post.findFirst({
        columns: {
          earlyAccessEnabled: true,
          earlyAccessStartedAt: true,
          id: true,
          status: true,
          type: true,
          vip12EarlyAccessHours: true,
          vip8EarlyAccessHours: true,
        },
        where: eq(post.id, input.postId),
      });

      if (!targetPost || targetPost.status !== "publish") {
        throw errors.NOT_FOUND();
      }

      const viewerTier = await getViewerPatronTier(db, context.session);
      const earlyAccess = getPostEarlyAccessView(targetPost, {
        role: context.session?.user.role,
        tier: viewerTier,
      });

      if (earlyAccess.isRestrictedView) {
        logger?.debug(`View skipped for restricted post view: ${input.postId}`);
        return { counted: false };
      }

      const viewerKey = getPostViewViewerKey({
        anonymousViewerId: input.anonymousViewerId,
        headers: context.headers,
        session: context.session,
      });

      if (!viewerKey) {
        logger?.debug(`View skipped without viewer key: ${input.postId}`);
        return { counted: false };
      }

      const redis = await getRedis();
      const dedupeKey = getPostViewDedupeKey(input.postId, viewerKey);
      const firstView = await redis.set(dedupeKey, "1", {
        EX: POST_VIEW_DEDUPE_TTL_SECONDS,
        NX: true,
      });

      if (firstView !== "OK") {
        logger?.debug(`Duplicate view skipped for post ${input.postId}`);
        return { counted: false };
      }

      await db
        .update(post)
        .set({ views: sql`${post.views} + 1` })
        .where(eq(post.id, input.postId));

      logger?.info(`View count incremented for post ${input.postId}`);
      return { counted: true };
    }),

  getLikes: publicProcedure
    .input(z.string())
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching likes count for post: ${input}`);

      const { count } = await db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(postLikes)
        .where(eq(postLikes.postId, input))
        .then((r) => r[0] ?? { count: 0 });

      logger?.debug(`Post ${input} has ${count} likes`);
      return count;
    }),

  likePost: protectedProcedure
    .input(z.string())
    .handler(async ({ context: { db, session, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`User ${session.user.id} attempting to like post: ${input}`);

      const existing = await db
        .select()
        .from(postLikes)
        .where(
          and(
            eq(postLikes.postId, input),
            eq(postLikes.userId, session.user.id)
          )
        )
        .limit(1);

      if (existing) {
        // already liked
        logger?.debug(
          `User ${session.user.id} has already liked post ${input}`
        );
        return;
      }

      await db.insert(postLikes).values({
        postId: input,
        userId: session.user.id,
      });
      logger?.info(`User ${session.user.id} successfully liked post ${input}`);
    }),

  unlikePost: protectedProcedure
    .input(z.string())
    .handler(async ({ context: { db, session, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(
        `User ${session.user.id} attempting to unlike post: ${input}`
      );

      await db
        .delete(postLikes)
        .where(
          and(
            eq(postLikes.postId, input),
            eq(postLikes.userId, session.user.id)
          )
        );
      logger?.info(
        `User ${session.user.id} successfully unliked post ${input}`
      );
    }),

  toggleLike: protectedProcedure
    .input(
      z.object({
        liked: z.boolean(),
        postId: z.string(),
      })
    )
    .handler(async ({ context: { db, session, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(
        `User ${session.user.id} toggling like for post ${input.postId} to ${input.liked}`
      );

      if (input.liked) {
        await db
          .insert(postLikes)
          .values({
            postId: input.postId,
            userId: session.user.id,
          })
          .onConflictDoNothing();

        logger?.debug(
          `Like insert completed for user ${session.user.id} on post ${input.postId}`
        );
      } else {
        await db
          .delete(postLikes)
          .where(
            and(
              eq(postLikes.postId, input.postId),
              eq(postLikes.userId, session.user.id)
            )
          );
        logger?.debug(
          `Like delete completed for user ${session.user.id} on post ${input.postId}`
        );
      }
      logger?.info(
        `Like toggle completed for user ${session.user.id} on post ${input.postId}`
      );
    }),

  createComment: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 3, windowSeconds: 600 }))
    .input(
      z.object({
        content: z.string().min(10).max(2048),
        engagementPrompt: z
          .object({
            id: z.string(),
            source: z.enum(["manual", "tag"]),
          })
          .optional(),
        parentId: z.string().optional(),
        postId: z.string(),
      })
    )
    .handler(
      async ({ context: { db, session, ...context }, input, errors }) => {
        const logger = getLogger(context);
        logger?.info(
          `User ${session.user.id} creating comment on post ${input.postId}`
        );
        const viewerTier = await getViewerPatronTier(db, session);
        const targetPost = await db.query.post.findFirst({
          columns: {
            earlyAccessEnabled: true,
            earlyAccessStartedAt: true,
            type: true,
            vip12EarlyAccessHours: true,
            vip8EarlyAccessHours: true,
          },
          where: eq(post.id, input.postId),
        });

        if (!targetPost) {
          throw errors.NOT_FOUND();
        }

        const earlyAccess = getPostEarlyAccessView(targetPost, {
          role: session.user.role,
          tier: viewerTier,
        });
        if (earlyAccess.isActive) {
          logger?.warn(
            `Comment blocked for post ${input.postId} because early access is active`
          );
          throw errors.FORBIDDEN();
        }

        if (input.parentId) {
          const parentComment = await db.query.comment.findFirst({
            columns: {
              id: true,
              parentId: true,
              postId: true,
            },
            where: eq(comment.id, input.parentId),
          });

          if (!parentComment || parentComment.postId !== input.postId) {
            throw errors.BAD_REQUEST({
              message:
                "No se pudo encontrar el comentario que quieres responder.",
            });
          }

          if (parentComment.parentId !== null) {
            throw errors.BAD_REQUEST({
              message: "Solo se puede responder a comentarios principales.",
            });
          }
        }

        await assertContentHasNoForbiddenTerms({
          content: input.content,
          db,
          errors,
        });

        const selectableEngagementPrompts =
          input.engagementPrompt === undefined
            ? []
            : await getSelectableEngagementPromptsForPost(db, input.postId);
        const selectedEngagementPrompt = resolveCommentEngagementSelection(
          selectableEngagementPrompts,
          input.engagementPrompt
        );

        if (input.engagementPrompt && !selectedEngagementPrompt) {
          logger?.warn(
            `Comment blocked for post ${input.postId} because the engagement prompt selection is invalid`
          );
          throw errors.FORBIDDEN();
        }

        const tokens = parseTokens(input.content);

        if (tokens.length > 0) {
          const limitCheck = validateTokenLimit(tokens);
          if (!limitCheck.valid) {
            throw errors.FORBIDDEN();
          }

          const userCtx = { role: session.user.role, tier: viewerTier };

          const emojiTokens = tokens.filter((t) => t.type === "emoji");
          const stickerTokens = tokens.filter((t) => t.type === "sticker");

          if (emojiTokens.length > 0) {
            const emojiNames = [...new Set(emojiTokens.map((t) => t.name))];
            const emojis = await db.query.emoji.findMany({
              where: (e, { and: a, eq: equals, inArray }) =>
                a(equals(e.isActive, true), inArray(e.name, emojiNames)),
            });

            const emojiMap = new Map(emojis.map((e) => [e.name, e]));
            for (const token of emojiTokens) {
              const emojiRecord = emojiMap.get(token.name);
              if (!emojiRecord) {
                continue;
              }
              if (
                !userMeetsTierLevel(
                  userCtx,
                  emojiRecord.requiredTier as PatronTier
                )
              ) {
                logger?.warn(
                  `User ${session.user.id} lacks tier for emoji "${token.name}"`
                );
                throw errors.FORBIDDEN();
              }
            }
          }

          if (stickerTokens.length > 0) {
            const stickerNames = [...new Set(stickerTokens.map((t) => t.name))];
            const stickers = await db.query.sticker.findMany({
              where: (s, { and: a, eq: equals, inArray }) =>
                a(equals(s.isActive, true), inArray(s.name, stickerNames)),
            });

            for (const stickerRecord of stickers) {
              if (
                !userMeetsTierLevel(
                  userCtx,
                  stickerRecord.requiredTier as PatronTier
                )
              ) {
                logger?.warn(
                  `User ${session.user.id} lacks tier for sticker "${stickerRecord.name}"`
                );
                throw errors.FORBIDDEN();
              }
            }
          }
        }

        await db.insert(comment).values({
          authorId: session.user.id,
          content: input.content,
          engagementPromptId: selectedEngagementPrompt?.id ?? null,
          engagementPromptSource: selectedEngagementPrompt?.source ?? null,
          engagementPromptText: selectedEngagementPrompt?.text ?? null,
          parentId: input.parentId ?? null,
          postId: input.postId,
        });
        logger?.info(
          `Comment successfully created by user ${session.user.id} on post ${input.postId}`
        );
      }
    ),

  setCommentPinned: permissionProcedure({ comments: ["pin"] })
    .input(z.object({ commentId: z.string(), pinned: z.boolean() }))
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);
      logger?.info(
        `${input.pinned ? "Pinning" : "Unpinning"} comment ${input.commentId}`
      );

      const existingComment = await db.query.comment.findFirst({
        columns: {
          id: true,
          parentId: true,
          pinnedAt: true,
          postId: true,
        },
        where: eq(comment.id, input.commentId),
      });

      if (!existingComment) {
        throw errors.NOT_FOUND();
      }

      if (existingComment.postId === null) {
        throw errors.BAD_REQUEST({
          message: "El comentario no esta asociado a ningun post.",
        });
      }

      if (existingComment.parentId !== null) {
        throw errors.BAD_REQUEST({
          message: "Solo se pueden fijar comentarios principales.",
        });
      }

      if (input.pinned && existingComment.pinnedAt === null) {
        const pinnedCommentCount = await db
          .select({
            count: sql<number>`COUNT(*)::integer`,
          })
          .from(comment)
          .where(
            and(
              eq(comment.postId, existingComment.postId),
              not(isNull(comment.pinnedAt))
            )
          );

        if ((pinnedCommentCount[0]?.count ?? 0) >= MAX_PINNED_ITEMS_PER_POST) {
          throw errors.BAD_REQUEST({
            message: `No se pueden fijar mas de ${MAX_PINNED_ITEMS_PER_POST} comentarios por post.`,
          });
        }
      }

      await db
        .update(comment)
        .set({
          pinnedAt: input.pinned ? new Date() : null,
        })
        .where(eq(comment.id, input.commentId));

      logger?.debug(
        `Comment ${input.commentId} ${input.pinned ? "pinned" : "unpinned"}`
      );
      return { success: true };
    }),

  deleteComment: permissionProcedure({ comments: ["delete"] })
    .input(z.object({ commentId: z.string() }))
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);
      logger?.info(`Deleting comment ${input.commentId}`);

      const existingComment = await db.query.comment.findFirst({
        columns: {
          id: true,
        },
        where: eq(comment.id, input.commentId),
      });

      if (!existingComment) {
        throw errors.NOT_FOUND();
      }

      await db.delete(comment).where(eq(comment.id, input.commentId));

      logger?.debug(`Comment ${input.commentId} deleted`);
      return { success: true };
    }),

  deleteOwnComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .handler(
      async ({ context: { db, session, ...context }, input, errors }) => {
        const logger = getLogger(context);
        logger?.info(
          `User ${session.user.id} deleting own comment ${input.commentId}`
        );

        const existingComment = await db.query.comment.findFirst({
          columns: {
            authorId: true,
            id: true,
          },
          where: eq(comment.id, input.commentId),
        });

        if (!existingComment) {
          throw errors.NOT_FOUND();
        }

        if (existingComment.authorId !== session.user.id) {
          throw errors.FORBIDDEN();
        }

        await db
          .delete(comment)
          .where(
            and(
              eq(comment.id, input.commentId),
              eq(comment.authorId, session.user.id)
            )
          );

        logger?.debug(`Own comment ${input.commentId} deleted`);
        return { success: true };
      }
    ),

  toggleCommentLike: protectedProcedure
    .input(z.object({ commentId: z.string(), liked: z.boolean() }))
    .handler(
      async ({ context: { db, session, ...context }, input, errors }) => {
        const logger = getLogger(context);
        logger?.info(
          `User ${session.user.id} toggling comment like ${input.commentId} to ${input.liked}`
        );

        const existingComment = await db.query.comment.findFirst({
          columns: {
            id: true,
          },
          where: eq(comment.id, input.commentId),
        });

        if (!existingComment) {
          throw errors.NOT_FOUND();
        }

        const toggleLikeQuery = input.liked
          ? db
              .insert(commentLikes)
              .values({
                commentId: input.commentId,
                userId: session.user.id,
              })
              .onConflictDoNothing()
          : db
              .delete(commentLikes)
              .where(
                and(
                  eq(commentLikes.commentId, input.commentId),
                  eq(commentLikes.userId, session.user.id)
                )
              );

        await toggleLikeQuery;

        return { success: true };
      }
    ),

  getComments: publicProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching comments for post: ${input.postId}`);
      const targetPost = await db.query.post.findFirst({
        columns: {
          earlyAccessEnabled: true,
          earlyAccessStartedAt: true,
          type: true,
          vip12EarlyAccessHours: true,
          vip8EarlyAccessHours: true,
        },
        where: eq(post.id, input.postId),
      });

      if (!targetPost) {
        throw errors.NOT_FOUND();
      }

      const viewerTier = await getViewerPatronTier(db, context.session);
      const earlyAccess = getPostEarlyAccessView(targetPost, {
        role: context.session?.user.role,
        tier: viewerTier,
      });

      if (earlyAccess.isActive) {
        logger?.warn(
          `Comments blocked for post ${input.postId} because early access is active`
        );
        throw errors.FORBIDDEN();
      }

      const comments = await db.query.comment.findMany({
        orderBy: (c, { desc: descSql }) => [
          sql`${c.pinnedAt} DESC NULLS LAST`,
          descSql(c.createdAt),
        ],
        where: (c, { eq: equals }) => equals(c.postId, input.postId),
      });

      const commentIds = comments.map((item) => item.id);
      const commentLikeRows =
        commentIds.length > 0
          ? await db
              .select({
                commentId: commentLikes.commentId,
                likedByViewer: context.session?.user
                  ? sql<boolean>`BOOL_OR(${commentLikes.userId} = ${context.session.user.id})`
                  : sql<boolean>`false`,
                likeCount: sql<number>`COUNT(*)::integer`,
              })
              .from(commentLikes)
              .where(
                sql`${commentLikes.commentId} IN (${sql.join(
                  commentIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
              .groupBy(commentLikes.commentId)
          : [];

      const commentLikeMap = new Map(
        commentLikeRows.map((row) => [row.commentId, row])
      );
      const commentsWithLikes = comments.map((item) => {
        const likeStats = commentLikeMap.get(item.id);

        return {
          ...item,
          likedByViewer: likeStats?.likedByViewer ?? false,
          likeCount: likeStats?.likeCount ?? 0,
        };
      });

      const authorIds = [
        ...new Set(
          commentsWithLikes
            .map((c) => c.authorId)
            .filter((id): id is string => id !== null)
        ),
      ];

      const authors = await buildProfileSummaries(db, authorIds);

      logger?.debug(
        `Retrieved ${commentsWithLikes.length} comments for post ${input.postId} with ${authors.length} unique authors`
      );
      return { authors, comments: commentsWithLikes };
    }),

  getRelated: publicProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
    .input(z.object({ postId: z.string(), type: z.enum(["post", "comic"]) }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching related posts for: ${input.postId}`);

      const cacheKey = `rec:${input.postId}`;

      try {
        const redis = await getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger?.debug(`Cache hit for related posts: ${input.postId}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        logger?.warn("Redis cache read failed for related posts");
        logger?.warn(error);
      }

      const currentTerms = db
        .select({ termId: termPostRelation.termId })
        .from(termPostRelation)
        .where(eq(termPostRelation.postId, input.postId));

      const weightCase = sql`CASE ${term.taxonomy}
        WHEN 'tag' THEN 3
        WHEN 'engine' THEN 2
        WHEN 'graphics' THEN 2
        WHEN 'censorship' THEN 2
        WHEN 'status' THEN 2
        WHEN 'language' THEN 1
        WHEN 'platform' THEN 1
        ELSE 1
      END`;

      const termWeightSubquery = db
        .select({
          postId: termPostRelation.postId,
          weightedCount: sql<number>`SUM(${weightCase})`.as("weighted_count"),
        })
        .from(termPostRelation)
        .innerJoin(term, eq(term.id, termPostRelation.termId))
        .where(sql`${termPostRelation.termId} IN (${currentTerms})`)
        .groupBy(termPostRelation.postId)
        .as("term_weight");

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const ratingsAgg = db
        .select({
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          postId: postRating.postId,
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

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

      const results = await db
        .select({
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          score: sql<number>`
            COALESCE(${termWeightSubquery.weightedCount}, 0) * 10
            + LN(COALESCE(${post.views}, 0) + 1)
            + COALESCE(${ratingsAgg.averageRating}, 0) * 0.5
            + COALESCE(${likesAgg.count}, 0) * 0.2
            + COALESCE(${favoritesAgg.count}, 0) * 0.3
          `.as("score"),
          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: string;
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,
          title: post.title,
          type: post.type,
          views: post.views,
        })
        .from(post)
        .leftJoin(termWeightSubquery, eq(termWeightSubquery.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .where(
          and(
            eq(post.status, "publish"),
            eq(post.type, input.type),
            ne(post.id, input.postId),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(sql`score DESC`)
        .limit(RECOMMENDATION_LIMIT);

      const data = results.map(({ score: _, ...rest }) => rest);

      if (data.length > 0) {
        try {
          const redis = await getRedis();
          await redis.set(cacheKey, JSON.stringify(data), { EX: 720 });
          logger?.debug(`Cached related posts for: ${input.postId}`);
        } catch (error) {
          logger?.warn("Redis cache write failed for related posts");
          logger?.warn(error);
        }
      }

      logger?.info(`Found ${data.length} related posts for: ${input.postId}`);
      return data;
    }),

  admin,
};
