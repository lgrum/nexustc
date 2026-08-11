import { and, eq } from "@repo/db";
import type { db as database } from "@repo/db";
import { postRating } from "@repo/db/schema/app";
import { ratingReviewSchema } from "@repo/shared/schemas";

import {
  lockContributionParticipantsInTransaction,
  reconcileEditedReviewRewardsInTransaction,
} from "./contribution-rewards";
import type { IntegrityCorrelationEvidence } from "./integrity-settlement";
import { applyStreakEvidenceInTransaction } from "./streak";

type Database = typeof database;
type RatingTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const savedReviewSelection = {
  createdAt: postRating.createdAt,
  id: postRating.id,
  postId: postRating.postId,
  review: postRating.review,
  userId: postRating.userId,
};

export async function saveRatingInTransaction(
  tx: RatingTransaction,
  input: {
    contentType: "comic" | "post";
    correlation?: IntegrityCorrelationEvidence;
    impersonated: boolean;
    insertIfMissing: boolean;
    now: Date;
    postId: string;
    rating: number;
    review: string;
    timezone?: string;
    userId: string;
  }
) {
  await lockContributionParticipantsInTransaction(tx, [input.userId]);
  const [inserted] = input.insertIfMissing
    ? await tx
        .insert(postRating)
        .values({
          postId: input.postId,
          rating: input.rating,
          review: input.review,
          userId: input.userId,
        })
        .onConflictDoNothing({
          target: [postRating.userId, postRating.postId],
        })
        .returning(savedReviewSelection)
    : [];
  let firstQualifyingReview = Boolean(
    inserted && ratingReviewSchema.safeParse(inserted.review).success
  );
  let savedReview = inserted;

  if (!savedReview) {
    const [existing] = await tx
      .select({ review: postRating.review })
      .from(postRating)
      .where(
        and(
          eq(postRating.postId, input.postId),
          eq(postRating.userId, input.userId)
        )
      )
      .for("update");
    if (!existing) {
      return;
    }

    [savedReview] = await tx
      .update(postRating)
      .set({
        ...(input.review.length === 0 ? { pinnedAt: null } : {}),
        rating: input.rating,
        review: input.review,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(postRating.postId, input.postId),
          eq(postRating.userId, input.userId)
        )
      )
      .returning(savedReviewSelection);
    firstQualifyingReview =
      !ratingReviewSchema.safeParse(existing.review).success &&
      ratingReviewSchema.safeParse(input.review).success;
  }

  if (!savedReview) {
    return;
  }
  const { settlements } = await reconcileEditedReviewRewardsInTransaction(
    tx,
    savedReview,
    input.now
  );
  let streak = null;
  if (firstQualifyingReview) {
    streak = await applyStreakEvidenceInTransaction(
      tx,
      {
        impersonated: input.impersonated,
        ...(input.correlation && {
          integrity: { correlation: input.correlation },
        }),
        kind: "contribution",
        source: { id: savedReview.id, kind: "review" },
        text: savedReview.review,
        timezone: input.timezone,
        userId: input.userId,
      },
      input.now
    );
  } else if (inserted) {
    streak = await applyStreakEvidenceInTransaction(
      tx,
      {
        actionKind: "rating",
        contentKey: `${input.contentType}:${input.postId}`,
        impersonated: input.impersonated,
        ...(input.correlation && {
          integrity: { correlation: input.correlation },
        }),
        kind: "discovery",
        timezone: input.timezone,
        userId: input.userId,
      },
      input.now
    );
  }
  return { settlements, streak };
}
