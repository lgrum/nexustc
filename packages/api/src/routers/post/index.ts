import { getLogger } from "@orpc/experimental-pino";
import { and, asc, desc, eq, getRedis, ne, sql } from "@repo/db";
import {
  comment,
  featuredPost,
  patron,
  post,
  postBookmark,
  postLikes,
  postRating,
  term,
  termPostRelation,
} from "@repo/db/schema/app";
import type { TAXONOMIES } from "@repo/shared/constants";
import {
  canAccessPremiumLinks,
  getRequiredTierLabel,
  type PatronTier,
  type PremiumLinksDescriptor,
  userMeetsTierLevel,
} from "@repo/shared/constants";
import { parseTokens, validateTokenLimit } from "@repo/shared/token-parser";
import z from "zod";
import {
  fixedWindowRatelimitMiddleware,
  protectedProcedure,
  publicProcedure,
} from "../../index";
import { resolveEngagementPrompts } from "../../utils/engagement-prompts";
import admin from "./admin";

const RECOMMENDATION_LIMIT = 5;

export default {
  // TODO: implement caching here, very heavily used endpoint
  getRecent: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(24).default(12) }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching recent posts with limit: ${input.limit}`);

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const ratingsAgg = db
        .select({
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          id: post.id,
          title: post.title,
          type: post.type,
          version: post.version,
          content: post.content,
          isWeekly: post.isWeekly,
          imageObjectKeys: post.imageObjectKeys,

          views: post.views,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,

          createdAt: post.createdAt,
        })
        .from(post)
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(and(eq(post.status, "publish"), eq(post.type, "post")))
        .orderBy(desc(post.createdAt))
        .limit(input.limit);

      logger?.debug(`Successfully fetched ${posts.length} recent posts`);
      return posts;
    }),

  // TODO: implement caching here as well
  getWeekly: publicProcedure.handler(
    async ({ context: { db, ...context } }) => {
      const logger = getLogger(context);
      logger?.info("Fetching weekly posts");

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const ratingsAgg = db
        .select({
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          id: post.id,
          title: post.title,
          version: post.version,
          type: post.type,
          content: post.content,
          isWeekly: post.isWeekly,
          imageObjectKeys: post.imageObjectKeys,
          views: post.views,

          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,

          createdAt: post.createdAt,
        })
        .from(post)
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(and(eq(post.status, "publish"), eq(post.isWeekly, true)))
        .orderBy(asc(post.title));

      logger?.debug(`Successfully fetched ${posts.length} weekly posts`);
      return posts;
    }
  ),

  // TODO: cache as well
  getFeatured: publicProcedure.handler(
    async ({ context: { db, ...context } }) => {
      const logger = getLogger(context);
      logger?.info("Fetching featured posts");

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const ratingsAgg = db
        .select({
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const posts = await db
        .select({
          id: post.id,
          title: post.title,
          type: post.type,
          version: post.version,
          content: post.content,
          imageObjectKeys: post.imageObjectKeys,
          adsLinks: post.adsLinks,
          changelog: post.changelog,
          creatorName: post.creatorName,
          creatorLink: post.creatorLink,
          views: post.views,
          position: featuredPost.position,
          order: featuredPost.order,

          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,

          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,

          createdAt: post.createdAt,
        })
        .from(featuredPost)
        .innerJoin(post, eq(post.id, featuredPost.postId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(eq(post.status, "publish"))
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
        type: z.enum(["post", "comic"]),
        query: z.string().optional(),
        termIds: z.array(z.string()).optional(),
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
          .default("views"),
      })
    )
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(
        `Searching posts with type: ${input.type}, query: ${input.query || "none"}, termIds: ${input.termIds?.length || 0}`
      );

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
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
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      // Build conditions array
      const conditions = [
        eq(post.status, "publish"),
        eq(post.type, input.type),
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
          id: post.id,
          title: post.title,
          type: post.type,
          version: post.version,
          content: post.content,
          isWeekly: post.isWeekly,
          imageObjectKeys: post.imageObjectKeys,
          adsLinks: post.adsLinks,
          changelog: post.changelog,
          creatorName: post.creatorName,
          creatorLink: post.creatorLink,

          views: post.views,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,

          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,

          createdAt: post.createdAt,
          similarity: sql<number>`similarity(${post.title}, ${input.query?.trim() || ""})`,
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
          case "newest":
            return sql`${similarityPrefix}${post.createdAt} DESC`;
          case "oldest":
            return sql`${similarityPrefix}${post.createdAt} ASC`;
          case "title_asc":
            return sql`${similarityPrefix}${post.title} ASC`;
          case "title_desc":
            return sql`${similarityPrefix}${post.title} DESC`;
          case "views":
            return sql`${similarityPrefix}${post.views} DESC`;
          case "rating_avg":
            return sql`${similarityPrefix}COALESCE(${ratingsAgg.averageRating}, 0) DESC`;
          case "rating_count":
            return sql`${similarityPrefix}COALESCE(${ratingsAgg.ratingCount}, 0) DESC`;
          case "likes":
            return sql`${similarityPrefix}COALESCE(${likesAgg.count}, 0) DESC`;
          default:
            return sql`${similarityPrefix}${post.views} DESC`;
        }
      };

      const posts = await baseQuery.orderBy(getOrderClause());

      // Remove similarity field from the final result
      const result = posts.map(({ similarity, ...postData }) => postData);
      logger?.debug(`Search returned ${result.length} posts`);

      return result;
    }),

  getRandom: publicProcedure
    .input(z.object({ type: z.enum(["post", "comic"]) }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching random ${input.type}`);

      const result = await db
        .select({ id: post.id })
        .from(post)
        .where(and(eq(post.status, "publish"), eq(post.type, input.type)))
        .orderBy(sql`RANDOM()`)
        .limit(1);

      if (!result.length) {
        logger?.warn(`No published ${input.type} found for random selection`);
        return null;
      }

      logger?.debug(`Random ${input.type} selected: ${result[0]?.id}`);
      return result[0];
    }),

  // TODO: could probably benefit from caching as well, especially on frequently accessed posts
  getPostById: publicProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 20, windowSeconds: 60 }))
    .input(z.string())
    .handler(async ({ context: { db, ...context }, input, errors }) => {
      const logger = getLogger(context);

      logger?.info(`Fetching post by ID: ${input}`);

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
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
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          id: post.id,
          title: post.title,
          type: post.type,
          version: post.version,
          content: post.content,
          isWeekly: post.isWeekly,
          imageObjectKeys: post.imageObjectKeys,
          adsLinks: post.adsLinks,
          changelog: post.changelog,
          creatorName: post.creatorName,
          creatorLink: post.creatorLink,
          createdAt: post.createdAt,
          views: post.views,
          rawPremiumLinks: post.premiumLinks,

          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,

          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
        })
        .from(post)
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

      try {
        await db
          .update(post)
          .set({ views: sql`${post.views} + 1` })
          .where(eq(post.id, input));

        logger?.info(`View count incremented for post ${input}`);
      } catch (error) {
        logger?.error(`Failed to increment view count for post ${input}`);
        logger?.error(error);
      }

      const { rawPremiumLinks, ...postData } = result[0]!;

      const manualOverrides = await db.query.postEngagementOverride.findMany({
        where: (table, { and: andWhere, eq: equals }) =>
          andWhere(equals(table.postId, input), equals(table.isActive, true)),
        columns: {
          id: true,
          text: true,
        },
        orderBy: (table, { asc: ascOrder }) => [
          ascOrder(table.sortOrder),
          ascOrder(table.createdAt),
        ],
      });

      const tagTermIds = postData.terms
        .filter((item) => item.taxonomy === "tag")
        .map((item) => item.id);

      const automaticQuestions =
        manualOverrides.length > 0
          ? []
          : await db.query.engagementQuestion.findMany({
              where: (
                table,
                {
                  and: andWhere,
                  eq: equals,
                  inArray: inArrayWhere,
                  or: orWhere,
                }
              ) => {
                if (tagTermIds.length === 0) {
                  return andWhere(
                    equals(table.isActive, true),
                    equals(table.isGlobal, true)
                  );
                }

                return andWhere(
                  equals(table.isActive, true),
                  orWhere(
                    equals(table.isGlobal, true),
                    inArrayWhere(table.tagTermId, tagTermIds)
                  )
                );
              },
              columns: {
                id: true,
                text: true,
                tagTermId: true,
              },
            });

      const engagementPrompts = resolveEngagementPrompts(
        manualOverrides,
        automaticQuestions
      );

      let premiumLinksAccess: PremiumLinksDescriptor;
      if (rawPremiumLinks) {
        const statusTerm = postData.terms.find((t) => t.taxonomy === "status");
        const statusName = statusTerm?.name;

        let tier: PatronTier = "none";
        if (context.session?.user) {
          const patronRecord = await db.query.patron.findFirst({
            where: eq(patron.userId, context.session.user.id),
            columns: { tier: true, isActivePatron: true },
          });
          if (patronRecord?.isActivePatron) {
            tier = patronRecord.tier;
          }
        }

        if (
          canAccessPremiumLinks(
            { role: context.session?.user.role, tier },
            statusName
          )
        ) {
          premiumLinksAccess = { status: "granted", content: rawPremiumLinks };
        } else if (tier === "none") {
          premiumLinksAccess = { status: "denied_need_patron" };
        } else {
          premiumLinksAccess = {
            status: "denied_need_upgrade",
            requiredTierLabel: getRequiredTierLabel(tier, statusName),
          };
        }
      } else {
        premiumLinksAccess = { status: "no_premium_links" };
      }

      return { ...postData, premiumLinksAccess, engagementPrompts };
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
        postId: z.string(),
        liked: z.boolean(),
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
    .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
    .input(
      z.object({
        postId: z.string(),
        content: z.string().min(10).max(2048),
      })
    )
    .handler(
      async ({ context: { db, session, ...context }, input, errors }) => {
        const logger = getLogger(context);
        logger?.info(
          `User ${session.user.id} creating comment on post ${input.postId}`
        );

        const tokens = parseTokens(input.content);

        if (tokens.length > 0) {
          const limitCheck = validateTokenLimit(tokens);
          if (!limitCheck.valid) {
            throw errors.FORBIDDEN();
          }

          let userTier: PatronTier = "none";
          const patronRecord = await db.query.patron.findFirst({
            where: eq(patron.userId, session.user.id),
            columns: { tier: true, isActivePatron: true },
          });
          if (patronRecord?.isActivePatron) {
            userTier = patronRecord.tier;
          }

          const userCtx = { role: session.user.role, tier: userTier };

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
          postId: input.postId,
          authorId: session.user.id,
          content: input.content,
        });
        logger?.info(
          `Comment successfully created by user ${session.user.id} on post ${input.postId}`
        );
      }
    ),

  getComments: publicProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, ...context }, input }) => {
      const logger = getLogger(context);
      logger?.info(`Fetching comments for post: ${input.postId}`);

      const comments = await db.query.comment.findMany({
        orderBy: (c, { desc: descSql }) => [descSql(c.createdAt)],
        where: (c, { eq: equals }) => equals(c.postId, input.postId),
      });

      const authorIds = [
        ...new Set(
          comments
            .map((c) => c.authorId)
            .filter((id): id is string => id !== null)
        ),
      ];

      const authors = await db.query.user.findMany({
        where: (u, { inArray }) => inArray(u.id, authorIds),
        columns: {
          id: true,
          name: true,
          role: true,
          image: true,
        },
      });

      // getComments is a good heuristic that the user is actually scrolling though the post
      // so we take the opportunity to increment the view count here while not blocking the response
      await db
        .update(post)
        .set({ views: sql`${post.views} + 1` })
        .where(eq(post.id, input.postId));

      logger?.debug(
        `Retrieved ${comments.length} comments for post ${input.postId} with ${authors.length} unique authors`
      );
      logger?.info(`View count incremented for post ${input.postId}`);
      return { comments, authors };
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
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const ratingsAgg = db
        .select({
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
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
          id: post.id,
          title: post.title,
          type: post.type,
          imageObjectKeys: post.imageObjectKeys,
          views: post.views,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: string;
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,
          score: sql<number>`
            COALESCE(${termWeightSubquery.weightedCount}, 0) * 10
            + LN(COALESCE(${post.views}, 0) + 1)
            + COALESCE(${ratingsAgg.averageRating}, 0) * 0.5
            + COALESCE(${likesAgg.count}, 0) * 0.2
            + COALESCE(${favoritesAgg.count}, 0) * 0.3
          `.as("score"),
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
            ne(post.id, input.postId)
          )
        )
        .orderBy(sql`score DESC`)
        .limit(RECOMMENDATION_LIMIT);

      const data = results.map(({ score, ...rest }) => rest);

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
