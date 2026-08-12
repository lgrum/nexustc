import { and, desc, eq, gt, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import { xpRiskSignal } from "@repo/db/schema/app";
import { xpRiskSignalKindSchema } from "@repo/shared/xp-integrity";
import type { RedisClientType } from "redis";

import { getCurrentWindow, getRateLimitKey } from "../utils/rate-limit";
import { checkFixedWindowRateLimit } from "../utils/redis-operations";
import type {
  IntegrityCorrelationEvidence,
  IntegrityRiskSignal,
} from "./integrity-settlement";

type Database = typeof database;
type RiskExecutor = Pick<Database, "query" | "select">;

export type StreakIntegrityRequest = {
  correlation: IntegrityCorrelationEvidence;
  stepUpCleared?: boolean;
};

const AUTOMATION_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "idempotency_conflict",
  "like_toggle_velocity",
  "rejected_sequence",
]);
const NEUTRAL_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "like_correlation_observation",
]);
const CLEARANCE_SECONDS = 30 * 60;
const RISK_QUERY_LIMIT = 100;
const ACTION_RISK_WINDOWS = {
  discovery: {
    kind: "like_toggle_velocity" as const,
    limit: 6,
    windowSeconds: 60,
  },
  reading: {
    kind: "rejected_sequence" as const,
    limit: 30,
    windowSeconds: 60,
  },
} as const;

function getClearanceKey(userId: string, deviceHash: string) {
  return `streak:step-up:${userId}:${deviceHash}`;
}

export function classifyStreakIntegrityRisk(signals: IntegrityRiskSignal[]) {
  const reviewRisk = classifyStreakReviewRisk(signals);
  if (reviewRisk === "high") {
    return "high" as const;
  }
  if (signals.some(({ kind }) => AUTOMATION_SIGNAL_KINDS.has(kind))) {
    return "step_up" as const;
  }
  return reviewRisk ?? ("low" as const);
}

export function classifyStreakReviewRisk(signals: IntegrityRiskSignal[]) {
  if (signals.some(({ kind }) => kind === "account_correlation")) {
    return "high" as const;
  }
  if (
    signals.some(
      ({ kind }) =>
        !AUTOMATION_SIGNAL_KINDS.has(kind) && !NEUTRAL_SIGNAL_KINDS.has(kind)
    )
  ) {
    return "medium" as const;
  }
  return null;
}

export async function assessStreakIntegrityRisk(
  executor: RiskExecutor,
  userId: string,
  correlation: IntegrityCorrelationEvidence,
  now: Date,
  currentSignals: IntegrityRiskSignal[] = []
) {
  const scope = correlation.deviceHash
    ? or(
        eq(xpRiskSignal.userId, userId),
        eq(xpRiskSignal.deviceHash, correlation.deviceHash)
      )
    : eq(xpRiskSignal.userId, userId);
  const rows = await executor.query.xpRiskSignal.findMany({
    columns: { kind: true, userId: true },
    limit: RISK_QUERY_LIMIT,
    orderBy: [desc(xpRiskSignal.occurredAt)],
    where: and(gt(xpRiskSignal.expiresAt, now), scope),
  });
  const counts = new Map<IntegrityRiskSignal["kind"], number>();
  for (const signal of currentSignals) {
    counts.set(
      signal.kind,
      Math.min(RISK_QUERY_LIMIT, (counts.get(signal.kind) ?? 0) + signal.count)
    );
  }
  for (const row of rows) {
    const kind = xpRiskSignalKindSchema.safeParse(row.kind).data;
    if (kind) {
      counts.set(kind, Math.min(RISK_QUERY_LIMIT, (counts.get(kind) ?? 0) + 1));
    }
  }
  if (correlation.deviceHash) {
    const [correlationCount] = await executor
      .select({
        actingCount: sql<number>`count(*) filter (where ${xpRiskSignal.userId} = ${userId})::integer`,
        count: sql<number>`count(distinct ${xpRiskSignal.userId})::integer`,
      })
      .from(xpRiskSignal)
      .where(
        and(
          gt(xpRiskSignal.expiresAt, now),
          eq(xpRiskSignal.deviceHash, correlation.deviceHash)
        )
      );
    const distinctAccounts =
      Number(correlationCount?.count ?? 0) +
      (Number(correlationCount?.actingCount ?? 0) > 0 ? 0 : 1);
    if (distinctAccounts >= 3) {
      counts.set("account_correlation", distinctAccounts);
    }
  }
  const signals = [...counts].map(([kind, count]) => ({ count, kind }));
  return { disposition: classifyStreakIntegrityRisk(signals), signals };
}

export async function observeStreakActionRisk(
  cache: RedisClientType,
  userId: string,
  deviceHash: string | null,
  actionKind: "contribution" | "discovery" | "reading",
  now: Date
) {
  const config =
    actionKind === "discovery"
      ? ACTION_RISK_WINDOWS.discovery
      : actionKind === "reading"
        ? ACTION_RISK_WINDOWS.reading
        : null;
  if (!(deviceHash && config)) {
    return [];
  }
  const key = getRateLimitKey({
    identifier: `user:${userId}:device:${deviceHash}`,
    path: ["streak", "evidence", actionKind],
    strategy: "fixed",
    window: getCurrentWindow(config.windowSeconds, now.getTime()),
  });
  try {
    const { count, exceeded } = await checkFixedWindowRateLimit(
      cache,
      key,
      config.limit,
      config.windowSeconds
    );
    return exceeded
      ? [{ count: Math.min(count, config.limit + 1), kind: config.kind }]
      : [];
  } catch {
    return [{ count: config.limit + 1, kind: config.kind }];
  }
}

export async function getStreakStepUpClearance(
  cache: Pick<RedisClientType, "get">,
  userId: string,
  deviceHash: string | null
) {
  if (!deviceHash) {
    return false;
  }
  try {
    return (await cache.get(getClearanceKey(userId, deviceHash))) === "1";
  } catch {
    return false;
  }
}

export async function grantStreakStepUpClearance(
  cache: Pick<RedisClientType, "set">,
  userId: string,
  deviceHash: string | null
) {
  if (!deviceHash) {
    throw new Error("STREAK_DEVICE_CORRELATION_REQUIRED");
  }
  const result = await cache.set(getClearanceKey(userId, deviceHash), "1", {
    EX: CLEARANCE_SECONDS,
  });
  if (result !== "OK") {
    throw new Error("STREAK_CLEARANCE_UNAVAILABLE");
  }
}
