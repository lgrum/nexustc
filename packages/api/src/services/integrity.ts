import { and, desc, eq, lt, or } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  xpEvent,
  xpIntegrityCase,
  xpLikeDisqualification,
  xpRewardBlock,
  xpRewardSubject,
} from "@repo/db/schema/app";
import { xpRiskSignalKindSchema } from "@repo/shared/xp-integrity";

import { buildIntegrityCorrelationEvidence } from "../utils/integrity-evidence";
import { reverseUnsupportedContributionMilestonesInTransaction } from "./contribution-rewards";
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
  postXpEventInTransaction,
  releaseMaturedPendingXpInTransaction,
  releasePendingXpCaseInTransaction,
} from "./progression";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type XpSettlement = Awaited<ReturnType<typeof postXpEventInTransaction>>;

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
  const reversed = new Set(
    events.flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  const originals = events.filter(
    (event) => event.amount > 0 && !reversed.has(event.id)
  );
  const settlements: XpSettlement[] = [];
  for (const event of originals) {
    settlements.push(
      await postXpEventInTransaction(
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
      )
    );
  }
  return { settlements, userId: originals[0]?.userId ?? null };
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
  const result = await db.transaction(async (tx) => {
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
      await cancelPendingXpEventsInTransaction(tx, {
        actorUserId: input.actorUserId,
        caseId: input.caseId,
        now,
      });
      ({ settlements, userId } = await reversePostedCaseEvents(
        tx,
        input.caseId,
        input.actorUserId,
        now
      ));
      status = settlements.length ? "reversed" : "dismissed";
    } else if (input.action === "block") {
      if (!input.actorUserId) {
        throw new Error("INTEGRITY_ACTOR_REQUIRED");
      }
      await cancelPendingXpEventsInTransaction(tx, {
        actorUserId: input.actorUserId,
        caseId: input.caseId,
        now,
      });
      await blockCaseScope(tx, input.caseId, input.actorUserId, input.reason);
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
      for (const likerUserId of new Set(input.likerUserIds)) {
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
      status = settlements.length ? "reversed" : "dismissed";
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
    return { replayed: false, settlements, status, userId };
  });

  if (!result.replayed && result.userId) {
    for (const settlement of result.settlements) {
      await notifyXpSettlement(db, result.userId, settlement);
    }
    if (result.status === "reversed") {
      await db.transaction((tx) =>
        createUserNotification(tx, {
          description:
            "Una investigacion confirmada revirtio Account XP no valido. Consulta tu historial para ver el ajuste.",
          metadata: {
            category: "xp_integrity_reversal",
            linkPath: "/profile?section=progression",
          },
          sourceUserId: input.actorUserId,
          targetUserId: result.userId!,
          title: "Se revirtio Account XP",
        })
      );
    }
  }
  return result;
}

export async function releaseMaturedPendingXp(
  db: Database,
  userId: string,
  now = new Date()
) {
  const settlements = await db.transaction((tx) =>
    releaseMaturedPendingXpInTransaction(tx, userId, now)
  );
  for (const settlement of settlements) {
    await notifyXpSettlement(db, userId, settlement);
  }
  return settlements;
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
