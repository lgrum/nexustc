import { createHash } from "node:crypto";

import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  comment,
  commentLikes,
  postRating,
  postRatingLikes,
  user,
  xpEvent,
  xpLikeDisqualification,
  xpRewardBlock,
  xpRewardSubject,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  COMMENT_MILESTONES,
  REVIEW_MILESTONES,
  getReachedContributionMilestones,
  normalizeContributionText,
} from "@repo/shared/contribution-rewards";
import { ratingReviewSchema } from "@repo/shared/schemas";

import { findForbiddenContentMatch } from "../utils/forbidden-content";
import { detectSpammyText } from "../utils/spam-detection";
import { settleXpWithIntegrityInTransaction } from "./integrity-settlement";
import {
  cancelPendingXpEventsInTransaction,
  notifyXpSettlement,
  postXpEventInTransaction,
} from "./progression";
import {
  ensureProgressionActivationInTransaction,
  readProgressionActivationDate,
} from "./progression-activation";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type XpSettlement = Awaited<ReturnType<typeof postXpEventInTransaction>>;
type ReviewSnapshot = {
  createdAt: Date;
  id: string;
  postId: string;
  review: string;
  userId: string;
};
type CommentSnapshot = {
  content: string;
  createdAt: Date;
  id: string;
  postId: string | null;
  userId: string;
};

const REVIEW_DAILY_CAP = 2;
const COMMENT_DAILY_CAP = 5;

async function getDisqualifiedLikerIds(tx: Transaction, subjectId: string) {
  const rows =
    (await tx.query.xpLikeDisqualification?.findMany({
      columns: { likerUserId: true },
      where: eq(xpLikeDisqualification.subjectId, subjectId),
    })) ?? [];
  return new Set(
    rows.flatMap(({ likerUserId }) => (likerUserId ? [likerUserId] : []))
  );
}

export function getContributionContentHash(content: string) {
  return createHash("sha256")
    .update(normalizeContributionText(content))
    .digest("hex");
}

export function isEligibleLike(input: {
  authorUserId: string;
  likeCreatedAt: Date;
  likerBanned: boolean | null;
  likerCreatedAt: Date;
  likerEmailVerified: boolean;
  likerUserId: string;
}) {
  return (
    input.likerUserId !== input.authorUserId &&
    input.likerEmailVerified &&
    !input.likerBanned &&
    input.likerCreatedAt.getTime() <=
      input.likeCreatedAt.getTime() - 7 * 86_400_000
  );
}

async function isEligibleTriggeringReviewLike(
  tx: Transaction,
  review: ReviewSnapshot,
  likerUserId: string
) {
  const [like] = await tx
    .select({
      likeCreatedAt: postRatingLikes.createdAt,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: user.emailVerified,
      likerUserId: postRatingLikes.userId,
    })
    .from(postRatingLikes)
    .innerJoin(user, eq(user.id, postRatingLikes.userId))
    .where(
      and(
        eq(postRatingLikes.ratingId, review.id),
        eq(postRatingLikes.userId, likerUserId)
      )
    )
    .limit(1);
  return Boolean(
    like && isEligibleLike({ authorUserId: review.userId, ...like })
  );
}

async function isEligibleTriggeringCommentLike(
  tx: Transaction,
  snapshot: CommentSnapshot,
  likerUserId: string
) {
  const [like] = await tx
    .select({
      likeCreatedAt: commentLikes.createdAt,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: user.emailVerified,
      likerUserId: commentLikes.userId,
    })
    .from(commentLikes)
    .innerJoin(user, eq(user.id, commentLikes.userId))
    .where(
      and(
        eq(commentLikes.commentId, snapshot.id),
        eq(commentLikes.userId, likerUserId)
      )
    )
    .limit(1);
  return Boolean(
    like && isEligibleLike({ authorUserId: snapshot.userId, ...like })
  );
}

function getUtcDayRange(value: Date) {
  const start = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
  return { end: new Date(start.getTime() + 86_400_000), start };
}

function getContributionRewardBlock(
  tx: Transaction,
  input: {
    kind: "comment" | "review";
    scopeKey: string;
    userId: string;
  }
) {
  return tx.query.xpRewardBlock.findFirst({
    columns: { id: true },
    where: and(
      eq(xpRewardBlock.userId, input.userId),
      eq(xpRewardBlock.kind, input.kind),
      eq(xpRewardBlock.scopeKey, input.scopeKey)
    ),
  });
}

