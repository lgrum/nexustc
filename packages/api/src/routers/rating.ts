import { getLogger } from "@orpc/experimental-pino";
import { and, desc, eq, inArray, isNull, lt, not, or, sql } from "@repo/db";
import { post, postRating, postRatingLikes, user } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { MAX_PINNED_ITEMS_PER_POST } from "@repo/shared/constants";
import { ratingCreateSchema, ratingUpdateSchema } from "@repo/shared/schemas";
import z from "zod";

import type { Context } from "../context";
import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import {
  deleteReviewWithRewards,
  getReviewDeletionWarning,
  lockContributionParticipantsInTransaction,
  reconcileEditedReviewRewardsInTransaction,
  reconcileRemovedContributionLikeInTransaction,
  settleReviewMilestonesInTransaction,
} from "../services/contribution-rewards";
import {
  buildProfileSummaries,
  canReadPublicProfileActivity,
} from "../services/profile";
import { notifyXpSettlementInTransaction } from "../services/progression";
import {
  canViewPost,
  getPostEarlyAccessView,
  getViewerPatronTier,
  publicCatalogVisibilityCondition,
} from "../utils/early-access";
import { assertContentHasNoForbiddenTerms } from "../utils/forbidden-content";
import { buildIntegrityCorrelationEvidence } from "../utils/integrity-evidence";
import { createPostCoverImageObjectKeySelect } from "../utils/post-media";
import { assertTextIsNotSpammy } from "../utils/spam-detection";
import { userIsNotActivelyBanned } from "../utils/user-ban";

const ratingsByUserPaginationSchema = z.object({
  cursor: z
    .object({
      createdAt: z.string().datetime(),
      postId: z.string(),
    })
    .optional(),
  limit: z.number().min(1).max(30).default(10),
});

type ReviewMilestoneSettlement = Awaited<
  ReturnType<typeof settleReviewMilestonesInTransaction>
>["settlements"][number];

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

async function getRatingsByUser({
  db,
  cursor,
  limit,
  publicOnly,
  userId,
}: {
  cursor?: { createdAt: string; postId: string };
  db: Context["db"];
  limit: number;
  publicOnly: boolean;
  userId: string;
}) {
  const visibilityCondition = publicOnly
    ? and(
        eq(postRating.userId, userId),
        eq(post.status, "publish"),
        publicCatalogVisibilityCondition(),
        userIsNotActivelyBanned()
      )
    : eq(postRating.userId, userId);
  const cursorCondition = cursor
    ? or(
        lt(postRating.createdAt, new Date(cursor.createdAt)),
        and(
          eq(postRating.createdAt, new Date(cursor.createdAt)),
          lt(postRating.postId, cursor.postId)
        )
      )
    : undefined;
  const ratings = await db
    .select({
      createdAt: postRating.createdAt,
      postId: postRating.postId,
      rating: postRating.rating,
      review: postRating.review,
      updatedAt: postRating.updatedAt,
    })
    .from(postRating)
    .innerJoin(user, eq(user.id, postRating.userId))
    .innerJoin(post, eq(post.id, postRating.postId))
    .where(and(visibilityCondition, cursorCondition))
    .orderBy(desc(postRating.createdAt), desc(postRating.postId))
    .limit(limit);

  const postIds = [...new Set(ratings.map((rating) => rating.postId))];
  const posts =
    postIds.length > 0
      ? await db
          .select({
            id: post.id,
            slug: post.slug,
            title: post.title,
            type: post.type,
          })
          .from(post)
          .where(inArray(post.id, postIds))
      : [];

  const lastRating = ratings.at(-1);
  return {
    nextCursor:
      ratings.length === limit && lastRating
        ? {
            createdAt: lastRating.createdAt.toISOString(),
            postId: lastRating.postId,
          }
        : null,
    posts,
    ratings,
  };
}

