import { and, asc, desc, eq, gt, inArray, lt, lte, or } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  commentLikes,
  postRatingLikes,
  userStreak,
  xpEvent,
  xpIntegrityCase,
  xpLikeDisqualification,
  xpRewardBlock,
  xpRewardSubject,
} from "@repo/db/schema/app";
import { xpRiskSignalKindSchema } from "@repo/shared/xp-integrity";

import { buildIntegrityCorrelationEvidence } from "../utils/integrity-evidence";
import {
  ContributionProjectionMismatchError,
  reverseUnsupportedContributionMilestonesInTransaction,
  runContributionRewardTransaction,
} from "./contribution-rewards";
import {
  cleanupExpiredRiskSignals,
  settleXpWithIntegrityInTransaction,
} from "./integrity-settlement";
import type { IntegrityRiskSignal } from "./integrity-settlement";
import { createUserNotification } from "./notification";
import type { XpEventCommand } from "./progression";
import {
  cancelPendingXpEventsInTransaction,
  notifyXpSettlement,
  notifyXpSettlementInTransaction,
  postXpEventInTransaction,
  releaseMaturedPendingXpInTransaction,
  releasePendingXpCaseInTransaction,
} from "./progression";
import { reconcileStreakAfterIntegrityDecisionInTransaction } from "./streak";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type XpSettlement = Awaited<ReturnType<typeof postXpEventInTransaction>>;

export class PendingXpReleaseBatchError extends AggregateError {
  readonly profileUserIds: string[];

  constructor(errors: unknown[], profileUserIds: string[]) {
    super(errors, "No se pudo liberar todo el Account XP pendiente.");
    this.name = "PendingXpReleaseBatchError";
    this.profileUserIds = profileUserIds;
  }
}

async function assertCurrentSubjectLikes(
  tx: Transaction,
  input: { likerUserIds: string[]; subjectId: string }
) {
  const subject = await tx.query.xpRewardSubject.findFirst({
    columns: { entityId: true, kind: true },
    where: eq(xpRewardSubject.id, input.subjectId),
  });
  if (!subject || (subject.kind !== "comment" && subject.kind !== "review")) {
    throw new Error("INTEGRITY_SUBJECT_MISMATCH");
  }
  const likerUserIds = [...new Set(input.likerUserIds)];
  const likes =
    subject.kind === "review"
      ? await tx
          .select({ userId: postRatingLikes.userId })
          .from(postRatingLikes)
          .where(
            and(
              eq(postRatingLikes.ratingId, subject.entityId),
              inArray(postRatingLikes.userId, likerUserIds)
            )
          )
          .limit(likerUserIds.length)
      : await tx
          .select({ userId: commentLikes.userId })
          .from(commentLikes)
          .where(
            and(
              eq(commentLikes.commentId, subject.entityId),
              inArray(commentLikes.userId, likerUserIds)
            )
          )
          .limit(likerUserIds.length);
  if (new Set(likes.map(({ userId }) => userId)).size !== likerUserIds.length) {
    throw new Error("INTEGRITY_LIKER_MISMATCH");
  }
  return likerUserIds;
}

export {
  assessXpSourceCapPressure,
  settleXpWithIntegrityInTransaction,
} from "./integrity-settlement";
export type { IntegrityCorrelationEvidence } from "./integrity-settlement";
export { buildPendingXpReleaseCommand } from "./progression";

export function classifyIntegrityDisposition(input: {
  invalidProof?: boolean;
  riskLevel?: "high" | "medium";
}) {
  if (input.invalidProof) {
    return "reject" as const;
  }
  return input.riskLevel ?? ("low" as const);
}

export function sanitizeIntegrityEvidence(value: unknown) {
  if (!value || typeof value !== "object") {
    return { signals: [] };
  }
  const { signals } = value as { signals?: unknown };
  if (!Array.isArray(signals)) {
    return { signals: [] };
  }
  return {
    signals: signals.flatMap((signal) => {
      if (!signal || typeof signal !== "object") {
        return [];
      }
      const { count, kind } = signal as { count?: unknown; kind?: unknown };
      return typeof count === "number" &&
        Number.isInteger(count) &&
        count > 0 &&
        typeof kind === "string" &&
        xpRiskSignalKindSchema.safeParse(kind).success
        ? [{ count, kind }]
        : [];
    }),
  };
}