async function existingSubjectRequiresEligibleTrigger(
  tx: Transaction,
  subject: typeof xpRewardSubject.$inferSelect
) {
  const activatedAt = await readProgressionActivationDate(tx);
  return !activatedAt || subject.createdAt <= activatedAt;
}

export async function saveReviewRewardSubjectInTransaction(
  tx: Transaction,
  review: ReviewSnapshot,
  triggeringLikerUserId?: string
) {
  const normalizedContentHash = getContributionContentHash(review.review);
  const existing = await tx.query.xpRewardSubject.findFirst({
    where: and(
      eq(xpRewardSubject.kind, "review"),
      eq(xpRewardSubject.entityId, review.id)
    ),
  });

  if (existing) {
    if (
      triggeringLikerUserId &&
      (await existingSubjectRequiresEligibleTrigger(tx, existing)) &&
      !(await isEligibleTriggeringReviewLike(tx, review, triggeringLikerUserId))
    ) {
      return null;
    }
    if (existing.normalizedContentHash !== normalizedContentHash) {
      await tx
        .update(xpRewardSubject)
        .set({ normalizedContentHash })
        .where(eq(xpRewardSubject.id, existing.id));
    }
    return { ...existing, normalizedContentHash };
  }

  if (
    triggeringLikerUserId &&
    !(await isEligibleTriggeringReviewLike(tx, review, triggeringLikerUserId))
  ) {
    return null;
  }

  await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, review.userId))
    .for("update");
  const concurrentlyCreated = await tx.query.xpRewardSubject.findFirst({
    where: and(
      eq(xpRewardSubject.kind, "review"),
      eq(xpRewardSubject.entityId, review.id)
    ),
  });
  if (concurrentlyCreated) {
    if (
      triggeringLikerUserId &&
      (await existingSubjectRequiresEligibleTrigger(tx, concurrentlyCreated)) &&
      !(await isEligibleTriggeringReviewLike(tx, review, triggeringLikerUserId))
    ) {
      return null;
    }
    if (concurrentlyCreated.normalizedContentHash !== normalizedContentHash) {
      await tx
        .update(xpRewardSubject)
        .set({ normalizedContentHash })
        .where(eq(xpRewardSubject.id, concurrentlyCreated.id));
    }
    return { ...concurrentlyCreated, normalizedContentHash };
  }
  const { end, start } = getUtcDayRange(review.createdAt);
  const [activeEarlier] = await tx
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(postRating)
    .where(
      and(
        eq(postRating.userId, review.userId),
        gte(postRating.createdAt, start),
        lt(postRating.createdAt, end),
        or(
          lt(postRating.createdAt, review.createdAt),
          and(
            eq(postRating.createdAt, review.createdAt),
            lt(postRating.id, review.id)
          )
        )
      )
    );
  const [deletedEarlier] = await tx
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(xpRewardSubject)
    .where(
      and(
        eq(xpRewardSubject.userId, review.userId),
        eq(xpRewardSubject.kind, "review"),
        sql`${xpRewardSubject.deletedAt} is not null`,
        gte(xpRewardSubject.createdAt, start),
        lt(xpRewardSubject.createdAt, end),
        or(
          lt(xpRewardSubject.createdAt, review.createdAt),
          and(
            eq(xpRewardSubject.createdAt, review.createdAt),
            lt(xpRewardSubject.entityId, review.id)
          )
        )
      )
    );
  const blocked = await getContributionRewardBlock(tx, {
    kind: "review",
    scopeKey: `post:${review.postId}`,
    userId: review.userId,
  });
  const [subject] = await tx
    .insert(xpRewardSubject)
    .values({
      createdAt: review.createdAt,
      dailyCapEligible:
        !blocked &&
        (activeEarlier?.count ?? 0) + (deletedEarlier?.count ?? 0) <
          REVIEW_DAILY_CAP,
      entityId: review.id,
      id: generateId(),
      kind: "review",
      normalizedContentHash,
      parentPostId: review.postId,
      userId: review.userId,
    })
    .returning();
  if (!subject) {
    throw new Error("No se pudo registrar la elegibilidad de la reseña.");
  }
  return subject;
}