export default {
  // Create or update a rating (upsert)
  create: protectedProcedure
    .use(
      fixedWindowRatelimitMiddleware({
        limit: 5,
        windowSeconds: 60 * 5,
      })
    )
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
      assertTextIsNotSpammy(review, errors, session.user.role);

      await db.transaction(async (tx) => {
        await lockContributionParticipantsInTransaction(tx, [session.user.id]);
        const [savedReview] = await tx
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
          })
          .returning({
            createdAt: postRating.createdAt,
            id: postRating.id,
            postId: postRating.postId,
            review: postRating.review,
            userId: postRating.userId,
          });
        if (savedReview) {
          const result = await reconcileEditedReviewRewardsInTransaction(
            tx,
            savedReview
          );
          for (const settlement of result.settlements) {
            await notifyXpSettlementInTransaction(
              tx,
              session.user.id,
              settlement
            );
          }
        }
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
      assertTextIsNotSpammy(review, errors, session.user.role);

      await db.transaction(async (tx) => {
        await lockContributionParticipantsInTransaction(tx, [session.user.id]);
        const [savedReview] = await tx
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
          )
          .returning({
            createdAt: postRating.createdAt,
            id: postRating.id,
            postId: postRating.postId,
            review: postRating.review,
            userId: postRating.userId,
          });
        if (savedReview) {
          const result = await reconcileEditedReviewRewardsInTransaction(
            tx,
            savedReview
          );
          for (const settlement of result.settlements) {
            await notifyXpSettlementInTransaction(
              tx,
              session.user.id,
              settlement
            );
          }
        }
      });

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

      await deleteReviewWithRewards(db, {
        postId: input.postId,
        reason: "voluntary",
        userId: session.user.id,
      });

      logger?.debug(
        `Rating deleted for user ${session.user.id} on post ${input.postId}`
      );
      return { success: true };
    }),

  // Admin delete any rating
  deleteAny: permissionProcedure({ ratings: ["delete"] })
    .input(z.object({ postId: z.string(), userId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Admin deleting rating: user ${input.userId} on post ${input.postId}`
      );

      await deleteReviewWithRewards(db, {
        actorUserId: session.user.id,
        postId: input.postId,
        reason: "guideline_abuse",
        userId: input.userId,
      });

      logger?.debug(
        `Rating deleted by admin for user ${input.userId} on post ${input.postId}`
      );
      return { success: true };
    }),

  toggleReviewLike: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 30, windowSeconds: 60 }))
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
      const now = new Date();
      const viewerTier = input.liked
        ? await getViewerPatronTier(db, session)
        : "none";

      const result: {
        authorId: string;
        settlements: ReviewMilestoneSettlement[];
      } = await db.transaction(async (tx) => {
        const [existingRating] = await tx
          .select({
            earlyAccessEnabled: post.earlyAccessEnabled,
            earlyAccessStartedAt: post.earlyAccessStartedAt,
            id: postRating.id,
            releasedAt: post.releasedAt,
            status: post.status,
            type: post.type,
            vip12EarlyAccessHours: post.vip12EarlyAccessHours,
            vip8EarlyAccessHours: post.vip8EarlyAccessHours,
          })
          .from(postRating)
          .innerJoin(user, eq(user.id, postRating.userId))
          .innerJoin(post, eq(post.id, postRating.postId))
          .where(
            and(
              eq(postRating.postId, input.postId),
              eq(postRating.userId, input.ratingUserId),
              userIsNotActivelyBanned()
            )
          )
          .limit(1);
        if (!existingRating) {
          throw errors.NOT_FOUND();
        }
        if (
          input.liked &&
          !canViewPost(
            existingRating,
            { role: session.user.role, tier: viewerTier },
            now
          )
        ) {
          throw errors.NOT_FOUND();
        }
        await lockContributionParticipantsInTransaction(tx, [
          session.user.id,
          input.ratingUserId,
        ]);
        if (!input.liked) {
          const deleted = await tx
            .delete(postRatingLikes)
            .where(
              and(
                eq(postRatingLikes.ratingId, existingRating.id),
                eq(postRatingLikes.userId, session.user.id)
              )
            )
            .returning({ ratingId: postRatingLikes.ratingId });
          if (deleted.length === 0) {
            return { authorId: input.ratingUserId, settlements: [] };
          }
          const reconciliation =
            await reconcileRemovedContributionLikeInTransaction(tx, {
              actorUserId: session.user.id,
              entityId: existingRating.id,
              kind: "review",
              now,
            });
          for (const settlement of reconciliation.settlements) {
            await notifyXpSettlementInTransaction(
              tx,
              input.ratingUserId,
              settlement
            );
          }
          return {
            authorId: input.ratingUserId,
            settlements: reconciliation.settlements,
          };
        }
        const inserted = await tx
          .insert(postRatingLikes)
          .values({
            createdAt: now,
            emailVerifiedAtCreation: session.user.emailVerified,
            ratingId: existingRating.id,
            userId: session.user.id,
            xpAccrualEnabledAtCreation: env.XP_ACCRUAL_ENABLED,
          })
          .onConflictDoNothing()
          .returning({ ratingId: postRatingLikes.ratingId });
        if (inserted.length === 0) {
          return { authorId: input.ratingUserId, settlements: [] };
        }
        const settlement = await settleReviewMilestonesInTransaction(
          tx,
          existingRating.id,
          now,
          session.user.id,
          buildIntegrityCorrelationEvidence(ctx.headers)
        );
        for (const xpSettlement of settlement.settlements) {
          await notifyXpSettlementInTransaction(
            tx,
            input.ratingUserId,
            xpSettlement
          );
        }
        return {
          authorId: input.ratingUserId,
          settlements: settlement.settlements,
        };
      });
      return {
        profileUserId: result.authorId,
        publicProfileChanged: result.settlements.some(
          (settlement) =>
            !settlement.replayed &&
            settlement.level !== settlement.previousLevel
        ),
        success: true,
      };
    }),

  getDeletionWarning: protectedProcedure
    .input(z.object({ postId: z.string() }))
    .handler(({ context: { db, session }, input }) =>
      getReviewDeletionWarning(db, {
        postId: input.postId,
        userId: session.user.id,
      })
    ),

  setPinned: permissionProcedure({ ratings: ["pin"] })
    .input(
      z.object({ pinned: z.boolean(), postId: z.string(), userId: z.string() })
    )
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `${input.pinned ? "Pinning" : "Unpinning"} rating for user ${input.userId} on post ${input.postId}`
      );

      const [existingRating] = await db
        .select({
          pinnedAt: postRating.pinnedAt,
          postId: postRating.postId,
          review: postRating.review,
          userId: postRating.userId,
        })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, input.userId),
            userIsNotActivelyBanned()
          )
        )
        .limit(1);

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
          .innerJoin(user, eq(user.id, postRating.userId))
          .where(
            and(
              eq(postRating.postId, input.postId),
              not(isNull(postRating.pinnedAt)),
              userIsNotActivelyBanned()
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
          id: postRating.id,
          pinnedAt: postRating.pinnedAt,
          postId: postRating.postId,
          rating: postRating.rating,
          review: postRating.review,
          updatedAt: postRating.updatedAt,
          userId: postRating.userId,
        })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(
          and(eq(postRating.postId, input.postId), userIsNotActivelyBanned())
        )
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
                ratingId: postRatingLikes.ratingId,
              })
              .from(postRatingLikes)
              .innerJoin(user, eq(user.id, postRatingLikes.userId))
              .where(
                and(
                  inArray(
                    postRatingLikes.ratingId,
                    ratings.map((rating) => rating.id)
                  ),
                  userIsNotActivelyBanned()
                )
              )
              .groupBy(postRatingLikes.ratingId)
          : [];

      const ratingLikeMap = new Map(
        ratingLikeRows.map((row) => [row.ratingId, row])
      );
      const ratingsWithLikes = ratings.map((rating) => {
        const likeStats = ratingLikeMap.get(rating.id);

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
        .innerJoin(user, eq(user.id, postRating.userId))
        .innerJoin(post, eq(post.id, postRating.postId))
        .where(
          and(
            eq(post.status, "publish"),
            publicCatalogVisibilityCondition(),
            userIsNotActivelyBanned()
          )
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
                thumbnailImageCount: post.thumbnailImageCount,
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
    .input(ratingsByUserPaginationSchema.extend({ userId: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching ratings for user ${input.userId} with limit: ${input.limit}`
      );

      if (!(await canReadPublicProfileActivity(db, input.userId, "reviews"))) {
        return { nextCursor: null, posts: [], ratings: [] };
      }

      const result = await getRatingsByUser({
        db,
        cursor: input.cursor,
        limit: input.limit,
        publicOnly: true,
        userId: input.userId,
      });
      logger?.debug(
        `Retrieved ${result.ratings.length} ratings with ${result.posts.length} posts for user ${input.userId}`
      );
      return result;
    }),

  getMyReviews: protectedProcedure
    .input(ratingsByUserPaginationSchema)
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching private reviews for user ${session.user.id} with limit: ${input.limit}`
      );

      const result = await getRatingsByUser({
        db,
        cursor: input.cursor,
        limit: input.limit,
        publicOnly: false,
        userId: session.user.id,
      });
      logger?.debug(
        `Retrieved ${result.ratings.length} private reviews with ${result.posts.length} posts for user ${session.user.id}`
      );
      return result;
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
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, session.user.id),
            userIsNotActivelyBanned()
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
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(
          and(eq(postRating.postId, input.postId), userIsNotActivelyBanned())
        );

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
