import { createHash } from "node:crypto";

import { and, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  comment,
  commentLikes,
  postRating,
  postRatingLikes,
  user,
  xpEvent,
  xpLikeDisqualification,
  xpRiskSignal,
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
import { isUserBanActive, userIsNotActivelyBanned } from "../utils/user-ban";
import {
  cleanupExpiredRiskSignals,
  settleXpWithIntegrityInTransaction,
} from "./integrity-settlement";
import type { IntegrityCorrelationEvidence } from "./integrity-settlement";
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
type RewardSubjectIdentity = Pick<
  typeof xpRewardSubject.$inferSelect,
  "entityId" | "id" | "kind" | "userId"
>;
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
const CONTRIBUTION_LIKE_BURST_LIMIT = 10;
const CONTRIBUTION_LIKE_BURST_WINDOW_MS = 5 * 60_000;
const CONTRIBUTION_LIKE_CORRELATION_WINDOW_MS = 5 * 60_000;
const EMPTY_INTEGRITY_CORRELATION = {
  deviceHash: null,
  ipPrefixHash: null,
} satisfies IntegrityCorrelationEvidence;

function requireProjectedXpSettlement(settlement: XpSettlement) {
  if (
    "projectionMismatch" in settlement &&
    settlement.projectionMismatch === true
  ) {
    throw new Error("XP_PROJECTION_MISMATCH");
  }
  return settlement;
}

export function getContributionContentHash(content: string) {
  return createHash("sha256")
    .update(normalizeContributionText(content))
    .digest("hex");
}

export function isEligibleLike(input: {
  activatedAt?: Date;
  authorUserId: string;
  likeCreatedAt: Date;
  likerBanExpires: Date | null;
  likerBanned: boolean | null;
  likerCreatedAt: Date;
  likerEmailVerified: boolean;
  likerUserId: string;
  xpAccrualEnabledAtCreation: boolean;
}) {
  return (
    input.likerUserId !== input.authorUserId &&
    input.xpAccrualEnabledAtCreation &&
    (!input.activatedAt || input.likeCreatedAt >= input.activatedAt) &&
    input.likerEmailVerified &&
    !isUserBanActive(
      { banExpires: input.likerBanExpires, banned: input.likerBanned },
      input.likeCreatedAt
    ) &&
    input.likerCreatedAt.getTime() <=
      input.likeCreatedAt.getTime() - 7 * 86_400_000
  );
}

async function countEligibleLikesInTransaction(
  tx: Transaction,
  subject: RewardSubjectIdentity,
  activatedAt: Date | undefined,
  now: Date
) {
  const [row] =
    subject.kind === "review"
      ? await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(postRatingLikes)
          .innerJoin(user, eq(user.id, postRatingLikes.userId))
          .where(
            and(
              eq(postRatingLikes.ratingId, subject.entityId),
              ne(postRatingLikes.userId, subject.userId),
              activatedAt
                ? gte(postRatingLikes.createdAt, activatedAt)
                : undefined,
              eq(postRatingLikes.emailVerifiedAtCreation, true),
              eq(postRatingLikes.xpAccrualEnabledAtCreation, true),
              userIsNotActivelyBanned(now),
              sql`${user.createdAt} <= ${postRatingLikes.createdAt} - interval '7 days'`,
              sql`not exists (
                select 1
                from ${xpLikeDisqualification} disqualification
                where disqualification.subject_id = ${subject.id}
                  and disqualification.liker_user_id = ${postRatingLikes.userId}
              )`
            )
          )
      : await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(commentLikes)
          .innerJoin(user, eq(user.id, commentLikes.userId))
          .where(
            and(
              eq(commentLikes.commentId, subject.entityId),
              ne(commentLikes.userId, subject.userId),
              activatedAt
                ? gte(commentLikes.createdAt, activatedAt)
                : undefined,
              eq(commentLikes.emailVerifiedAtCreation, true),
              eq(commentLikes.xpAccrualEnabledAtCreation, true),
              userIsNotActivelyBanned(now),
              sql`${user.createdAt} <= ${commentLikes.createdAt} - interval '7 days'`,
              sql`not exists (
                select 1
                from ${xpLikeDisqualification} disqualification
                where disqualification.subject_id = ${subject.id}
                  and disqualification.liker_user_id = ${commentLikes.userId}
              )`
            )
          );
  return row?.count ?? 0;
}

async function isEligibleTriggeringReviewLike(
  tx: Transaction,
  review: ReviewSnapshot,
  likerUserId: string
) {
  const [like] = await tx
    .select({
      likeCreatedAt: postRatingLikes.createdAt,
      likerBanExpires: user.banExpires,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: postRatingLikes.emailVerifiedAtCreation,
      likerUserId: postRatingLikes.userId,
      xpAccrualEnabledAtCreation: postRatingLikes.xpAccrualEnabledAtCreation,
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
      likerBanExpires: user.banExpires,
      likerBanned: user.banned,
      likerCreatedAt: user.createdAt,
      likerEmailVerified: commentLikes.emailVerifiedAtCreation,
      likerUserId: commentLikes.userId,
      xpAccrualEnabledAtCreation: commentLikes.xpAccrualEnabledAtCreation,
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
  if (!(await input.eligible(tx, input.subject))) {
    return reverseContributionRewardsInTransaction(
      tx,
      input.subject,
      input.kind,
      input.now,
      "ineligible"
    );
  }
  const laterDuplicates = await tx.query.xpRewardSubject.findMany({
    where: and(
      eq(xpRewardSubject.userId, input.subject.userId),
      eq(xpRewardSubject.kind, input.kind),
      eq(
        xpRewardSubject.normalizedContentHash,
        input.subject.normalizedContentHash
      ),
      isNull(xpRewardSubject.deletedAt),
      ne(xpRewardSubject.id, input.subject.id),
      or(
        gt(xpRewardSubject.createdAt, input.subject.createdAt),
        and(
          eq(xpRewardSubject.createdAt, input.subject.createdAt),
          gt(xpRewardSubject.id, input.subject.id)
        )
      )
    ),
  });
  let reversedXp = 0;
  const settlements: XpSettlement[] = [];
  for (const duplicate of laterDuplicates) {
    await tx
      .select({ id: xpRewardSubject.id })
      .from(xpRewardSubject)
      .where(eq(xpRewardSubject.id, duplicate.id))
      .for("update");
    const result = await reverseContributionRewardsInTransaction(
      tx,
      duplicate,
      input.kind,
      input.now,
      "ineligible"
    );
    reversedXp += result.reversedXp;
    settlements.push(...result.settlements);
  }
  return { reversedXp, settlements };
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
    columns: { banExpires: true, banned: true },
    where: eq(user.id, review.userId),
  });
  return reconcileEditedContributionRewardsInTransaction(tx, {
    eligible: (executor, lockedSubject) =>
      isReviewCurrentlyEligible(
        executor,
        review,
        lockedSubject,
        author ?? { banExpires: null, banned: null },
        now
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
    columns: { banExpires: true, banned: true },
    where: eq(user.id, snapshot.userId),
  });
  return reconcileEditedContributionRewardsInTransaction(tx, {
    eligible: (executor, lockedSubject) =>
      isCommentCurrentlyEligible(
        executor,
        snapshot,
        lockedSubject,
        author ?? { banExpires: null, banned: null },
        now
      ),
    kind: "comment",
    now,
    subject,
  });
}

async function isContributionCurrentlyEligible(
  tx: Transaction,
  input: {
    authorBan: { banExpires: Date | null; banned: boolean | null };
    content: string;
    contentEligible: boolean;
    kind: "comment" | "review";
    now: Date;
    scopeKey: string;
    subject: typeof xpRewardSubject.$inferSelect;
    userId: string;
  }
) {
  if (
    !input.subject.dailyCapEligible ||
    isUserBanActive(input.authorBan, input.now)
  ) {
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
  authorBan: { banExpires: Date | null; banned: boolean | null },
  now: Date
) {
  return isContributionCurrentlyEligible(tx, {
    authorBan,
    content: review.review,
    contentEligible: ratingReviewSchema.safeParse(review.review).success,
    kind: "review",
    now,
    scopeKey: `post:${review.postId}`,
    subject,
    userId: review.userId,
  });
}

function isCommentCurrentlyEligible(
  tx: Transaction,
  snapshot: CommentSnapshot,
  subject: typeof xpRewardSubject.$inferSelect,
  authorBan: { banExpires: Date | null; banned: boolean | null },
  now: Date
) {
  return isContributionCurrentlyEligible(tx, {
    authorBan,
    content: snapshot.content,
    contentEligible: normalizeContributionText(snapshot.content).length >= 40,
    kind: "comment",
    now,
    scopeKey: `comment:${snapshot.id}`,
    subject,
    userId: snapshot.userId,
  });
}

async function postContributionMilestonesInTransaction(
  tx: Transaction,
  input: {
    assessment: Parameters<typeof settleXpWithIntegrityInTransaction>[2];
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
  const milestoneEvents = await tx
    .select({
      id: xpEvent.id,
      idempotencyKey: xpEvent.idempotencyKey,
      kind: xpEvent.kind,
      milestone: xpEvent.milestone,
      reversesEventId: xpEvent.reversesEventId,
      state: xpEvent.state,
    })
    .from(xpEvent)
    .where(eq(xpEvent.subjectId, input.subject.id));
  const reversedEventIds = new Set(
    milestoneEvents.flatMap(({ reversesEventId, state }) =>
      state === "posted" && reversesEventId ? [reversesEventId] : []
    )
  );
  for (const milestone of getReachedContributionMilestones(
    input.milestones,
    input.eligibleLikes
  )) {
    const awards = milestoneEvents.filter(
      (event) =>
        event.kind === `${input.kind}_milestone` &&
        event.milestone === milestone.likes
    );
    const hasActiveAward = awards.some(
      (event) =>
        event.state === "pending" ||
        (event.state === "posted" && !reversedEventIds.has(event.id))
    );
    if (hasActiveAward) {
      continue;
    }
    const generation = awards.length + 1;
    const generationSuffix =
      generation === 1 ? "" : `:generation:${generation}`;
    const result = await settleXpWithIntegrityInTransaction(
      tx,
      {
        amount: milestone.xp,
        idempotencyKey: `${input.kind}-milestone:${input.subject.id}:${milestone.likes}${generationSuffix}`,
        kind: `${input.kind}_milestone` as const,
        metadata: { eligibleLikeCount: input.eligibleLikes },
        milestone: milestone.likes,
        reasonCode: `eligible_likes_${milestone.likes}`,
        sourceRef: `${input.kind}:${input.subject.id}:milestone:${milestone.likes}${generationSuffix}`,
        subjectId: input.subject.id,
        userId: input.userId,
      },
      input.assessment,
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

async function assessContributionMilestoneIntegrity(
  tx: Transaction,
  input: {
    correlation: IntegrityCorrelationEvidence;
    kind: "comment" | "review";
    now: Date;
    triggeringLikerUserId?: string;
  }
): Promise<Parameters<typeof settleXpWithIntegrityInTransaction>[2]> {
  if (!input.triggeringLikerUserId) {
    return { disposition: "low" };
  }
  const since = new Date(
    input.now.getTime() - CONTRIBUTION_LIKE_BURST_WINDOW_MS
  );
  const correlationKeys = [
    input.correlation.deviceHash
      ? `device:${input.correlation.deviceHash}`
      : null,
    input.correlation.ipPrefixHash
      ? `ip:${input.correlation.ipPrefixHash}`
      : null,
  ]
    .filter((key): key is string => Boolean(key))
    .toSorted();
  let correlatedAccount = false;
  if (correlationKeys.length > 0) {
    for (const key of correlationKeys) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`contribution-like:${key}`}, 0))`
      );
    }
    await cleanupExpiredRiskSignals(tx, input.now);
    const [correlated] = await tx
      .select({ id: xpRiskSignal.id, userId: xpRiskSignal.userId })
      .from(xpRiskSignal)
      .where(
        and(
          eq(xpRiskSignal.kind, "like_correlation_observation"),
          ne(xpRiskSignal.userId, input.triggeringLikerUserId),
          gte(xpRiskSignal.occurredAt, since),
          or(
            input.correlation.deviceHash
              ? eq(xpRiskSignal.deviceHash, input.correlation.deviceHash)
              : undefined,
            input.correlation.ipPrefixHash
              ? eq(xpRiskSignal.ipPrefixHash, input.correlation.ipPrefixHash)
              : undefined
          )
        )
      )
      .limit(1);
    correlatedAccount = Boolean(correlated);
    await tx.insert(xpRiskSignal).values({
      deviceHash: input.correlation.deviceHash,
      evidence: { source: `${input.kind}_like` },
      expiresAt: new Date(
        input.now.getTime() + CONTRIBUTION_LIKE_CORRELATION_WINDOW_MS
      ),
      id: generateId(),
      ipPrefixHash: input.correlation.ipPrefixHash,
      kind: "like_correlation_observation",
      occurredAt: input.now,
      userId: input.triggeringLikerUserId,
    });
  }
  const recent =
    input.kind === "review"
      ? await tx
          .select({ createdAt: postRatingLikes.createdAt })
          .from(postRatingLikes)
          .where(
            and(
              eq(postRatingLikes.userId, input.triggeringLikerUserId),
              gte(postRatingLikes.createdAt, since)
            )
          )
          .limit(CONTRIBUTION_LIKE_BURST_LIMIT)
      : await tx
          .select({ createdAt: commentLikes.createdAt })
          .from(commentLikes)
          .where(
            and(
              eq(commentLikes.userId, input.triggeringLikerUserId),
              gte(commentLikes.createdAt, since)
            )
          )
          .limit(CONTRIBUTION_LIKE_BURST_LIMIT);
  const observed = recent.length;
  if (!(correlatedAccount || observed >= CONTRIBUTION_LIKE_BURST_LIMIT)) {
    return { disposition: "low" };
  }
  const signals = [] as {
    count: number;
    evidence: { source: string };
    kind: "account_correlation" | "like_toggle_velocity";
  }[];
  if (correlatedAccount) {
    signals.push({
      count: 2,
      evidence: { source: `${input.kind}_like` },
      kind: "account_correlation",
    });
  }
  if (observed >= CONTRIBUTION_LIKE_BURST_LIMIT) {
    signals.push({
      count: observed,
      evidence: { source: `${input.kind}_like` },
      kind: "like_toggle_velocity",
    });
  }
  return {
    correlation: input.correlation,
    disposition: "medium",
    signals,
    summary: correlatedAccount
      ? "Actividad coordinada de Me gusta entre cuentas relacionadas."
      : "Actividad de Me gusta inusualmente rapida.",
  };
}

export async function settleReviewMilestonesInTransaction(
  tx: Transaction,
  ratingId: string,
  now = new Date(),
  triggeringLikerUserId?: string,
  correlation?: IntegrityCorrelationEvidence
) {
  const [review] = await tx
    .select({
      authorBanExpires: user.banExpires,
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
    .for("update")
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
    !(await isReviewCurrentlyEligible(
      tx,
      review,
      subject,
      { banExpires: review.authorBanExpires, banned: review.authorBanned },
      now
    ))
  ) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);
  const eligibleLikes = await countEligibleLikesInTransaction(
    tx,
    subject,
    activatedAt,
    now
  );
  return postContributionMilestonesInTransaction(tx, {
    assessment: await assessContributionMilestoneIntegrity(tx, {
      correlation: correlation ?? EMPTY_INTEGRITY_CORRELATION,
      kind: "review",
      now,
      triggeringLikerUserId,
    }),
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
  triggeringLikerUserId?: string,
  correlation?: IntegrityCorrelationEvidence
) {
  const [snapshot] = await tx
    .select({
      authorBanExpires: user.banExpires,
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
    .for("update")
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
      {
        banExpires: snapshot.authorBanExpires,
        banned: snapshot.authorBanned,
      },
      now
    ))
  ) {
    return { eligibleLikes: 0, grantedXp: 0, settlements: [] };
  }
  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);
  const eligibleLikes = await countEligibleLikesInTransaction(
    tx,
    subject,
    activatedAt,
    now
  );
  return postContributionMilestonesInTransaction(tx, {
    assessment: await assessContributionMilestoneIntegrity(tx, {
      correlation: correlation ?? EMPTY_INTEGRITY_CORRELATION,
      kind: "comment",
      now,
      triggeringLikerUserId,
    }),
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
  const activatedAt = await readProgressionActivationDate(tx);
  const eligibleLikes = await countEligibleLikesInTransaction(
    tx,
    subject,
    activatedAt ?? undefined,
    input.now
  );

  return reverseUnsupportedMilestonesForCount(tx, {
    actorUserId: input.actorUserId,
    eligibleLikes,
    idempotencyPrefix: `integrity-like-reversal:${input.integrityCaseId}`,
    integrityCaseId: input.integrityCaseId,
    now: input.now,
    reasonCode: "coordinated_likes_disqualified",
    sourcePrefix: `integrity-case:${input.integrityCaseId}:like-reversal`,
    subject,
  });
}

async function reverseUnsupportedMilestonesForCount(
  tx: Transaction,
  input: {
    actorUserId: string;
    eligibleLikes: number;
    idempotencyPrefix: string;
    integrityCaseId?: string;
    now: Date;
    reasonCode: string;
    sourcePrefix: string;
    subject: RewardSubjectIdentity;
  }
) {
  const events = await tx
    .select({
      amount: xpEvent.amount,
      id: xpEvent.id,
      kind: xpEvent.kind,
      milestone: xpEvent.milestone,
      reversesEventId: xpEvent.reversesEventId,
      state: xpEvent.state,
    })
    .from(xpEvent)
    .where(
      and(
        eq(xpEvent.subjectId, input.subject.id),
        inArray(xpEvent.state, ["pending", "posted"])
      )
    );
  const pendingUnsupported = events.filter(
    (event) =>
      event.state === "pending" &&
      event.kind === `${input.subject.kind}_milestone` &&
      (event.milestone ?? 0) > input.eligibleLikes
  );
  for (const event of pendingUnsupported) {
    await cancelPendingXpEventsInTransaction(tx, {
      actorUserId: input.actorUserId,
      closeEmptyCases: true,
      decisionReason: "Los likes elegibles ya no respaldan este hito.",
      eventId: event.id,
      now: input.now,
    });
  }
  const postedEvents = events.filter((event) => event.state === "posted");
  const reversed = new Set(
    postedEvents.flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  const unsupported = postedEvents.filter(
    (event) =>
      event.kind === `${input.subject.kind}_milestone` &&
      (event.milestone ?? 0) > input.eligibleLikes &&
      !reversed.has(event.id)
  );
  const settlements: XpSettlement[] = [];
  for (const event of unsupported) {
    settlements.push(
      requireProjectedXpSettlement(
        await postXpEventInTransaction(
          tx,
          {
            amount: -event.amount,
            createdBy: input.actorUserId,
            idempotencyKey: `${input.idempotencyPrefix}:${event.id}`,
            integrityCaseId: input.integrityCaseId,
            kind: "reversal",
            milestone: event.milestone ?? undefined,
            reasonCode: input.reasonCode,
            reversesEventId: event.id,
            sourceRef: `${input.sourcePrefix}:${event.id}`,
            subjectId: input.subject.id,
            userId: input.subject.userId,
          },
          input.now
        )
      )
    );
  }
  return {
    eligibleLikes: input.eligibleLikes,
    settlements,
    userId: input.subject.userId,
  };
}

async function reconcileIneligibleLikerRewardsInTransaction(
  tx: Transaction,
  input: {
    actorUserId: string;
    idempotencyPrefix: string;
    likerUserId: string;
    now: Date;
    reasonCode: string;
    removeLikesBeforeRecount: boolean;
    sourcePrefix: string;
  }
) {
  const result = await tx.execute(sql`
      select distinct
        subject.id,
        subject.entity_id as "entityId",
        subject.kind,
        subject.user_id as "userId"
      from xp_reward_subject subject
      inner join post_rating_like likes
        on subject.kind = 'review' and subject.entity_id = likes.rating_id
      where likes.user_id = ${input.likerUserId}
        and subject.deleted_at is null
      union
      select distinct
        subject.id,
        subject.entity_id as "entityId",
        subject.kind,
        subject.user_id as "userId"
      from xp_reward_subject subject
      inner join comment_like likes
        on subject.kind = 'comment' and subject.entity_id = likes.comment_id
      where likes.user_id = ${input.likerUserId}
        and subject.deleted_at is null
  `);
  if (input.removeLikesBeforeRecount) {
    await tx
      .delete(postRatingLikes)
      .where(eq(postRatingLikes.userId, input.likerUserId));
    await tx
      .delete(commentLikes)
      .where(eq(commentLikes.userId, input.likerUserId));
  }
  const activatedAt = await readProgressionActivationDate(tx);
  const reconciled: { settlements: XpSettlement[]; userId: string }[] = [];
  for (const row of result.rows) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      typeof row.entityId !== "string" ||
      (row.kind !== "comment" && row.kind !== "review") ||
      typeof row.userId !== "string"
    ) {
      continue;
    }
    const [locked] = await tx
      .select({ id: xpRewardSubject.id })
      .from(xpRewardSubject)
      .where(eq(xpRewardSubject.id, row.id))
      .for("update");
    if (!locked) {
      continue;
    }
    const subject: RewardSubjectIdentity = {
      entityId: row.entityId,
      id: row.id,
      kind: row.kind,
      userId: row.userId,
    };
    const eligibleLikes = await countEligibleLikesInTransaction(
      tx,
      subject,
      activatedAt ?? undefined,
      input.now
    );
    reconciled.push(
      await reverseUnsupportedMilestonesForCount(tx, {
        actorUserId: input.actorUserId,
        eligibleLikes,
        idempotencyPrefix: `${input.idempotencyPrefix}:${input.likerUserId}`,
        now: input.now,
        reasonCode: input.reasonCode,
        sourcePrefix: `${input.sourcePrefix}:${input.likerUserId}:reversal`,
        subject,
      })
    );
  }
  return reconciled;
}

export function reconcileBannedLikerRewardsInTransaction(
  tx: Transaction,
  input: { actorUserId: string; likerUserId: string; now: Date }
) {
  return reconcileIneligibleLikerRewardsInTransaction(tx, {
    ...input,
    idempotencyPrefix: "banned-liker-reversal",
    reasonCode: "eligible_liker_banned",
    removeLikesBeforeRecount: false,
    sourcePrefix: "banned-liker",
  });
}

export function reconcileClosedLikerRewardsInTransaction(
  tx: Transaction,
  input: { actorUserId: string; likerUserId: string; now: Date }
) {
  return reconcileIneligibleLikerRewardsInTransaction(tx, {
    ...input,
    idempotencyPrefix: "closed-liker-reversal",
    reasonCode: "eligible_liker_account_closed",
    removeLikesBeforeRecount: true,
    sourcePrefix: "closed-liker",
  });
}

export async function notifyBannedLikerRewardSettlements(
  db: Database,
  results: Awaited<ReturnType<typeof reconcileBannedLikerRewardsInTransaction>>
) {
  for (const result of results) {
    for (const settlement of result.settlements) {
      await notifyXpSettlement(db, result.userId, settlement);
    }
  }
}

export async function reconcileBannedLikerRewards(
  db: Database,
  input: { actorUserId: string; likerUserId: string; now?: Date }
) {
  const results = await db.transaction((tx) =>
    reconcileBannedLikerRewardsInTransaction(tx, {
      ...input,
      now: input.now ?? new Date(),
    })
  );
  await notifyBannedLikerRewardSettlements(db, results);
  return results;
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
      requireProjectedXpSettlement(
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
      const descendants = await tx.execute(sql`
        with recursive descendants as (
          select ${comment.id}
          from ${comment}
          where ${comment.parentId} = ${snapshot.id}
          union all
          select child.${sql.raw("id")}
          from ${comment} child
          inner join descendants parent on child.parent_id = parent.id
        )
        select ${xpRewardSubject.id}
        from ${xpRewardSubject}
        inner join descendants
          on ${xpRewardSubject.entityId} = descendants.id
        where ${xpRewardSubject.kind} = 'comment'
          and ${xpRewardSubject.deletedAt} is null
      `);
      const descendantSubjectIds = descendants.rows.flatMap((row) =>
        row && typeof row === "object" && typeof row.id === "string"
          ? [row.id]
          : []
      );
      for (const subjectId of descendantSubjectIds) {
        await cancelPendingXpEventsInTransaction(tx, {
          closeEmptyCases: true,
          now,
          subjectId,
        });
      }
      if (descendantSubjectIds.length > 0) {
        await tx
          .update(xpRewardSubject)
          .set({ deletedAt: now, deletionReason: "parent_removed" })
          .where(
            and(
              inArray(xpRewardSubject.id, descendantSubjectIds),
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

export async function markParentPostContributionSubjectsRemovedInTransaction(
  tx: Transaction,
  postId: string,
  now = new Date()
) {
  const subjects = await tx
    .select({ id: xpRewardSubject.id })
    .from(xpRewardSubject)
    .where(
      and(
        eq(xpRewardSubject.parentPostId, postId),
        isNull(xpRewardSubject.deletedAt)
      )
    );
  for (const subject of subjects) {
    await cancelPendingXpEventsInTransaction(tx, {
      closeEmptyCases: true,
      now,
      subjectId: subject.id,
    });
  }
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