export async function saveCommentRewardSubjectInTransaction(
  tx: Transaction,
  snapshot: CommentSnapshot,
  triggeringLikerUserId?: string
) {
  const normalizedContentHash = getContributionContentHash(snapshot.content);
  const existing = await tx.query.xpRewardSubject.findFirst({
    where: and(
      eq(xpRewardSubject.kind, "comment"),
      eq(xpRewardSubject.entityId, snapshot.id)
    ),
  });

  if (existing) {
    if (
      triggeringLikerUserId &&
      (await existingSubjectRequiresEligibleTrigger(tx, existing)) &&
      !(await isEligibleTriggeringCommentLike(
        tx,
        snapshot,
        triggeringLikerUserId
      ))
    ) {
      return null;
    }
    if (existing.normalizedContentHash !== normalizedContentHash) {
      await tx
        .update(xpRewardSubject)
        .set({ normalizedContentHash })
        .where(eq(xpRewardSubject.id, existing.id));
    }
    return { ...existing, normalizedContentHash };
  }

  if (
    triggeringLikerUserId &&
    !(await isEligibleTriggeringCommentLike(
      tx,
      snapshot,
      triggeringLikerUserId
    ))
  ) {
    return null;
  }

  await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, snapshot.userId))
    .for("update");
  const concurrentlyCreated = await tx.query.xpRewardSubject.findFirst({
    where: and(
      eq(xpRewardSubject.kind, "comment"),
      eq(xpRewardSubject.entityId, snapshot.id)
    ),
  });
  if (concurrentlyCreated) {
    if (
      triggeringLikerUserId &&
      (await existingSubjectRequiresEligibleTrigger(tx, concurrentlyCreated)) &&
      !(await isEligibleTriggeringCommentLike(
        tx,
        snapshot,
        triggeringLikerUserId
      ))
    ) {
      return null;
    }
    if (concurrentlyCreated.normalizedContentHash !== normalizedContentHash) {
      await tx
        .update(xpRewardSubject)
        .set({ normalizedContentHash })
        .where(eq(xpRewardSubject.id, concurrentlyCreated.id));
    }
    return { ...concurrentlyCreated, normalizedContentHash };
  }
  const { end, start } = getUtcDayRange(snapshot.createdAt);
  const [activeEarlier] = await tx
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(comment)
    .where(
      and(
        eq(comment.authorId, snapshot.userId),
        gte(comment.createdAt, start),
        lt(comment.createdAt, end),
        or(
          lt(comment.createdAt, snapshot.createdAt),
          and(
            eq(comment.createdAt, snapshot.createdAt),
            lt(comment.id, snapshot.id)
          )
        )
      )
    );
  const [deletedEarlier] = await tx
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(xpRewardSubject)
    .where(
      and(
        eq(xpRewardSubject.userId, snapshot.userId),
        eq(xpRewardSubject.kind, "comment"),
        sql`${xpRewardSubject.deletedAt} is not null`,
        gte(xpRewardSubject.createdAt, start),
        lt(xpRewardSubject.createdAt, end),
        or(
          lt(xpRewardSubject.createdAt, snapshot.createdAt),
          and(
            eq(xpRewardSubject.createdAt, snapshot.createdAt),
            lt(xpRewardSubject.entityId, snapshot.id)
          )
        )
      )
    );
  const blocked = await getContributionRewardBlock(tx, {
    kind: "comment",
    scopeKey: `comment:${snapshot.id}`,
    userId: snapshot.userId,
  });
  const [subject] = await tx
    .insert(xpRewardSubject)
    .values({
      createdAt: snapshot.createdAt,
      dailyCapEligible:
        !blocked &&
        (activeEarlier?.count ?? 0) + (deletedEarlier?.count ?? 0) <
          COMMENT_DAILY_CAP,
      entityId: snapshot.id,
      id: generateId(),
      kind: "comment",
      normalizedContentHash,
      parentPostId: snapshot.postId,
      userId: snapshot.userId,
    })
    .returning();
  if (!subject) {
    throw new Error("No se pudo registrar la elegibilidad del comentario.");
  }
  return subject;
}

