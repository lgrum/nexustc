import { eq, lte } from "@repo/db";
import type { db as database } from "@repo/db";
import { xpEvent, xpIntegrityCase, xpRiskSignal } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import type { XpRiskSignalKind } from "@repo/shared/xp-integrity";

import type { XpEventCommand } from "./progression";
import {
  createPendingXpEventInTransaction,
  postXpEventInTransaction,
  releaseMaturedPendingXpInTransaction,
} from "./progression";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type IntegrityRiskSignal = {
  count: number;
  evidence?: Record<string, unknown>;
  kind: XpRiskSignalKind;
};

export type IntegrityCorrelationEvidence = {
  deviceHash: string | null;
  ipPrefixHash: string | null;
};

const SIGNAL_RETENTION_MS = 30 * 86_400_000;
const MEDIUM_HOLD_MS = 24 * 60 * 60_000;

export function assessXpSourceCapPressure(input: {
  correlation?: IntegrityCorrelationEvidence;
  limit: number;
  observed: number;
  source: string;
}): Parameters<typeof settleXpWithIntegrityInTransaction>[2] {
  if (input.observed < input.limit) {
    return { disposition: "low" };
  }
  return {
    correlation: input.correlation ?? {
      deviceHash: null,
      ipPrefixHash: null,
    },
    disposition: "medium",
    signals: [
      {
        count: 1,
        evidence: { source: input.source },
        kind: "source_cap_pressure",
      },
    ],
    summary: `La fuente ${input.source} alcanzo su limite de recompensa.`,
  };
}

export async function cleanupExpiredRiskSignals(
  executor: Pick<Transaction, "delete">,
  now: Date
) {
  await executor.delete(xpRiskSignal).where(lte(xpRiskSignal.expiresAt, now));
}

async function recordRiskSignals(
  tx: Transaction,
  input: {
    correlation: IntegrityCorrelationEvidence;
    now: Date;
    signals: IntegrityRiskSignal[];
    userId: string;
  }
) {
  await cleanupExpiredRiskSignals(tx, input.now);
  if (input.signals.length === 0) {
    return;
  }
  await tx.insert(xpRiskSignal).values(
    input.signals.map((signal) => ({
      deviceHash: input.correlation.deviceHash,
      evidence: signal.evidence ?? {},
      expiresAt: new Date(input.now.getTime() + SIGNAL_RETENTION_MS),
      id: generateId(),
      ipPrefixHash: input.correlation.ipPrefixHash,
      kind: signal.kind,
      occurredAt: input.now,
      userId: input.userId,
    }))
  );
}

export async function settleXpWithIntegrityInTransaction(
  tx: Transaction,
  input: XpEventCommand,
  assessment:
    | { disposition: "invalid" }
    | { disposition: "low" }
    | {
        correlation: IntegrityCorrelationEvidence;
        disposition: "high" | "medium";
        signals: IntegrityRiskSignal[];
        summary: string;
      },
  now = new Date()
) {
  const released = await releaseMaturedPendingXpInTransaction(
    tx,
    input.userId,
    now
  );
  const releasedSettlements = released.settlements.length
    ? { releasedSettlements: released.settlements }
    : {};
  if (assessment.disposition === "invalid") {
    return {
      outcome: "rejected" as const,
      replayed: false,
      ...releasedSettlements,
    };
  }
  if (!released.completed) {
    return {
      outcome: "deferred" as const,
      releasedSettlements: released.settlements,
      replayed: false,
    };
  }
  if (assessment.disposition === "low") {
    const settlement = await postXpEventInTransaction(tx, input, now);
    return {
      outcome: "posted" as const,
      settlement,
      ...releasedSettlements,
    };
  }

  const existing = await tx.query.xpEvent.findFirst({
    columns: { id: true, integrityCaseId: true, state: true },
    where: eq(xpEvent.idempotencyKey, input.idempotencyKey),
  });
  if (existing) {
    return {
      caseId: existing.integrityCaseId,
      eventId: existing.id,
      outcome:
        existing.state === "pending"
          ? ("pending" as const)
          : ("posted" as const),
      replayed: true,
      ...releasedSettlements,
    };
  }

  const caseId = generateId();
  const autoReleaseAt =
    assessment.disposition === "medium"
      ? new Date(now.getTime() + MEDIUM_HOLD_MS)
      : null;
  const evidence = {
    signals: assessment.signals.map(({ count, kind }) => ({ count, kind })),
  };
  await tx.insert(xpIntegrityCase).values({
    autoReleaseAt,
    evidence,
    id: caseId,
    riskLevel: assessment.disposition,
    summary: assessment.summary,
    updatedAt: now,
    userId: input.userId,
  });
  await recordRiskSignals(tx, {
    correlation: assessment.correlation,
    now,
    signals: assessment.signals,
    userId: input.userId,
  });
  const pending = await createPendingXpEventInTransaction(
    tx,
    {
      ...input,
      availableAt: autoReleaseAt ?? undefined,
      integrityCaseId: caseId,
    },
    now
  );
  return {
    caseId,
    outcome: "pending" as const,
    ...pending,
    ...releasedSettlements,
  };
}
