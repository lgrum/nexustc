import { getLogger } from "@orpc/experimental-pino";
import { and, desc, eq, isNull, not, sql } from "@repo/db";
import { post, postRating, postRatingLikes } from "@repo/db/schema/app";
import { MAX_PINNED_ITEMS_PER_POST } from "@repo/shared/constants";
import { ratingCreateSchema, ratingUpdateSchema } from "@repo/shared/schemas";
import z from "zod";

import type { Context } from "../context";
import {
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { buildProfileSummaries } from "../services/profile";
import {
  getPostEarlyAccessView,
  getViewerPatronTier,
  publicCatalogVisibilityCondition,
} from "../utils/early-access";
import { assertContentHasNoForbiddenTerms } from "../utils/forbidden-content";
import { createPostCoverImageObjectKeySelect } from "../utils/post-media";

async function assertRatingsAreOpen(params: {
  db: Context["db"];
  errors: {
    FORBIDDEN: () => Error;
    NOT_FOUND: () => Error;
  };
  postId: string;
  session: Context["session"];
}) {
  const targetPost = await params.db.query.post.findFirst({
    columns: {
      earlyAccessEnabled: true,
      earlyAccessStartedAt: true,
      type: true,
      vip12EarlyAccessHours: true,
      vip8EarlyAccessHours: true,
    },
    where: eq(post.id, params.postId),
  });

  if (!targetPost) {
    throw params.errors.NOT_FOUND();
  }

  const viewerTier = await getViewerPatronTier(params.db, params.session);
  const earlyAccess = getPostEarlyAccessView(targetPost, {
    role: params.session?.user.role,
    tier: viewerTier,
  });

  if (earlyAccess.isActive) {
    throw params.errors.FORBIDDEN();
  }
}

export default {
  // Create or update a rating (upsert)
  create: protectedProcedure
    .input(ratingCreateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      const review = input.review ?? "";
      const reviewWasRemoved = review.trim().length === 0;
      logger?.info(
        `User ${session.user.id} creating/updating rating for post ${input.postId}: ${input.rating} stars`
      );
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });
      await assertContentHasNoForbiddenTerms({
        content: review,
        db,
        errors,
      });

      await db
        .insert(postRating)
        .values({
          postId: input.postId,
          rating: input.rating,
          review,
          userId: session.user.id,
        })
        .onConflictDoUpdate({
          set: {
            ...(reviewWasRemoved ? { pinnedAt: null } : {}),
            rating: input.rating,
            review,
            updatedAt: new Date(),
          },
          target: [postRating.userId, postRating.postId],
        });

      logger?.debug(
        `Rating upserted for user ${session.user.id} on post ${input.postId}`
      );
      return { success: true };
    }),

  // Update own rating
  update: protectedProcedure
    .input(ratingUpdateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      const review = input.review ?? "";
      const reviewWasRemoved = review.trim().length === 0;
      logger?.info(
        `User ${session.user.id} updating rating for post ${input.postId}: ${input.rating} stars`
      );
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });
      await assertContentHasNoForbiddenTerms({
        content: review,
        db,
        errors,
      });

      await db
        .update(postRating)
        .set({
          ...(reviewWasRemoved ? { pinnedAt: null } : {}),
          rating: input.rating,
          review,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, session.user.id)
          )
        );

      logger?.debug(
        `Rating updated for user ${session.user.id} on post ${input.postId}`
      );
      return { success: true };
    }),

  // Delete own rating
  delete: protectedProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `User ${session.user.id} deleting rating for post ${input.postId}`
      );
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });

      await db
        .delete(postRating)
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, session.user.id)
          )
        );

      logger?.debug(
        `Rating deleted for user ${session.user.id} on post ${input.postId}`
      );
      return { success: true };
    }),

  // Admin delete any rating
  deleteAny: permissionProcedure({ ratings: ["delete"] })
    .input(z.object({ postId: z.string(), userId: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Admin deleting rating: user ${input.userId} on post ${input.postId}`
      );

      await db
        .delete(postRating)
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, input.userId)
          )
        );

      logger?.debug(
        `Rating deleted by admin for user ${input.userId} on post ${input.postId}`
      );
      return { success: true };
    }),

  toggleReviewLike: protectedProcedure
    .input(
      z.object({
        liked: z.boolean(),
        postId: z.string(),
        ratingUserId: z.string(),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `User ${session.user.id} toggling review like for ${input.ratingUserId} on post ${input.postId} to ${input.liked}`
      );

      const existingRating = await db.query.postRating.findFirst({
        columns: {
          postId: true,
          userId: true,
        },
        where: and(
          eq(postRating.postId, input.postId),
          eq(postRating.userId, input.ratingUserId)
        ),
      });

      if (!existingRating) {
        throw errors.NOT_FOUND();
      }

      const toggleLikeQuery = input.liked
        ? db
            .insert(postRatingLikes)
            .values({
              postId: input.postId,
              ratingUserId: input.ratingUserId,
              userId: session.user.id,
            })
            .onConflictDoNothing()
        : db
            .delete(postRatingLikes)
            .where(
              and(
                eq(postRatingLikes.postId, input.postId),
                eq(postRatingLikes.ratingUserId, input.ratingUserId),
                eq(postRatingLikes.userId, session.user.id)
              )
            );

      await toggleLikeQuery;

      return { success: true };
    }),

  setPinned: permissionProcedure({ ratings: ["pin"] })
    .input(
      z.object({ pinned: z.boolean(), postId: z.string(), userId: z.string() })
    )
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `${input.pinned ? "Pinning" : "Unpinning"} rating for user ${input.userId} on post ${input.postId}`
      );

      const existingRating = await db.query.postRating.findFirst({
        columns: {
          pinnedAt: true,
          postId: true,
          review: true,
          userId: true,
        },
        where: and(
          eq(postRating.postId, input.postId),
          eq(postRating.userId, input.userId)
        ),
      });

      if (!existingRating) {
        throw errors.NOT_FOUND();
      }

      if (existingRating.review.trim().length === 0) {
        throw errors.BAD_REQUEST({
          message: "Solo se pueden fijar resenas con texto.",
        });
      }

      if (input.pinned && existingRating.pinnedAt === null) {
        const pinnedRatingCount = await db
          .select({
            count: sql<number>`COUNT(*)::integer`,
          })
          .from(postRating)
          .where(
            and(
              eq(postRating.postId, input.postId),
              not(isNull(postRating.pinnedAt))
            )
          );

        if ((pinnedRatingCount[0]?.count ?? 0) >= MAX_PINNED_ITEMS_PER_POST) {
          throw errors.BAD_REQUEST({
            message: `No se pueden fijar mas de ${MAX_PINNED_ITEMS_PER_POST} resenas por post.`,
          });
        }
      }

      await db
        .update(postRating)
        .set({
          pinnedAt: input.pinned ? new Date() : null,
        })
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, input.userId)
          )
        );

      logger?.debug(
        `Rating for user ${input.userId} on post ${input.postId} ${input.pinned ? "pinned" : "unpinned"}`
      );
      return { success: true };
    }),

  // Get all ratings for a post
  getByPostId: publicProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching all ratings for post: ${input.postId}`);
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });

      const ratings = await db
        .select({
          createdAt: postRating.createdAt,
          pinnedAt: postRating.pinnedAt,
          postId: postRating.postId,
          rating: postRating.rating,
          review: postRating.review,
          updatedAt: postRating.updatedAt,
          userId: postRating.userId,
        })
        .from(postRating)
        .where(eq(postRating.postId, input.postId))
        .orderBy(
          sql`${postRating.pinnedAt} DESC NULLS LAST`,
          desc(postRating.createdAt)
        );

      const ratingLikeRows =
        ratings.length > 0
          ? await db
              .select({
                likedByViewer: session?.user
                  ? sql<boolean>`BOOL_OR(${postRatingLikes.userId} = ${session.user.id})`
                  : sql<boolean>`false`,
                likeCount: sql<number>`COUNT(*)::integer`,
                postId: postRatingLikes.postId,
                ratingUserId: postRatingLikes.ratingUserId,
              })
              .from(postRatingLikes)
              .where(eq(postRatingLikes.postId, input.postId))
              .groupBy(postRatingLikes.postId, postRatingLikes.ratingUserId)
          : [];

      const ratingLikeMap = new Map(
        ratingLikeRows.map((row) => [`${row.postId}:${row.ratingUserId}`, row])
      );
      const ratingsWithLikes = ratings.map((rating) => {
        const likeStats = ratingLikeMap.get(
          `${rating.postId}:${rating.userId}`
        );

        return {
          ...rating,
          likedByViewer: likeStats?.likedByViewer ?? false,
          likeCount: likeStats?.likeCount ?? 0,
        };
      });

      const userIds = [...new Set(ratingsWithLikes.map((r) => r.userId))];

      const authors = await buildProfileSummaries(db, userIds);

      logger?.debug(
        `Retrieved ${ratingsWithLikes.length} ratings with ${authors.length} unique authors for post ${input.postId}`
      );
      return { authors, ratings: ratingsWithLikes };
    }),

  // Get recent ratings across all posts (paginated)
  getRecent: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching recent ratings with limit: ${input.limit}, offset: ${input.offset}`
      );

      const ratings = await db
        .select({
          createdAt: postRating.createdAt,
          postId: postRating.postId,
          rating: postRating.rating,
          review: postRating.review,
          updatedAt: postRating.updatedAt,
          userId: postRating.userId,
        })
        .from(postRating)
        .innerJoin(post, eq(post.id, postRating.postId))
        .where(
          and(eq(post.status, "publish"), publicCatalogVisibilityCondition())
        )
        .orderBy(desc(postRating.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const userIds = [...new Set(ratings.map((r) => r.userId))];
      const postIds = [...new Set(ratings.map((r) => r.postId))];

      const authors = await buildProfileSummaries(db, userIds);

      const posts =
        postIds.length > 0
          ? await db
              .select({
                coverImageObjectKey: createPostCoverImageObjectKeySelect(),
                id: post.id,
                imageObjectKeys: post.imageObjectKeys,
                title: post.title,
                type: post.type,
              })
              .from(post)
              .where(
                sql`${post.id} IN (${sql.join(
                  postIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
          : [];

      logger?.debug(
        `Retrieved ${ratings.length} recent ratings with ${authors.length} authors and ${posts.length} posts`
      );
      return { authors, posts, ratings };
    }),

  getByUserId: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(30).default(10),
        offset: z.number().min(0).default(0),
        userId: z.string(),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching ratings for user ${input.userId} with limit: ${input.limit}, offset: ${input.offset}`
      );

      const ratings = await db
        .select({
          createdAt: postRating.createdAt,
          postId: postRating.postId,
          rating: postRating.rating,
          review: postRating.review,
          updatedAt: postRating.updatedAt,
        })
        .from(postRating)
        .innerJoin(post, eq(post.id, postRating.postId))
        .where(
          and(
            eq(postRating.userId, input.userId),
            eq(post.status, "publish"),
            publicCatalogVisibilityCondition()
          )
        )
        .orderBy(desc(postRating.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const postIds = [...new Set(ratings.map((r) => r.postId))];

      const posts =
        postIds.length > 0
          ? await db
              .select({
                coverImageObjectKey: createPostCoverImageObjectKeySelect(),
                id: post.id,
                imageObjectKeys: post.imageObjectKeys,
                title: post.title,
                type: post.type,
              })
              .from(post)
              .where(
                sql`${post.id} IN (${sql.join(
                  postIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
          : [];

      logger?.debug(
        `Retrieved ${ratings.length} ratings with ${posts.length} posts for user ${input.userId}`
      );
      return { posts, ratings };
    }),

  // Get current user's rating for a post
  getUserRating: publicProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);

      if (!session?.user) {
        logger?.debug("User not authenticated, cannot fetch user rating");
        return null;
      }
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });

      logger?.info(
        `Fetching user ${session.user.id} rating for post ${input.postId}`
      );

      const result = await db
        .select({
          createdAt: postRating.createdAt,
          postId: postRating.postId,
          rating: postRating.rating,
          review: postRating.review,
          updatedAt: postRating.updatedAt,
          userId: postRating.userId,
        })
        .from(postRating)
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, session.user.id)
          )
        )
        .limit(1);

      if (result.length > 0) {
        logger?.debug(
          `Found rating for user ${session.user.id} on post ${input.postId}`
        );
      } else {
        logger?.debug(
          `No rating found for user ${session.user.id} on post ${input.postId}`
        );
      }

      return result[0] ?? null;
    }),

  // Get rating stats for a post (average and count)
  getStats: publicProcedure
    .input(z.object({ postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching rating stats for post: ${input.postId}`);
      await assertRatingsAreOpen({
        db,
        errors,
        postId: input.postId,
        session,
      });

      const result = await db
        .select({
          averageRating: sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`,
          ratingCount: sql<number>`COUNT(*)::integer`,
        })
        .from(postRating)
        .where(eq(postRating.postId, input.postId));

      const averageRating = result[0]?.averageRating ?? 0;
      const ratingCount = result[0]?.ratingCount ?? 0;

      logger?.debug(
        `Post ${input.postId} stats: avg=${averageRating.toFixed(2)}, count=${ratingCount}`
      );
      return {
        averageRating,
        ratingCount,
      };
    }),
};