async function reconcileEditedContributionRewardsInTransaction(
  tx: Transaction,
  input: {
    eligible: (
      tx: Transaction,
      subject: typeof xpRewardSubject.$inferSelect
    ) => Promise<boolean>;
    kind: "comment" | "review";
    now: Date;
    subject: typeof xpRewardSubject.$inferSelect;
  }
) {
  await tx
    .select({ id: xpRewardSubject.id })
    .from(xpRewardSubject)
    .where(eq(xpRewardSubject.id, input.subject.id))
    .for("update");
  if (await input.eligible(tx, input.subject)) {
    return { reversedXp: 0, settlements: [] };
  }
  return reverseContributionRewardsInTransaction(
    tx,
    input.subject,
    input.kind,
    input.now,
    "ineligible"
  );
}

export async function reconcileEditedReviewRewardsInTransaction(
  tx: Transaction,
  review: ReviewSnapshot,
  now = new Date()
) {
  const subject = await saveReviewRewardSubjectInTransaction(tx, review);
  if (!subject) {
    return { reversedXp: 0, settlements: [] };
  }
  const author = await tx.query.user.findFirst({
    columns: { banned: true },
    where: eq(user.id, review.userId),
  });
  return reconcileEditedContributionRewardsInTransaction(tx, {
    eligible: (executor, lockedSubject) =>
      isReviewCurrentlyEligible(
        executor,
        review,
        lockedSubject,
        author?.banned ?? null
      ),
    kind: "review",
    now,
    subject,
  });
}

export async function reconcileEditedCommentRewardsInTransaction(
  tx: Transaction,
  snapshot: CommentSnapshot,
  now = new Date()
) {
  const subject = await saveCommentRewardSubjectInTransaction(tx, snapshot);
  if (!subject) {
    return { reversedXp: 0, settlements: [] };
  }
  const author = await tx.query.user.findFirst({
    columns: { banned: true },
    where: eq(user.id, snapshot.userId),
  });
  return reconcileEditedContributionRewardsInTransaction(tx, {
    eligible: (executor, lockedSubject) =>
      isCommentCurrentlyEligible(
        executor,
        snapshot,
        lockedSubject,
        author?.banned ?? null
      ),
    kind: "comment",
    now,
    subject,
  });
}

async function isContributionCurrentlyEligible(
  tx: Transaction,
  input: {
    authorBanned: boolean | null;
    content: string;
    contentEligible: boolean;
    kind: "comment" | "review";
    scopeKey: string;
    subject: typeof xpRewardSubject.$inferSelect;
    userId: string;
  }
) {
  if (!(input.subject.dailyCapEligible && !input.authorBanned)) {
    return false;
  }
  if (!input.contentEligible) {
    return false;
  }
  const forbiddenRules = await tx.query.forbiddenContentRule.findMany({
    columns: { kind: true, normalizedValue: true, value: true },
    where: (rule, { eq: equals }) => equals(rule.isActive, true),
  });
  if (
    findForbiddenContentMatch(input.content, forbiddenRules) ||
    !detectSpammyText(input.content).ok ||
    (await getContributionRewardBlock(tx, {
      kind: input.kind,
      scopeKey: input.scopeKey,
      userId: input.userId,
    }))
  ) {
    return false;
  }

  const earlierDuplicate = await tx.query.xpRewardSubject.findFirst({
    columns: { id: true },
    where: and(
      eq(xpRewardSubject.userId, input.userId),
      eq(xpRewardSubject.kind, input.kind),
      eq(
        xpRewardSubject.normalizedContentHash,
        input.subject.normalizedContentHash
      ),
      isNull(xpRewardSubject.deletedAt),
      ne(xpRewardSubject.id, input.subject.id),
      or(
        lt(xpRewardSubject.createdAt, input.subject.createdAt),
        and(
          eq(xpRewardSubject.createdAt, input.subject.createdAt),
          lt(xpRewardSubject.id, input.subject.id)
        )
      )
    ),
  });
  return !earlierDuplicate;
}

function isReviewCurrentlyEligible(
  tx: Transaction,
  review: ReviewSnapshot,
  subject: typeof xpRewardSubject.$inferSelect,
  authorBanned: boolean | null
) {
  return isContributionCurrentlyEligible(tx, {
    authorBanned,
    content: review.review,
    contentEligible: ratingReviewSchema.safeParse(review.review).success,
    kind: "review",
    scopeKey: `post:${review.postId}`,
    subject,
    userId: review.userId,
  });
}