export function normalizeIntegrityDecisionActor(actorUserId?: string) {
  return actorUserId ?? null;
}

export async function settleXpWithIntegrity(
  db: Database,
  input: XpEventCommand,
  assessment:
    | { disposition: "invalid" }
    | { disposition: "low" }
    | {
        disposition: "high" | "medium";
        signals: IntegrityRiskSignal[];
        summary: string;
      },
  headers: Headers,
  now = new Date()
) {
  const normalizedAssessment: Parameters<
    typeof settleXpWithIntegrityInTransaction
  >[2] =
    assessment.disposition === "high" || assessment.disposition === "medium"
      ? {
          ...assessment,
          correlation: buildIntegrityCorrelationEvidence(headers),
        }
      : assessment.disposition === "invalid"
        ? { disposition: "invalid" }
        : { disposition: "low" };
  const result = await db.transaction((tx) =>
    settleXpWithIntegrityInTransaction(tx, input, normalizedAssessment, now)
  );
  if ("releasedSettlements" in result && result.releasedSettlements) {
    for (const settlement of result.releasedSettlements) {
      await notifyXpSettlement(db, input.userId, settlement);
    }
  }
  if (
    result.outcome === "posted" &&
    "settlement" in result &&
    result.settlement
  ) {
    await notifyXpSettlement(db, input.userId, result.settlement);
  }
  return result;
}

function releasePendingEvents(
  tx: Transaction,
  caseId: string,
  actorUserId: string | undefined,
  now: Date
) {
  return releasePendingXpCaseInTransaction(tx, {
    actorUserId,
    caseId,
    now,
  });
}

async function reversePostedCaseEvents(
  tx: Transaction,
  caseId: string,
  actorUserId: string,
  now: Date
) {
  const events = await tx
    .select()
    .from(xpEvent)
    .where(
      and(eq(xpEvent.integrityCaseId, caseId), eq(xpEvent.state, "posted"))
    );
  const caseOriginals = events.filter(
    (event) =>
      event.amount > 0 ||
      event.kind === "streak_day" ||
      event.kind === "streak_challenge"
  );
  const globalReversals =
    caseOriginals.length === 0
      ? []
      : await tx
          .select({ reversesEventId: xpEvent.reversesEventId })
          .from(xpEvent)
          .where(
            and(
              eq(xpEvent.state, "posted"),
              inArray(
                xpEvent.reversesEventId,
                caseOriginals.map(({ id }) => id)
              )
            )
          );
  const reversed = new Set(
    [...events, ...globalReversals].flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  const originals = caseOriginals.filter((event) => !reversed.has(event.id));
  const reversedEvents: typeof originals = [];
  const settlements: XpSettlement[] = [];
  for (const event of originals) {
    const settlement = await postXpEventInTransaction(
      tx,
      {
        amount: -event.amount,
        createdBy: actorUserId,
        idempotencyKey: `integrity-reversal:${caseId}:${event.id}`,
        integrityCaseId: caseId,
        kind: "reversal",
        reasonCode: "confirmed_integrity_abuse",
        reversesEventId: event.id,
        sourceRef: `integrity-case:${caseId}:reversal:${event.id}`,
        subjectId: event.subjectId ?? undefined,
        userId: event.userId,
      },
      now
    );
    if (
      "projectionMismatch" in settlement &&
      settlement.projectionMismatch === true
    ) {
      if (!settlement.projectionMismatchWalletIds) {
        throw new Error("XP_PROJECTION_MISMATCH");
      }
      throw new ContributionProjectionMismatchError(
        settlement.projectionMismatchWalletIds
      );
    }
    reversedEvents.push(event);
    settlements.push(settlement);
  }
  return {
    caseEvents: events,
    completed: true,
    events: reversedEvents,
    settlements,
    userId: events[0]?.userId ?? null,
  };
}

async function hasPendingCaseEvents(tx: Transaction, caseId: string) {
  const [pendingEvent] = await tx
    .select({ id: xpEvent.id })
    .from(xpEvent)
    .where(
      and(eq(xpEvent.integrityCaseId, caseId), eq(xpEvent.state, "pending"))
    )
    .limit(1);
  return Boolean(pendingEvent);
}

async function blockCaseScope(
  tx: Transaction,
  caseId: string,
  actorUserId: string,
  reason: string
) {
  const event = await tx.query.xpEvent.findFirst({
    where: eq(xpEvent.integrityCaseId, caseId),
  });
  if (!event) {
    throw new Error("INTEGRITY_CASE_HAS_NO_EVENT");
  }
  const subject = event.subjectId
    ? await tx.query.xpRewardSubject.findFirst({
        where: eq(xpRewardSubject.id, event.subjectId),
      })
    : null;
  const kind =
    subject?.kind ?? (event.kind === "comic_reading" ? "comic" : null);
  const scopeKey = subject
    ? subject.kind === "review"
      ? subject.parentPostId
        ? `post:${subject.parentPostId}`
        : null
      : `comment:${subject.entityId}`
    : event.sourceRef.match(/^comic:([^:]+)/)?.[1]
      ? `comic:${event.sourceRef.match(/^comic:([^:]+)/)![1]}`
      : null;
  if (!kind || !scopeKey) {
    throw new Error("INTEGRITY_SCOPE_NOT_FOUND");
  }
  await tx
    .insert(xpRewardBlock)
    .values({
      createdBy: actorUserId,
      integrityCaseId: caseId,
      kind,
      reason,
      scopeKey,
      userId: event.userId,
    })
    .onConflictDoNothing();
  return {
    kind,
    scopeKey,
    subjectId: subject?.id ?? null,
    userId: event.userId,
  };
}

export type IntegrityDecision =
  | { action: "block"; reason: string }
  | { action: "dismiss"; reason: string }
  | { action: "release"; reason: string }
  | { action: "reverse"; reason: string }
  | {
      action: "disqualify_likes";
      likerUserIds: string[];
      reason: string;
      subjectId: string;
    };

export async function decideIntegrityCase(
  db: Database,
  input: IntegrityDecision & { actorUserId?: string; caseId: string },
  now = new Date()
) {
  const result = await runContributionRewardTransaction(db, async (tx) => {
    const reverseCase =
      input.action === "reverse"
        ? await tx.query.xpIntegrityCase.findFirst({
            columns: { userId: true },
            where: eq(xpIntegrityCase.id, input.caseId),
          })
        : null;
    const lockedStreakRows = reverseCase?.userId
      ? await tx
          .select({ userId: userStreak.userId })
          .from(userStreak)
          .where(eq(userStreak.userId, reverseCase.userId))
          .for("update")
      : [];
    const [lockedStreak] = lockedStreakRows;
    const [integrityCase] = await tx
      .select()
      .from(xpIntegrityCase)
      .where(eq(xpIntegrityCase.id, input.caseId))
      .for("update");
    if (!integrityCase) {
      throw new Error("INTEGRITY_CASE_NOT_FOUND");
    }
    if (
      integrityCase.status !== "open" &&
      !(
        integrityCase.status === "released" &&
        ["block", "disqualify_likes", "reverse"].includes(input.action)
      )
    ) {
      return {
        replayed: true,
        settlements: [] as XpSettlement[],
        userId: integrityCase.userId,
      };
    }

    let settlements: XpSettlement[] = [];
    let { userId } = integrityCase;
    let status: "dismissed" | "open" | "released" | "reversed" = "dismissed";
    if (input.action === "release") {
      const release = await releasePendingEvents(
        tx,
        input.caseId,
        input.actorUserId,
        now
      );
      ({ settlements, userId } = release);
      status = release.completed ? "released" : "open";
    } else if (input.action === "dismiss") {
      const pending = await cancelPendingXpEventsInTransaction(tx, {
        actorUserId: input.actorUserId,
        caseId: input.caseId,
        now,
      });
      userId = pending[0]?.userId ?? userId;
    } else if (input.action === "reverse") {
      if (!input.actorUserId) {
        throw new Error("INTEGRITY_ACTOR_REQUIRED");
      }
      const pending = await cancelPendingXpEventsInTransaction(tx, {
        actorUserId: input.actorUserId,
        caseId: input.caseId,
        now,
      });
      const reversal = await reversePostedCaseEvents(
        tx,
        input.caseId,
        input.actorUserId,
        now
      );
      ({ settlements, userId } = reversal);
      const streakDayAffected = [...pending, ...reversal.caseEvents].some(
        ({ kind }) => kind === "streak_day"
      );
      if (lockedStreak && streakDayAffected) {
        settlements.push(
          ...(await reconcileStreakAfterIntegrityDecisionInTransaction(tx, {
            actorUserId: input.actorUserId,
            caseId: input.caseId,
            now,
            userId: lockedStreak.userId,
          }))
        );
        ({ userId } = lockedStreak);
      }
      status = reversal.completed
        ? settlements.length || streakDayAffected
          ? "reversed"
          : "dismissed"
        : "open";
    } else if (input.action === "block") {
      if (!input.actorUserId) {
        throw new Error("INTEGRITY_ACTOR_REQUIRED");
      }
      const scope = await blockCaseScope(
        tx,
        input.caseId,
        input.actorUserId,
        input.reason
      );
      await cancelPendingXpEventsInTransaction(tx, {
        actorUserId: input.actorUserId,
        closeEmptyCases: true,
        decisionReason: input.reason,
        now,
        ...(scope.subjectId
          ? { subjectId: scope.subjectId }
          : {
              sourceRefPrefix: `${scope.scopeKey}:`,
              userId: scope.userId,
            }),
      });
    } else {
      if (!input.actorUserId) {
        throw new Error("INTEGRITY_ACTOR_REQUIRED");
      }
      const [caseEvent] = await tx
        .select({ id: xpEvent.id })
        .from(xpEvent)
        .where(
          and(
            eq(xpEvent.integrityCaseId, input.caseId),
            eq(xpEvent.subjectId, input.subjectId)
          )
        )
        .limit(1);
      if (!caseEvent) {
        throw new Error("INTEGRITY_SUBJECT_MISMATCH");
      }
      const likerUserIds = await assertCurrentSubjectLikes(tx, input);
      for (const likerUserId of likerUserIds) {
        await tx
          .insert(xpLikeDisqualification)
          .values({
            createdBy: input.actorUserId,
            integrityCaseId: input.caseId,
            likerUserId,
            reason: input.reason,
            subjectId: input.subjectId,
          })
          .onConflictDoNothing();
      }
      const reversal =
        await reverseUnsupportedContributionMilestonesInTransaction(tx, {
          actorUserId: input.actorUserId,
          integrityCaseId: input.caseId,
          now,
          subjectId: input.subjectId,
        });
      ({ settlements } = reversal);
      ({ userId } = reversal);
      status = (await hasPendingCaseEvents(tx, input.caseId))
        ? "open"
        : settlements.length
          ? "reversed"
          : "dismissed";
    }
    if (status !== "open") {
      await tx
        .update(xpIntegrityCase)
        .set({
          decidedAt: now,
          decidedBy: normalizeIntegrityDecisionActor(input.actorUserId),
          decisionReason: input.reason,
          status,
          updatedAt: now,
        })
        .where(eq(xpIntegrityCase.id, input.caseId));
    }

    if (userId) {
      for (const settlement of settlements) {
        await notifyXpSettlementInTransaction(tx, userId, settlement);
      }
      if (status === "reversed") {
        await createUserNotification(tx, {
          description:
            "Una investigacion confirmada revirtio Account XP no valido. Consulta tu historial para ver el ajuste.",
          metadata: {
            category: "xp_integrity_reversal",
            linkPath: "/profile?section=progression",
          },
          sourceUserId: input.actorUserId,
          targetUserId: userId,
          title: "Se revirtio Account XP",
        });
      }
    }
    return { replayed: false, settlements, status, userId };
  });
  return result;
}

export async function releaseMaturedPendingXp(
  db: Database,
  userId: string,
  now = new Date()
) {
  const result = await db.transaction(async (tx) => {
    const released = await releaseMaturedPendingXpInTransaction(
      tx,
      userId,
      now
    );
    for (const settlement of released.settlements) {
      await notifyXpSettlementInTransaction(tx, userId, settlement);
    }
    return released;
  });
  return result;
}

export async function releaseMaturedPendingXpBatch(
  db: Database,
  now = new Date()
) {
  const pageSize = 100;
  const profileUserIds = new Set<string>();
  let checked = 0;
  let cursor: string | undefined;
  const errors: unknown[] = [];
  let released = 0;
  while (true) {
    const candidates = await db
      .select({ userId: xpIntegrityCase.userId })
      .from(xpIntegrityCase)
      .where(
        and(
          eq(xpIntegrityCase.riskLevel, "medium"),
          eq(xpIntegrityCase.status, "open"),
          lte(xpIntegrityCase.autoReleaseAt, now),
          cursor ? gt(xpIntegrityCase.userId, cursor) : undefined
        )
      )
      .groupBy(xpIntegrityCase.userId)
      .orderBy(asc(xpIntegrityCase.userId))
      .limit(pageSize);
    checked += candidates.length;
    for (const candidate of candidates) {
      if (!candidate.userId) {
        continue;
      }
      try {
        const result = await releaseMaturedPendingXp(db, candidate.userId, now);
        released += result.settlements.length;
        if (!result.completed || result.settlements.length > 0) {
          profileUserIds.add(candidate.userId);
        }
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ACCOUNT_BANNED"
        ) {
          continue;
        }
        errors.push(error);
      }
    }
    const lastCandidate = candidates.at(-1);
    if (candidates.length < pageSize || !lastCandidate?.userId) {
      break;
    }
    cursor = lastCandidate.userId;
  }
  const result = {
    checked,
    profileUserIds: [...profileUserIds],
    released,
  };
  if (errors.length > 0) {
    throw new PendingXpReleaseBatchError(errors, result.profileUserIds);
  }
  return result;
}