function isCommentCurrentlyEligible(
  tx: Transaction,
  snapshot: CommentSnapshot,
  subject: typeof xpRewardSubject.$inferSelect,
  authorBanned: boolean | null
) {
  return isContributionCurrentlyEligible(tx, {
    authorBanned,
    content: snapshot.content,
    contentEligible: normalizeContributionText(snapshot.content).length >= 40,
    kind: "comment",
    scopeKey: `comment:${snapshot.id}`,
    subject,
    userId: snapshot.userId,
  });
}

async function postContributionMilestonesInTransaction(
  tx: Transaction,
  input: {
    eligibleLikes: number;
    kind: "comment" | "review";
    milestones: readonly { likes: number; xp: number }[];
    now: Date;
    subject: typeof xpRewardSubject.$inferSelect;
    userId: string;
  }
) {
  let grantedXp = 0;
  const settlements: XpSettlement[] = [];
  for (const milestone of getReachedContributionMilestones(
    input.milestones,
    input.eligibleLikes
  )) {
    const result = await settleXpWithIntegrityInTransaction(
      tx,
      {
        amount: milestone.xp,
        idempotencyKey: `${input.kind}-milestone:${input.subject.id}:${milestone.likes}`,
        kind: `${input.kind}_milestone` as const,
        metadata: { eligibleLikeCount: input.eligibleLikes },
        milestone: milestone.likes,
        reasonCode: `eligible_likes_${milestone.likes}`,
        sourceRef: `${input.kind}:${input.subject.id}:milestone:${milestone.likes}`,
        subjectId: input.subject.id,
        userId: input.userId,
      },
      { disposition: "low" },
      input.now
    );
    if (
      result.outcome === "posted" &&
      "settlement" in result &&
      result.settlement &&
      !result.settlement.replayed
    ) {
      grantedXp += result.settlement.settledXp;
    }
    if (
      result.outcome === "posted" &&
      "settlement" in result &&
      result.settlement
    ) {
      settlements.push(result.settlement);
    }
    if ("releasedSettlements" in result && result.releasedSettlements) {
      settlements.push(...result.releasedSettlements);
    }
  }
  return { eligibleLikes: input.eligibleLikes, grantedXp, settlements };
}

export async function settleReviewMilestonesInTransaction(
  tx: Transaction,
  ratingId: string,
  now = new Date(),
  triggeringLikerUserId?: string
) {
  const [review] = await tx
    .select({
      authorBanned: user.banned,
      createdAt: postRating.createdAt,
      id: postRating.id,
      postId: postRating.postId,
      review: postRating.review,
      userId: postRating.userId,
    })
    .from(postRating)
    .innerJoin(user, eq(user.id, postRating.userId))
    .where(eq(postRating.id, ratingId))
    .limit(1);
  if (!review) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }

  const subject = await saveReviewRewardSubjectInTransaction(
    tx,
    review,
    triggeringLikerUserId
  );
  if (!subject) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  await tx
    .select({ id: xpRewardSubject.id })
    .from(xpRewardSubject)
    .where(eq(xpRewardSubject.id, subject.id))
    .for("update");
  if (
    !env.XP_ACCRUAL_ENABLED ||
    !(await isReviewCurrentlyEligible(tx, review, subject, review.authorBanned))
  ) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);

  const likes = await tx
    .select({
      likeCreatedAt: postRatingLikes.createdAt,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: user.emailVerified,
      likerUserId: postRatingLikes.userId,
    })
    .from(postRatingLikes)
    .innerJoin(user, eq(user.id, postRatingLikes.userId))
    .where(eq(postRatingLikes.ratingId, ratingId));
  const disqualified = await getDisqualifiedLikerIds(tx, subject.id);
  const eligibleLikes = likes.filter(
    (like) =>
      isEligibleLike({ authorUserId: review.userId, ...like }) &&
      like.likeCreatedAt >= activatedAt &&
      !disqualified.has(like.likerUserId)
  ).length;
  return postContributionMilestonesInTransaction(tx, {
    eligibleLikes,
    kind: "review",
    milestones: REVIEW_MILESTONES,
    now,
    subject,
    userId: review.userId,
  });
}

export async function settleCommentMilestonesInTransaction(
  tx: Transaction,
  commentId: string,
  now = new Date(),
  triggeringLikerUserId?: string
) {
  const [snapshot] = await tx
    .select({
      authorBanned: user.banned,
      content: comment.content,
      createdAt: comment.createdAt,
      id: comment.id,
      postId: comment.postId,
      userId: user.id,
    })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(eq(comment.id, commentId))
    .limit(1);
  if (!snapshot) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }

  const subject = await saveCommentRewardSubjectInTransaction(
    tx,
    snapshot,
    triggeringLikerUserId
  );
  if (!subject) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  await tx
    .select({ id: xpRewardSubject.id })
    .from(xpRewardSubject)
    .where(eq(xpRewardSubject.id, subject.id))
    .for("update");
  if (
    !env.XP_ACCRUAL_ENABLED ||
    !(await isCommentCurrentlyEligible(
      tx,
      snapshot,
      subject,
      snapshot.authorBanned
    ))
  ) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);

  const likes = await tx
    .select({
      likeCreatedAt: commentLikes.createdAt,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: user.emailVerified,
      likerUserId: commentLikes.userId,
    })
    .from(commentLikes)
    .innerJoin(user, eq(user.id, commentLikes.userId))
    .where(eq(commentLikes.commentId, commentId));
  const disqualified = await getDisqualifiedLikerIds(tx, subject.id);
  const eligibleLikes = likes.filter(
    (like) =>
      isEligibleLike({ authorUserId: snapshot.userId, ...like }) &&
      like.likeCreatedAt >= activatedAt &&
      !disqualified.has(like.likerUserId)
  ).length;
  return postContributionMilestonesInTransaction(tx, {
    eligibleLikes,
    kind: "comment",
    milestones: COMMENT_MILESTONES,
    now,
    subject,
    userId: snapshot.userId,
  });
}