export async function listIntegrityCases(
  db: Database,
  input: {
    cursor?: { createdAt: Date; id: string };
    limit: number;
    status?: "dismissed" | "open" | "released" | "reversed";
  },
  now = new Date()
) {
  await cleanupExpiredRiskSignals(db, now);
  const rows = await db
    .select({
      autoReleaseAt: xpIntegrityCase.autoReleaseAt,
      createdAt: xpIntegrityCase.createdAt,
      id: xpIntegrityCase.id,
      riskLevel: xpIntegrityCase.riskLevel,
      status: xpIntegrityCase.status,
      summary: xpIntegrityCase.summary,
      userId: xpIntegrityCase.userId,
    })
    .from(xpIntegrityCase)
    .where(
      and(
        input.status ? eq(xpIntegrityCase.status, input.status) : undefined,
        input.cursor
          ? or(
              lt(xpIntegrityCase.createdAt, input.cursor.createdAt),
              and(
                eq(xpIntegrityCase.createdAt, input.cursor.createdAt),
                lt(xpIntegrityCase.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(xpIntegrityCase.createdAt), desc(xpIntegrityCase.id))
    .limit(input.limit);
  return rows.map((row) => ({
    ...row,
    autoReleaseAt: row.autoReleaseAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getIntegrityCase(
  db: Database,
  caseId: string,
  now = new Date()
) {
  await cleanupExpiredRiskSignals(db, now);
  const integrityCase = await db.query.xpIntegrityCase.findFirst({
    where: eq(xpIntegrityCase.id, caseId),
  });
  if (!integrityCase) {
    return null;
  }
  const events = await db
    .select({
      amount: xpEvent.amount,
      createdAt: xpEvent.createdAt,
      id: xpEvent.id,
      kind: xpEvent.kind,
      milestone: xpEvent.milestone,
      sourceRef: xpEvent.sourceRef,
      state: xpEvent.state,
      subjectId: xpEvent.subjectId,
    })
    .from(xpEvent)
    .where(eq(xpEvent.integrityCaseId, caseId))
    .orderBy(desc(xpEvent.createdAt));
  return {
    autoReleaseAt: integrityCase.autoReleaseAt?.toISOString() ?? null,
    blockAvailable: events.some(
      (event) => Boolean(event.subjectId) || event.kind === "comic_reading"
    ),
    createdAt: integrityCase.createdAt.toISOString(),
    decidedAt: integrityCase.decidedAt?.toISOString() ?? null,
    decisionReason: integrityCase.decisionReason,
    evidence: sanitizeIntegrityEvidence(integrityCase.evidence),
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
    id: integrityCase.id,
    riskLevel: integrityCase.riskLevel,
    status: integrityCase.status,
    summary: integrityCase.summary,
    userId: integrityCase.userId,
  };
}