export async function reverseUnsupportedContributionMilestonesInTransaction(
  tx: Transaction,
  input: {
    actorUserId: string;
    integrityCaseId: string;
    now: Date;
    subjectId: string;
  }
) {
  const subject = await tx.query.xpRewardSubject.findFirst({
    where: eq(xpRewardSubject.id, input.subjectId),
  });
  if (!subject) {
    throw new Error("REWARD_SUBJECT_NOT_FOUND");
  }
  const disqualified = await getDisqualifiedLikerIds(tx, subject.id);
  let eligibleLikes = 0;
  if (subject.kind === "review") {
    const likes = await tx
      .select({
        likeCreatedAt: postRatingLikes.createdAt,
        likerBanned: user.banned,
        likerCreatedAt: user.createdAt,
        likerEmailVerified: user.emailVerified,
        likerUserId: postRatingLikes.userId,
      })
      .from(postRatingLikes)
      .innerJoin(user, eq(user.id, postRatingLikes.userId))
      .where(eq(postRatingLikes.ratingId, subject.entityId));
    eligibleLikes = likes.filter(
      (like) =>
        !disqualified.has(like.likerUserId) &&
        isEligibleLike({ authorUserId: subject.userId, ...like })
    ).length;
  } else {
    const likes = await tx
      .select({
        likeCreatedAt: commentLikes.createdAt,
        likerBanned: user.banned,
        likerCreatedAt: user.createdAt,
        likerEmailVerified: user.emailVerified,
        likerUserId: commentLikes.userId,
      })
      .from(commentLikes)
      .innerJoin(user, eq(user.id, commentLikes.userId))
      .where(eq(commentLikes.commentId, subject.entityId));
    eligibleLikes = likes.filter(
      (like) =>
        !disqualified.has(like.likerUserId) &&
        isEligibleLike({ authorUserId: subject.userId, ...like })
    ).length;
  }

  const events = await tx
    .select({
      amount: xpEvent.amount,
      id: xpEvent.id,
      kind: xpEvent.kind,
      milestone: xpEvent.milestone,
      reversesEventId: xpEvent.reversesEventId,
    })
    .from(xpEvent)
    .where(and(eq(xpEvent.subjectId, subject.id), eq(xpEvent.state, "posted")));
  const reversed = new Set(
    events.flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  const unsupported = events.filter(
    (event) =>
      event.kind === `${subject.kind}_milestone` &&
      (event.milestone ?? 0) > eligibleLikes &&
      !reversed.has(event.id)
  );
  const settlements: XpSettlement[] = [];
  for (const event of unsupported) {
    settlements.push(
      await postXpEventInTransaction(
        tx,
        {
          amount: -event.amount,
          createdBy: input.actorUserId,
          idempotencyKey: `integrity-like-reversal:${input.integrityCaseId}:${event.id}`,
          integrityCaseId: input.integrityCaseId,
          kind: "reversal",
          milestone: event.milestone ?? undefined,
          reasonCode: "coordinated_likes_disqualified",
          reversesEventId: event.id,
          sourceRef: `integrity-case:${input.integrityCaseId}:like-reversal:${event.id}`,
          subjectId: subject.id,
          userId: subject.userId,
        },
        input.now
      )
    );
  }
  return { eligibleLikes, settlements, userId: subject.userId };
}

async function reverseContributionRewardsInTransaction(
  tx: Transaction,
  subject: typeof xpRewardSubject.$inferSelect,
  kind: "comment" | "review",
  now: Date,
  reason: "ineligible" | "removed" = "removed"
) {
  await cancelPendingXpEventsInTransaction(tx, {
    now,
    subjectId: subject.id,
  });
  const events = await tx
    .select({
      amount: xpEvent.amount,
      id: xpEvent.id,
      kind: xpEvent.kind,
      milestone: xpEvent.milestone,
      reversesEventId: xpEvent.reversesEventId,
    })
    .from(xpEvent)
    .where(and(eq(xpEvent.subjectId, subject.id), eq(xpEvent.state, "posted")));
  const reversedEventIds = new Set(
    events.flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  const activeMilestones = events.filter(
    (event) =>
      event.kind === `${kind}_milestone` && !reversedEventIds.has(event.id)
  );
  const settlements: XpSettlement[] = [];
  for (const event of activeMilestones) {
    settlements.push(
      await postXpEventInTransaction(
        tx,
        {
          amount: -event.amount,
          idempotencyKey: `${kind}-${reason}-reversal:${subject.id}:${event.id}`,
          kind: "reversal",
          milestone: event.milestone ?? undefined,
          reasonCode: `${kind}_${reason}`,
          reversesEventId: event.id,
          sourceRef: `${kind}:${subject.id}:${reason}-reversal:${event.id}`,
          subjectId: subject.id,
          userId: subject.userId,
        },
        now
      )
    );
  }
  return {
    reversedXp: activeMilestones.reduce(
      (total, event) => total + event.amount,
      0
    ),
    settlements,
  };
}

export async function getReviewDeletionWarning(
  db: Database,
  input: { postId: string; userId: string }
) {
  const [row] = await db
    .select({
      settledXp: sql<number>`COALESCE(SUM(${xpEvent.amount}), 0)::integer`,
    })
    .from(postRating)
    .leftJoin(
      xpRewardSubject,
      and(
        eq(xpRewardSubject.kind, "review"),
        eq(xpRewardSubject.entityId, postRating.id)
      )
    )
    .leftJoin(
      xpEvent,
      and(
        eq(xpEvent.subjectId, xpRewardSubject.id),
        eq(xpEvent.state, "posted")
      )
    )
    .where(
      and(
        eq(postRating.postId, input.postId),
        eq(postRating.userId, input.userId)
      )
    );
  const settledXp = Math.max(0, row?.settledXp ?? 0);
  return { mayCreateEterisDebt: settledXp > 0, settledXp };
}

export async function getCommentDeletionWarning(
  db: Database,
  input: { commentId: string; userId: string }
) {
  const [row] = await db
    .select({
      settledXp: sql<number>`COALESCE(SUM(${xpEvent.amount}), 0)::integer`,
    })
    .from(comment)
    .leftJoin(
      xpRewardSubject,
      and(
        eq(xpRewardSubject.kind, "comment"),
        eq(xpRewardSubject.entityId, comment.id)
      )
    )
    .leftJoin(
      xpEvent,
      and(
        eq(xpEvent.subjectId, xpRewardSubject.id),
        eq(xpEvent.state, "posted")
      )
    )
    .where(
      and(eq(comment.id, input.commentId), eq(comment.authorId, input.userId))
    );
  const settledXp = Math.max(0, row?.settledXp ?? 0);
  return { mayCreateEterisDebt: settledXp > 0, settledXp };
}

export function deleteReviewWithRewards(
  db: Database,
  input: {
    actorUserId?: string;
    postId: string;
    reason: "guideline_abuse" | "voluntary";
    userId: string;
  }
) {
  return db
    .transaction(async (tx) => {
      const now = new Date();
      const [review] = await tx
        .select({ id: postRating.id })
        .from(postRating)
        .where(
          and(
            eq(postRating.postId, input.postId),
            eq(postRating.userId, input.userId)
          )
        )
        .for("update");
      if (!review) {
        return { reversedXp: 0, settlements: [] };
      }
      const subject = await tx.query.xpRewardSubject.findFirst({
        where: and(
          eq(xpRewardSubject.kind, "review"),
          eq(xpRewardSubject.entityId, review.id)
        ),
      });
      let reversedXp = 0;
      let settlements: XpSettlement[] = [];
      if (subject) {
        ({ reversedXp, settlements } =
          await reverseContributionRewardsInTransaction(
            tx,
            subject,
            "review",
            now
          ));
        await tx
          .update(xpRewardSubject)
          .set({ deletedAt: now, deletionReason: input.reason })
          .where(eq(xpRewardSubject.id, subject.id));
      }
      if (input.reason === "guideline_abuse") {
        await tx
          .insert(xpRewardBlock)
          .values({
            createdBy: input.actorUserId,
            kind: "review",
            reason: "review_guideline_abuse",
            scopeKey: `post:${input.postId}`,
            userId: input.userId,
          })
          .onConflictDoNothing();
      }
      await tx.delete(postRating).where(eq(postRating.id, review.id));
      return { reversedXp, settlements };
    })
    .then(async (result) => {
      for (const settlement of result.settlements) {
        await notifyXpSettlement(db, input.userId, settlement);
      }
      return { reversedXp: result.reversedXp };
    });
}

export function deleteCommentWithRewards(
  db: Database,
  input: {
    actorUserId?: string;
    commentId: string;
    reason: "guideline_abuse" | "voluntary";
  }
) {
  return db
    .transaction(async (tx) => {
      const now = new Date();
      const [snapshot] = await tx
        .select({ id: comment.id, userId: comment.authorId })
        .from(comment)
        .where(eq(comment.id, input.commentId))
        .for("update");
      if (!snapshot?.userId) {
        return { reversedXp: 0, settlements: [], userId: null };
      }
      const subject = await tx.query.xpRewardSubject.findFirst({
        where: and(
          eq(xpRewardSubject.kind, "comment"),
          eq(xpRewardSubject.entityId, snapshot.id)
        ),
      });
      let reversedXp = 0;
      let settlements: XpSettlement[] = [];
      if (subject) {
        ({ reversedXp, settlements } =
          await reverseContributionRewardsInTransaction(
            tx,
            subject,
            "comment",
            now
          ));
        await tx
          .update(xpRewardSubject)
          .set({ deletedAt: now, deletionReason: input.reason })
          .where(eq(xpRewardSubject.id, subject.id));
      }
      const replies = await tx
        .select({ id: comment.id })
        .from(comment)
        .where(eq(comment.parentId, snapshot.id));
      if (replies.length > 0) {
        await tx
          .update(xpRewardSubject)
          .set({ deletedAt: now, deletionReason: "parent_removed" })
          .where(
            and(
              eq(xpRewardSubject.kind, "comment"),
              inArray(
                xpRewardSubject.entityId,
                replies.map((reply) => reply.id)
              ),
              isNull(xpRewardSubject.deletedAt)
            )
          );
      }
      if (input.reason === "guideline_abuse") {
        await tx
          .insert(xpRewardBlock)
          .values({
            createdBy: input.actorUserId,
            kind: "comment",
            reason: "comment_guideline_abuse",
            scopeKey: `comment:${snapshot.id}`,
            userId: snapshot.userId,
          })
          .onConflictDoNothing();
      }
      await tx.delete(comment).where(eq(comment.id, snapshot.id));
      return { reversedXp, settlements, userId: snapshot.userId };
    })
    .then(async (result) => {
      if (result.userId) {
        for (const settlement of result.settlements) {
          await notifyXpSettlement(db, result.userId, settlement);
        }
      }
      return { reversedXp: result.reversedXp };
    });
}

export function markParentPostContributionSubjectsRemovedInTransaction(
  tx: Transaction,
  postId: string,
  now = new Date()
) {
  return tx
    .update(xpRewardSubject)
    .set({ deletedAt: now, deletionReason: "parent_removed" })
    .where(
      and(
        eq(xpRewardSubject.parentPostId, postId),
        isNull(xpRewardSubject.deletedAt)
      )
    );
}
