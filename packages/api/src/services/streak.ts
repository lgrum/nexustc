import { and, desc, eq, getRedis, gt, inArray, lte, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisWallet,
  streakDiscoveryReceipt,
  streakProtectionWindow,
  user,
  userProgression,
  userStreak,
  xpEvent,
} from "@repo/db/schema/app";
import { env } from "@repo/env";
import { RATING_REVIEW_MIN_LENGTH } from "@repo/shared/constants";
import { normalizeContributionText } from "@repo/shared/contribution-rewards";
import { ratingReviewSchema } from "@repo/shared/schemas";
import {
  DAILY_STREAK_REWARD_CONFIG_VERSION,
  DAILY_STREAK_REWARDS,
  STREAK_CHALLENGE_REWARDS,
  STREAK_CONTRIBUTION_MIN_LENGTH,
  STREAK_DISCOVERY_ACTION_REQUIREMENT,
  STREAK_READING_PAGE_REQUIREMENT,
  getDailyStreakReward,
  getStreakChallengeReward,
  streakChallengeTargetSchema,
} from "@repo/shared/streak";
import type { StreakChallengeTarget } from "@repo/shared/streak";

import {
  getCanonicalIanaTimezone,
  getNextLocalDate,
  getPreviousLocalDate,
  getStreakDayPeriod,
  getStreakDayPeriodForLocalDate,
  getTimezoneChangeEffectiveAt,
  isValidIanaTimezone,
} from "../utils/streak-time";
import { isUserBanActive } from "../utils/user-ban";
import { ContributionProjectionMismatchError } from "./contribution-rewards";
import { settleXpWithIntegrityInTransaction } from "./integrity-settlement";
import type { IntegrityRiskSignal } from "./integrity-settlement";
import { createUserNotification } from "./notification";
import {
  createPendingXpEventInTransaction,
  lockUserProgressionInTransaction,
  notifyXpSettlementInTransaction,
  postXpEventInTransaction,
} from "./progression";
import { readProgressionActivationDate } from "./progression-activation";
import {
  assessStreakIntegrityRisk,
  classifyStreakReviewRisk,
  getStreakStepUpClearance,
  grantStreakStepUpClearance,
  observeStreakActionRisk,
} from "./streak-integrity";
import type { StreakIntegrityRequest } from "./streak-integrity";

type Database = typeof database;
export type StreakExecutor = Pick<
  Database,
  "delete" | "execute" | "insert" | "query" | "select" | "update"
>;

export type StreakEvidence = (
  | {
      impersonated: boolean;
      kind: "contribution";
      source: { id: string; kind: "comment" | "review" };
      text: string;
      timezone?: string;
      userId: string;
    }
  | {
      actionKind: "bookmark" | "follow" | "rating";
      contentKey: string;
      impersonated: boolean;
      kind: "discovery";
      timezone?: string;
      userId: string;
    }
  | {
      comicId: string;
      impersonated: boolean;
      kind: "reading";
      page: number;
      timezone?: string;
      userId: string;
    }
) & { integrity?: StreakIntegrityRequest };

export type StreakDayCompletion = {
  outcome: "immediate" | "pending";
  path: "contribution" | "mixed_discovery" | "reading";
  tier: number;
};

type StreakErrorCode =
  | "CHALLENGE_ALREADY_SELECTED"
  | "CHALLENGE_NOT_AVAILABLE"
  | "CHALLENGE_TARGET_REACHED"
  | "INVALID_CHALLENGE_TARGET"
  | "INVALID_TIMEZONE"
  | "TIMEZONE_CHANGE_PENDING"
  | "TIMEZONE_COOLDOWN";

const TIMEZONE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type StreakCompletionEvent = {
  amount: number;
  metadata: unknown;
  state: "cancelled" | "pending" | "posted";
};

function getChallengeCompletionOutcome(
  completed: boolean,
  completionEvent: StreakCompletionEvent | null
) {
  if (completed === false) {
    return null;
  }
  if (completionEvent === null) {
    return "capped" as const;
  }
  if (completionEvent.state === "pending") {
    return "pending" as const;
  }
  if (completionEvent.state === "cancelled") {
    return "cancelled" as const;
  }
  if (
    typeof completionEvent.metadata === "object" &&
    completionEvent.metadata !== null &&
    "requestedAmount" in completionEvent.metadata &&
    typeof completionEvent.metadata.requestedAmount === "number" &&
    completionEvent.metadata.requestedAmount > completionEvent.amount
  ) {
    return "capped" as const;
  }
  return "immediate" as const;
}

function getChallengeState(
  streak: {
    challengeCompletedAt: Date | null;
    challengeSelectedAt: Date | null;
    challengeTarget: number | null;
  },
  currentStreak: number,
  completedToday: boolean,
  completionEvent: StreakCompletionEvent | null = null
) {
  const challengeTarget = streakChallengeTargetSchema.safeParse(
    streak.challengeTarget
  ).data;
  const completed = Boolean(streak.challengeCompletedAt);
  const completedDays = challengeTarget
    ? completed
      ? challengeTarget
      : Math.min(currentStreak, challengeTarget)
    : 0;
  const availableTargets =
    challengeTarget || currentStreak < 1
      ? []
      : STREAK_CHALLENGE_REWARDS.filter(
          ({ target }) => target > currentStreak
        ).map(({ target, xp }) => ({ target, xp }));

  const completionOutcome = getChallengeCompletionOutcome(
    completed,
    completionEvent
  );

  return {
    availableTargets,
    completed,
    completedAt: streak.challengeCompletedAt?.toISOString() ?? null,
    completedDays,
    completionOutcome,
    offerAvailable: !challengeTarget && completedToday && currentStreak === 1,
    remainingDays: challengeTarget
      ? Math.max(0, challengeTarget - completedDays)
      : null,
    selectedAt: streak.challengeSelectedAt?.toISOString() ?? null,
    target: challengeTarget ?? null,
    upcomingBonus: challengeTarget
      ? completed
        ? completionOutcome === "cancelled"
          ? 0
          : completionOutcome === "capped"
            ? (completionEvent?.amount ?? 0)
            : (completionEvent?.amount ?? null)
        : getStreakChallengeReward(challengeTarget)
      : null,
  };
}

function getLatestStreakSettlementEvent(
  executor: Pick<Database, "query">,
  userId: string,
  idempotencyKey: string
) {
  return executor.query.xpEvent.findFirst({
    columns: {
      amount: true,
      id: true,
      idempotencyKey: true,
      metadata: true,
      state: true,
    },
    orderBy: [desc(xpEvent.createdAt), desc(xpEvent.id)],
    where: and(
      eq(xpEvent.userId, userId),
      or(
        eq(xpEvent.idempotencyKey, idempotencyKey),
        sql`starts_with(${xpEvent.idempotencyKey}, ${`${idempotencyKey}:retry:`})`
      )
    ),
  });
}

async function getLatestEffectiveStreakSettlementEvent(
  executor: Pick<Database, "query">,
  userId: string,
  idempotencyKey: string
) {
  const original = await getLatestStreakSettlementEvent(
    executor,
    userId,
    idempotencyKey
  );
  if (!original) {
    return null;
  }
  const replacements = await executor.query.xpEvent.findMany({
    columns: {
      amount: true,
      id: true,
      idempotencyKey: true,
      metadata: true,
      state: true,
    },
    orderBy: [desc(xpEvent.updatedAt), desc(xpEvent.id)],
    where: and(
      eq(xpEvent.userId, userId),
      sql`${xpEvent.metadata}->>'repricedFromEventId' = ${original.id}`
    ),
  });
  if (replacements.length === 0) {
    return original;
  }
  const replacementReversals = await executor.query.xpEvent.findMany({
    columns: { reversesEventId: true },
    where: and(
      eq(xpEvent.kind, "reversal"),
      eq(xpEvent.state, "posted"),
      inArray(
        xpEvent.reversesEventId,
        replacements.map(({ id }) => id)
      )
    ),
  });
  const reversedReplacementIds = new Set(
    replacementReversals.flatMap(({ reversesEventId }) =>
      reversesEventId ? [reversesEventId] : []
    )
  );
  return (
    replacements.find(({ id }) => !reversedReplacementIds.has(id)) ?? original
  );
}

async function getXpSettlementEvent(
  executor: Pick<Database, "query">,
  userId: string,
  idempotencyKey: string
) {
  const original = await getLatestEffectiveStreakSettlementEvent(
    executor,
    userId,
    idempotencyKey
  );
  if (!original || original.state !== "cancelled") {
    return original ?? null;
  }
  return (
    (await executor.query.xpEvent.findFirst({
      columns: { amount: true, id: true, metadata: true, state: true },
      where: and(
        eq(xpEvent.userId, userId),
        eq(xpEvent.state, "posted"),
        sql`${xpEvent.metadata}->>'releasedPendingEventId' = ${original.id}`
      ),
    })) ?? original
  );
}

async function getRetryableStreakIdempotencyKey(
  executor: Pick<Database, "query">,
  userId: string,
  baseKey: string,
  now: Date
) {
  const latest = await getLatestStreakSettlementEvent(
    executor,
    userId,
    baseKey
  );
  if (!latest) {
    return baseKey;
  }
  const reversal =
    latest.state === "posted"
      ? await executor.query.xpEvent.findFirst({
          columns: { id: true },
          where: and(
            eq(xpEvent.kind, "reversal"),
            eq(xpEvent.reversesEventId, latest.id),
            eq(xpEvent.state, "posted")
          ),
        })
      : null;
  return latest.state === "cancelled" || reversal
    ? `${baseKey}:retry:${now.getTime()}`
    : latest.idempotencyKey;
}

function getChallengeCompletionEvent(
  executor: Pick<Database, "query">,
  userId: string,
  streak: {
    challengeCompletedAt: Date | null;
    challengeCompletedDayKey: string | null;
    challengeTarget: number | null;
  }
) {
  const target = streakChallengeTargetSchema.safeParse(
    streak.challengeTarget
  ).data;
  if (
    !streak.challengeCompletedAt ||
    !streak.challengeCompletedDayKey ||
    !target
  ) {
    return null;
  }
  return getXpSettlementEvent(
    executor,
    userId,
    `streak-challenge:${streak.challengeCompletedDayKey}:${target}`
  );
}

function getEffectiveCurrentStreak(
  streak: { currentStreak: number; lastCompletedLocalDate: string | null },
  currentLocalDate: string,
  missedDaysProtected: boolean
) {
  return streak.currentStreak > 0 &&
    (streak.lastCompletedLocalDate === currentLocalDate ||
      streak.lastCompletedLocalDate ===
        getPreviousLocalDate(currentLocalDate) ||
      missedDaysProtected)
    ? streak.currentStreak
    : 0;
}

export class StreakError extends Error {
  readonly code: StreakErrorCode;

  constructor(code: StreakErrorCode) {
    super(code);
    this.name = "StreakError";
    this.code = code;
  }
}

export async function isStreakAvailable(executor: Pick<Database, "select">) {
  if (
    !env.XP_ECONOMY_ENABLED ||
    !env.XP_ACCRUAL_ENABLED ||
    !env.DAILY_STREAK_ENABLED
  ) {
    return false;
  }
  return (await readProgressionActivationDate(executor)) !== null;
}

async function isEligible(
  executor: StreakExecutor,
  userId: string,
  impersonated: boolean,
  now: Date,
  lockAccount = false
) {
  if (impersonated) {
    return false;
  }
  let account;
  if (lockAccount) {
    const [lockedAccount] = await executor
      .select({
        banExpires: user.banExpires,
        banned: user.banned,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    account = lockedAccount;
  } else {
    account = await executor.query.user.findFirst({
      columns: { banExpires: true, banned: true, emailVerified: true },
      where: eq(user.id, userId),
    });
  }
  const wallet = await executor.query.eterisWallet.findFirst({
    columns: { status: true },
    where: eq(eterisWallet.userId, userId),
  });
  return Boolean(
    account?.emailVerified &&
    !isUserBanActive(account, now) &&
    (!wallet || wallet.status === "active")
  );
}

function getDayKey(userId: string, timezoneVersion: number, localDate: string) {
  return `${userId}:${timezoneVersion}:${localDate}`;
}

async function lockStreak(
  tx: StreakExecutor,
  userId: string,
  timezone: string,
  now: Date
) {
  await tx
    .insert(userStreak)
    .values({ timezone, updatedAt: now, userId })
    .onConflictDoNothing({ target: userStreak.userId });
  const [streak] = await tx
    .select()
    .from(userStreak)
    .where(eq(userStreak.userId, userId))
    .for("update");
  if (!streak) {
    throw new Error("No se pudo bloquear la Racha de la cuenta.");
  }
  return streak;
}

type PendingTimezoneTransition = {
  availableAt: Date;
  destinationTimezone: string;
  effectiveAt: Date;
  requestedAt: Date;
  sourceTimezone: string;
};

function getPendingTimezoneTransition(streak: {
  pendingTimezone: string | null;
  timezone: string;
  timezoneChangeAvailableAt: Date | null;
  timezoneChangeEffectiveAt: Date | null;
}): PendingTimezoneTransition | null {
  if (
    !streak.pendingTimezone ||
    !streak.timezoneChangeAvailableAt ||
    !streak.timezoneChangeEffectiveAt
  ) {
    return null;
  }
  return {
    availableAt: streak.timezoneChangeAvailableAt,
    destinationTimezone: streak.pendingTimezone,
    effectiveAt: streak.timezoneChangeEffectiveAt,
    requestedAt: new Date(
      streak.timezoneChangeAvailableAt.getTime() - TIMEZONE_CHANGE_COOLDOWN_MS
    ),
    sourceTimezone: streak.timezone,
  };
}

function isPartialTimezoneDay(
  transition: PendingTimezoneTransition,
  now: Date
) {
  if (now >= transition.effectiveAt) {
    return false;
  }
  return (
    now >=
    getStreakDayPeriod(transition.requestedAt, transition.sourceTimezone).endsAt
  );
}

async function getProtectionState(
  executor: StreakExecutor,
  timezone: string,
  lastCompletedLocalDate: string | null,
  currentPeriod: ReturnType<typeof getStreakDayPeriod>
) {
  const firstMissedLocalDate = lastCompletedLocalDate
    ? getNextLocalDate(lastCompletedLocalDate)
    : null;
  const hasMissedDays = Boolean(
    firstMissedLocalDate && firstMissedLocalDate < currentPeriod.localDate
  );
  const firstMissedDeadline =
    hasMissedDays && firstMissedLocalDate
      ? getStreakDayPeriodForLocalDate(firstMissedLocalDate, timezone).endsAt
      : null;
  const lastMissedDeadline = hasMissedDays
    ? getStreakDayPeriodForLocalDate(
        getPreviousLocalDate(currentPeriod.localDate),
        timezone
      ).endsAt
    : null;
  const firstRelevantDeadline = firstMissedDeadline ?? currentPeriod.endsAt;
  const windows = await executor.query.streakProtectionWindow.findMany({
    columns: { endsAt: true, startsAt: true },
    where: and(
      lte(streakProtectionWindow.startsAt, currentPeriod.endsAt),
      gt(streakProtectionWindow.endsAt, firstRelevantDeadline)
    ),
  });
  const isProtected = (deadline: Date) =>
    windows.some(
      (window) => window.startsAt <= deadline && deadline < window.endsAt
    );
  let nextUncoveredDeadline = firstMissedDeadline;
  for (const window of windows.toSorted(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  )) {
    if (
      !nextUncoveredDeadline ||
      !lastMissedDeadline ||
      nextUncoveredDeadline > lastMissedDeadline
    ) {
      break;
    }
    if (window.endsAt <= nextUncoveredDeadline) {
      continue;
    }
    if (window.startsAt > nextUncoveredDeadline) {
      break;
    }
    nextUncoveredDeadline = getStreakDayPeriod(
      new Date(window.endsAt.getTime() - 1),
      timezone
    ).endsAt;
  }
  return {
    currentDayProtected: isProtected(currentPeriod.endsAt),
    missedDaysProtected:
      lastMissedDeadline && nextUncoveredDeadline
        ? nextUncoveredDeadline > lastMissedDeadline
        : false,
  };
}

async function preservesContinuityIntoTimezoneChange(
  executor: StreakExecutor,
  streak: Awaited<ReturnType<typeof lockStreak>>,
  transition: PendingTimezoneTransition
) {
  if (!(streak.currentStreak && streak.lastCompletedLocalDate)) {
    return false;
  }
  const oldDay = getStreakDayPeriod(
    transition.requestedAt,
    transition.sourceTimezone
  );
  if (streak.lastCompletedLocalDate === oldDay.localDate) {
    return true;
  }
  const protection = await getProtectionState(
    executor,
    transition.sourceTimezone,
    streak.lastCompletedLocalDate,
    getStreakDayPeriodForLocalDate(
      getNextLocalDate(oldDay.localDate),
      transition.sourceTimezone
    )
  );
  return protection.missedDaysProtected;
}

async function resolveTimezoneIfDue(
  executor: StreakExecutor,
  streak: Awaited<ReturnType<typeof lockStreak>>,
  now: Date
) {
  const transition = getPendingTimezoneTransition(streak);
  if (!transition || now < transition.effectiveAt) {
    return streak;
  }

  const timezone = transition.destinationTimezone;
  const timezoneVersion = streak.timezoneVersion + 1;
  const currentStreak = (await preservesContinuityIntoTimezoneChange(
    executor,
    streak,
    transition
  ))
    ? streak.currentStreak
    : 0;
  const destinationDay = getStreakDayPeriod(transition.effectiveAt, timezone);
  const lastCompletedLocalDate = currentStreak
    ? getPreviousLocalDate(destinationDay.localDate)
    : streak.lastCompletedLocalDate;
  return {
    ...streak,
    currentEvidence: {},
    currentEvidenceDayKey: null,
    currentStreak,
    lastCompletedLocalDate,
    pendingTimezone: null,
    timezone,
    timezoneChangeEffectiveAt: null,
    timezoneVersion,
  };
}

async function activateTimezoneIfDue(
  tx: StreakExecutor,
  streak: Awaited<ReturnType<typeof lockStreak>>,
  now: Date
) {
  const activated = await resolveTimezoneIfDue(tx, streak, now);
  if (activated === streak) {
    return streak;
  }
  await tx
    .update(userStreak)
    .set({
      currentEvidence: {},
      currentEvidenceDayKey: null,
      currentStreak: activated.currentStreak,
      lastCompletedLocalDate: activated.lastCompletedLocalDate,
      pendingTimezone: null,
      timezone: activated.timezone,
      timezoneChangeEffectiveAt: null,
      timezoneVersion: activated.timezoneVersion,
      updatedAt: now,
    })
    .where(eq(userStreak.userId, streak.userId));
  return activated;
}

export async function applyStreakEvidenceInTransaction(
  tx: StreakExecutor,
  evidence: StreakEvidence,
  now: Date,
  processingNow = now
) {
  if (!(await isStreakAvailable(tx))) {
    return { available: false, completed: false } as const;
  }
  if (
    !(await isEligible(
      tx,
      evidence.userId,
      evidence.impersonated,
      processingNow
    )) ||
    (evidence.kind === "contribution" &&
      (evidence.source.kind === "review"
        ? !ratingReviewSchema.safeParse(evidence.text).success
        : normalizeContributionText(evidence.text).length <
          STREAK_CONTRIBUTION_MIN_LENGTH))
  ) {
    return { available: true, completed: false } as const;
  }

  const existing = await tx.query.userStreak.findFirst({
    where: eq(userStreak.userId, evidence.userId),
  });
  const timezone = existing?.timezone ?? evidence.timezone;
  if (!timezone || !isValidIanaTimezone(timezone)) {
    return { available: true, completed: false } as const;
  }

  const lockedStreak = await lockStreak(tx, evidence.userId, timezone, now);
  const transition = getPendingTimezoneTransition(lockedStreak);
  if (transition && isPartialTimezoneDay(transition, now)) {
    return {
      available: true,
      completed: false,
      partialTimezoneDay: true,
    } as const;
  }
  const streak = await activateTimezoneIfDue(tx, lockedStreak, now);
  const period = getStreakDayPeriod(now, streak.timezone);
  if (
    streak.lastCompletedLocalDate &&
    period.localDate < streak.lastCompletedLocalDate
  ) {
    return { available: true, completed: false } as const;
  }
  const currentDayKey = getDayKey(
    evidence.userId,
    streak.timezoneVersion,
    period.localDate
  );
  if (streak.lastCompletedDayKey === currentDayKey) {
    return {
      available: true,
      completed: true,
      currentStreak: streak.currentStreak,
      replayed: true,
    } as const;
  }
  const existingEvidenceLocalDate = streak.currentEvidenceDayKey?.slice(
    -period.localDate.length
  );
  if (
    existingEvidenceLocalDate &&
    existingEvidenceLocalDate > period.localDate
  ) {
    return { available: true, completed: false } as const;
  }

  const protection = await getProtectionState(
    tx,
    streak.timezone,
    streak.lastCompletedLocalDate,
    period
  );
  if (protection.currentDayProtected) {
    return {
      available: true,
      completed: false,
      protectedDay: true,
    } as const;
  }

  const correlation = evidence.integrity?.correlation ?? {
    deviceHash: null,
    ipPrefixHash: null,
  };
  let currentRiskSignals: IntegrityRiskSignal[] = [];
  if (correlation.deviceHash && evidence.kind !== "contribution") {
    try {
      currentRiskSignals = await observeStreakActionRisk(
        await getRedis(),
        evidence.userId,
        correlation.deviceHash,
        evidence.kind,
        now
      );
    } catch {
      currentRiskSignals = [
        {
          count: 1,
          kind:
            evidence.kind === "reading"
              ? "rejected_sequence"
              : "like_toggle_velocity",
        },
      ];
    }
  }

  let path: "contribution" | "mixed_discovery" | "reading";
  let source:
    | { id: string; kind: "comment" | "review" }
    | { actionKinds: ("bookmark" | "follow" | "rating")[]; readingPages: 1 }
    | { pageKeys: string[] };
  let discoveryCandidates =
    streak.currentEvidenceDayKey === currentDayKey
      ? (streak.currentEvidence.discoveryCandidates ?? [])
      : [];
  let readingPageKeys =
    streak.currentEvidenceDayKey === currentDayKey
      ? (streak.currentEvidence.readingPageKeys ?? [])
      : [];

  if (evidence.kind === "contribution") {
    path = "contribution";
    ({ source } = evidence);
  } else {
    const sameDay = streak.currentEvidenceDayKey === currentDayKey;
    if (evidence.kind === "reading") {
      const pageKey = `${evidence.comicId}:${evidence.page}`;
      readingPageKeys = readingPageKeys.includes(pageKey)
        ? readingPageKeys
        : [...readingPageKeys, pageKey].slice(
            0,
            STREAK_READING_PAGE_REQUIREMENT
          );
    } else {
      const consumed = await tx.query.streakDiscoveryReceipt.findFirst({
        columns: { dayKey: true },
        where: and(
          eq(streakDiscoveryReceipt.userId, evidence.userId),
          eq(streakDiscoveryReceipt.actionKind, evidence.actionKind),
          eq(streakDiscoveryReceipt.contentKey, evidence.contentKey)
        ),
      });
      if (
        !consumed &&
        discoveryCandidates.length < STREAK_DISCOVERY_ACTION_REQUIREMENT &&
        !discoveryCandidates.some(
          ({ contentKey }) => contentKey === evidence.contentKey
        )
      ) {
        discoveryCandidates = [
          ...discoveryCandidates,
          {
            actionKind: evidence.actionKind,
            contentKey: evidence.contentKey,
          },
        ];
      }
    }

    if (readingPageKeys.length >= STREAK_READING_PAGE_REQUIREMENT) {
      path = "reading";
      source = { pageKeys: readingPageKeys };
    } else if (
      readingPageKeys.length > 0 &&
      discoveryCandidates.length >= STREAK_DISCOVERY_ACTION_REQUIREMENT
    ) {
      path = "mixed_discovery";
      source = {
        actionKinds: discoveryCandidates.map(({ actionKind }) => actionKind),
        readingPages: 1,
      };
    } else {
      await tx
        .update(userStreak)
        .set({
          currentEvidence: {
            ...(sameDay ? streak.currentEvidence : {}),
            discoveryCandidates,
            readingPageKeys,
          },
          currentEvidenceDayKey: currentDayKey,
          updatedAt: now,
        })
        .where(eq(userStreak.userId, evidence.userId));
      return {
        available: true,
        completed: false,
        reading: {
          progress: readingPageKeys.length,
          required: STREAK_READING_PAGE_REQUIREMENT,
        },
        mixedDiscovery: {
          discovery: {
            progress: discoveryCandidates.length,
            required: STREAK_DISCOVERY_ACTION_REQUIREMENT,
          },
          reading: {
            progress: Math.min(readingPageKeys.length, 1),
            required: 1,
          },
        },
      } as const;
    }
  }

  const continues =
    streak.currentStreak > 0 &&
    (streak.lastCompletedLocalDate === getPreviousLocalDate(period.localDate) ||
      protection.missedDaysProtected);
  const currentStreak = continues ? streak.currentStreak + 1 : 1;
  const amount = getDailyStreakReward(currentStreak);
  const previousDayKey = continues ? streak.lastCompletedDayKey : null;
  const risk = await assessStreakIntegrityRisk(
    tx,
    evidence.userId,
    correlation,
    now,
    currentRiskSignals
  );
  const retainedStepUpRequired = Boolean(
    streak.currentEvidenceDayKey === currentDayKey &&
    streak.currentEvidence.pendingCompletion
  );
  const stepUpRequired =
    risk.disposition === "step_up" || retainedStepUpRequired;
  let stepUpCleared = evidence.integrity?.stepUpCleared ?? false;
  if (stepUpRequired && evidence.integrity?.stepUpCleared === undefined) {
    try {
      stepUpCleared = await getStreakStepUpClearance(
        await getRedis(),
        evidence.userId,
        correlation.deviceHash
      );
    } catch {
      stepUpCleared = false;
    }
  }
  if (stepUpRequired && !stepUpCleared) {
    const trigger =
      evidence.kind === "contribution"
        ? {
            kind: "contribution" as const,
            normalizedLength: normalizeContributionText(evidence.text).length,
            source: evidence.source,
          }
        : evidence.kind === "reading"
          ? {
              comicId: evidence.comicId,
              kind: "reading" as const,
              page: evidence.page,
            }
          : {
              actionKind: evidence.actionKind,
              contentKey: evidence.contentKey,
              kind: "discovery" as const,
            };
    await tx
      .update(userStreak)
      .set({
        currentEvidence: {
          ...(streak.currentEvidenceDayKey === currentDayKey
            ? streak.currentEvidence
            : {}),
          discoveryCandidates,
          pendingCompletion:
            streak.currentEvidenceDayKey === currentDayKey &&
            streak.currentEvidence.pendingCompletion
              ? streak.currentEvidence.pendingCompletion
              : {
                  path,
                  receivedAt: now.toISOString(),
                  trigger,
                },
          readingPageKeys,
        },
        currentEvidenceDayKey: currentDayKey,
        updatedAt: now,
      })
      .where(eq(userStreak.userId, evidence.userId));
    return {
      available: true,
      completed: false,
      stepUpRequired: true,
    } as const;
  }
  if (
    !(await isEligible(
      tx,
      evidence.userId,
      evidence.impersonated,
      processingNow,
      true
    ))
  ) {
    return { available: true, completed: false } as const;
  }
  const reviewRisk = classifyStreakReviewRisk(risk.signals);
  const assessment = reviewRisk
    ? {
        correlation,
        disposition: reviewRisk,
        recordSignals: currentRiskSignals,
        signals: risk.signals,
        summary:
          reviewRisk === "high"
            ? "La finalizaci\u00F3n de Racha requiere revisi\u00F3n humana."
            : "La finalizaci\u00F3n de Racha qued\u00F3 pendiente de revisi\u00F3n.",
      }
    : ({ disposition: "low" } as const);
  if (path === "mixed_discovery") {
    await tx.insert(streakDiscoveryReceipt).values(
      discoveryCandidates.map(({ actionKind, contentKey }) => ({
        actionKind,
        contentKey,
        dayKey: currentDayKey,
        usedAt: now,
        userId: evidence.userId,
      }))
    );
  }
  const dailyCommand = {
    amount,
    idempotencyKey: await getRetryableStreakIdempotencyKey(
      tx,
      evidence.userId,
      `streak-day:${currentDayKey}`,
      now
    ),
    kind: "streak_day",
    metadata: {
      dayKey: currentDayKey,
      localDate: period.localDate,
      path,
      periodEndsAt: period.endsAt.toISOString(),
      periodStartsAt: period.startsAt.toISOString(),
      previousDayKey,
      rewardConfigVersion: DAILY_STREAK_REWARD_CONFIG_VERSION,
      source,
      sourceTimestamp: now.toISOString(),
      timezone: streak.timezone,
      timezoneVersion: streak.timezoneVersion,
    },
    reasonCode: "streak_day_completed",
    sourceCreatedAt: now,
    sourceRef:
      path === "contribution" && evidence.kind === "contribution"
        ? `${evidence.source.kind}:${evidence.source.id}`
        : path === "reading" && evidence.kind === "reading"
          ? `comic:${evidence.comicId}:page:${evidence.page}`
          : `streak-mixed:${currentDayKey}`,
    userId: evidence.userId,
  } as const;
  let pendingCase: { availableAt: Date | null; caseId: string } | null = null;
  let result;
  if (assessment.disposition === "low") {
    result = await postXpEventInTransaction(tx, dailyCommand, now);
    if ("projectionMismatch" in result && result.projectionMismatch) {
      throw new Error("STREAK_XP_SETTLEMENT_FAILED");
    }
    await notifyXpSettlementInTransaction(tx, evidence.userId, result);
  } else {
    const integrityResult = await settleXpWithIntegrityInTransaction(
      tx,
      dailyCommand,
      assessment,
      now
    );
    if ("releasedSettlements" in integrityResult) {
      for (const settlement of integrityResult.releasedSettlements ?? []) {
        await notifyXpSettlementInTransaction(tx, evidence.userId, settlement);
      }
    }
    if (integrityResult.outcome !== "pending" || !integrityResult.caseId) {
      throw new Error("STREAK_INTEGRITY_SETTLEMENT_FAILED");
    }
    pendingCase = {
      availableAt:
        "availableAt" in integrityResult
          ? (integrityResult.availableAt ?? null)
          : null,
      caseId: integrityResult.caseId,
    };
    result = integrityResult;
  }
  const challengeTarget = streakChallengeTargetSchema.safeParse(
    streak.challengeTarget
  ).data;
  const challengeAmount =
    challengeTarget &&
    !streak.challengeCompletedAt &&
    currentStreak >= challengeTarget
      ? getStreakChallengeReward(challengeTarget)
      : null;
  let challenge;
  if (challengeAmount) {
    const challengeIdempotencyKey = await getRetryableStreakIdempotencyKey(
      tx,
      evidence.userId,
      `streak-challenge:${currentDayKey}:${challengeTarget}`,
      now
    );
    const challengeCommand = {
      amount: challengeAmount,
      idempotencyKey: challengeIdempotencyKey,
      kind: "streak_challenge",
      metadata: {
        completedDayKey: currentDayKey,
        dailyEventId: result.eventId,
        rewardConfigVersion: DAILY_STREAK_REWARD_CONFIG_VERSION,
        target: challengeTarget,
      },
      reasonCode: "streak_challenge_completed",
      sourceCreatedAt: now,
      sourceRef: challengeIdempotencyKey,
      userId: evidence.userId,
    } as const;
    let challengeResult;
    if (pendingCase) {
      challengeResult = await createPendingXpEventInTransaction(
        tx,
        {
          ...challengeCommand,
          ...(pendingCase.availableAt
            ? { availableAt: pendingCase.availableAt }
            : {}),
          integrityCaseId: pendingCase.caseId,
        },
        now
      );
    } else {
      challengeResult = await postXpEventInTransaction(
        tx,
        challengeCommand,
        now
      );
      if (
        "projectionMismatch" in challengeResult &&
        challengeResult.projectionMismatch
      ) {
        throw new Error("STREAK_CHALLENGE_SETTLEMENT_FAILED");
      }
      await notifyXpSettlementInTransaction(
        tx,
        evidence.userId,
        challengeResult
      );
    }
    const challengePending =
      pendingCase !== null ||
      ("pendingXp" in challengeResult && Boolean(challengeResult.pendingXp));
    const challengeSettledAmount = challengePending
      ? challengeAmount
      : "settledXp" in challengeResult
        ? challengeResult.settledXp
        : challengeAmount;
    const challengeOutcome = challengePending
      ? "pending"
      : challengeSettledAmount < challengeAmount
        ? "capped"
        : "immediate";
    await createUserNotification(tx, {
      dedupeKey: challengeIdempotencyKey,
      description: challengePending
        ? `Completaste tu desaf\u00EDo de ${challengeTarget} d\u00EDas. Tus ${challengeAmount} XP quedaron pendientes de revisi\u00F3n.`
        : challengeOutcome === "capped"
          ? challengeSettledAmount === 0
            ? `Completaste tu desaf\u00EDo de ${challengeTarget} d\u00EDas. No se sum\u00F3 XP porque alcanzaste el m\u00E1ximo.`
            : `Completaste tu desaf\u00EDo de ${challengeTarget} d\u00EDas. Se sumaron ${challengeSettledAmount} XP; no se sum\u00F3 el resto porque alcanzaste el m\u00E1ximo.`
          : `Completaste tu desaf\u00EDo de ${challengeTarget} d\u00EDas y recibiste ${challengeAmount} XP.`,
      metadata: {
        category: "streak_challenge_completed",
        outcome: challengeOutcome,
        target: challengeTarget,
        xp: challengeSettledAmount,
      },
      publishedAt: processingNow,
      targetUserId: evidence.userId,
      title: "\u00A1Desaf\u00EDo de Racha completado!",
    });

    challenge = {
      amount: challengeSettledAmount,
      completed: true as const,
      eventId: challengeResult.eventId,
      outcome: challengeOutcome,
      target: challengeTarget,
    };
  }

  await tx
    .update(userStreak)
    .set({
      bestStreak: Math.max(streak.bestStreak, currentStreak),
      ...(challenge && {
        challengeCompletedAt: now,
        challengeCompletedDayKey: currentDayKey,
      }),
      currentEvidence: { completedPath: path },
      currentEvidenceDayKey: currentDayKey,
      currentStreak,
      lastCompletedAt: now,
      lastCompletedDayKey: currentDayKey,
      lastCompletedLocalDate: period.localDate,
      updatedAt: now,
    })
    .where(eq(userStreak.userId, evidence.userId));

  return {
    amount,
    available: true,
    ...(challenge && { challenge }),
    completed: true,
    currentStreak,
    ...(!result.replayed && {
      dayCompletion: {
        outcome:
          pendingCase !== null ||
          ("pendingXp" in result && Boolean(result.pendingXp))
            ? ("pending" as const)
            : ("immediate" as const),
        path,
        tier: amount,
      },
    }),
    eventId: result.eventId,
    replayed: result.replayed,
    ...(pendingCase !== null && { pendingXp: true }),
  } as const;
}

export async function completeStreakStepUpInTransaction(
  tx: StreakExecutor,
  userId: string,
  correlation: StreakIntegrityRequest["correlation"],
  now: Date
) {
  if (!(await isStreakAvailable(tx))) {
    return { available: false, completed: false } as const;
  }
  if (!(await isEligible(tx, userId, false, now))) {
    return { available: true, completed: false } as const;
  }

  const existing = await tx.query.userStreak.findFirst({
    where: eq(userStreak.userId, userId),
  });
  if (!existing) {
    return { available: true, completed: false } as const;
  }
  const streak = await lockStreak(tx, userId, existing.timezone, now);
  const retained = streak.currentEvidence.pendingCompletion;
  if (!(retained && streak.currentEvidenceDayKey)) {
    return { available: true, completed: false } as const;
  }
  const receivedAt = new Date(retained.receivedAt);
  const period = getStreakDayPeriod(receivedAt, streak.timezone);
  const dayKey = getDayKey(userId, streak.timezoneVersion, period.localDate);
  if (
    !Number.isFinite(receivedAt.getTime()) ||
    dayKey !== streak.currentEvidenceDayKey ||
    now >= period.endsAt
  ) {
    await tx
      .update(userStreak)
      .set({ currentEvidence: {}, currentEvidenceDayKey: null, updatedAt: now })
      .where(eq(userStreak.userId, userId));
    return {
      available: true,
      completed: false,
      stepUpExpired: true,
    } as const;
  }

  await grantStreakStepUpClearance(
    await getRedis(),
    userId,
    correlation.deviceHash
  );

  const base = {
    impersonated: false,
    integrity: { correlation, stepUpCleared: true },
    userId,
  };
  const evidence: StreakEvidence =
    retained.trigger.kind === "contribution"
      ? {
          ...base,
          kind: "contribution",
          source: retained.trigger.source,
          text: "x".repeat(
            retained.trigger.source.kind === "review"
              ? Math.max(
                  retained.trigger.normalizedLength,
                  RATING_REVIEW_MIN_LENGTH
                )
              : retained.trigger.normalizedLength
          ),
        }
      : retained.trigger.kind === "reading"
        ? {
            ...base,
            comicId: retained.trigger.comicId,
            kind: "reading",
            page: retained.trigger.page,
          }
        : {
            ...base,
            actionKind: retained.trigger.actionKind,
            contentKey: retained.trigger.contentKey,
            kind: "discovery",
          };
  return applyStreakEvidenceInTransaction(tx, evidence, receivedAt, now);
}

export async function getStreakState(db: Database, userId: string, now: Date) {
  if (!(await isStreakAvailable(db))) {
    return { available: false } as const;
  }
  const storedStreak = await db.query.userStreak.findFirst({
    where: eq(userStreak.userId, userId),
  });
  if (!storedStreak) {
    return { available: true, initialized: false } as const;
  }

  const transition = getPendingTimezoneTransition(storedStreak);
  if (transition && isPartialTimezoneDay(transition, now)) {
    const currentStreak = (await preservesContinuityIntoTimezoneChange(
      db,
      storedStreak,
      transition
    ))
      ? storedStreak.currentStreak
      : 0;
    const nextStreak = currentStreak + 1;
    const challengeEvent = await getChallengeCompletionEvent(
      db,
      userId,
      storedStreak
    );
    return {
      atRisk: false,
      available: true,
      bestStreak: storedStreak.bestStreak,
      challenge: getChallengeState(
        storedStreak,
        currentStreak,
        false,
        challengeEvent
      ),
      contribution: { completed: false, progress: 0, required: 1 },
      currentStreak,
      deadline: transition.effectiveAt.toISOString(),
      initialized: true,
      localDate: getStreakDayPeriod(
        transition.effectiveAt,
        transition.destinationTimezone
      ).localDate,
      mixedDiscovery: {
        completed: false,
        discovery: {
          progress: 0,
          required: STREAK_DISCOVERY_ACTION_REQUIREMENT,
        },
        reading: { progress: 0, required: 1 },
      },
      partialTimezoneDay: true,
      pendingTimezone: transition.destinationTimezone,
      pendingXp: false,
      protectedDay: false,
      reading: {
        completed: false,
        progress: 0,
        required: STREAK_READING_PAGE_REQUIREMENT,
      },
      timezone: storedStreak.timezone,
      stepUpRequired: false,
      timezoneChangeAvailableAt: transition.availableAt.toISOString(),
      timezoneChangeAllowed: false,
      timezoneChangeEffectiveAt: transition.effectiveAt.toISOString(),
      todayXp: 0,
      upcomingReward:
        DAILY_STREAK_REWARDS.find(({ fromDay }) => fromDay >= nextStreak) ??
        DAILY_STREAK_REWARDS.at(-1)!,
    } as const;
  }

  const streak = await resolveTimezoneIfDue(db, storedStreak, now);
  const period = getStreakDayPeriod(now, streak.timezone);
  const currentDayKey = getDayKey(
    userId,
    streak.timezoneVersion,
    period.localDate
  );
  const event =
    streak.lastCompletedDayKey === currentDayKey
      ? await getXpSettlementEvent(db, userId, `streak-day:${currentDayKey}`)
      : null;
  const challengeEvent = await getChallengeCompletionEvent(db, userId, streak);
  const completed = streak.lastCompletedDayKey === currentDayKey;
  const protection = completed
    ? { currentDayProtected: false, missedDaysProtected: false }
    : await getProtectionState(
        db,
        streak.timezone,
        streak.lastCompletedLocalDate,
        period
      );
  const currentStreak = getEffectiveCurrentStreak(
    streak,
    period.localDate,
    protection.missedDaysProtected
  );
  // Buffered comic retries renew outside this transaction, so a read cannot
  // know when prior-day evidence is safe to delete. The next accepted action
  // replaces this bounded payload.
  const currentEvidence =
    !protection.currentDayProtected &&
    streak.currentEvidenceDayKey === currentDayKey
      ? streak.currentEvidence
      : {};
  const completionPath =
    event?.metadata &&
    typeof event.metadata === "object" &&
    "path" in event.metadata
      ? event.metadata.path
      : currentEvidence.completedPath;
  const readingProgress =
    completionPath === "reading"
      ? STREAK_READING_PAGE_REQUIREMENT
      : !protection.currentDayProtected &&
          streak.currentEvidenceDayKey === currentDayKey
        ? Math.min(
            streak.currentEvidence.readingPageKeys?.length ?? 0,
            STREAK_READING_PAGE_REQUIREMENT
          )
        : 0;
  const mixedCompleted = completionPath === "mixed_discovery";
  const nextStreak = currentStreak + 1;
  const upcoming = DAILY_STREAK_REWARDS.find(
    ({ fromDay }) => fromDay >= nextStreak
  );

  return {
    atRisk: !completed && !protection.currentDayProtected && currentStreak > 0,
    available: true,
    bestStreak: streak.bestStreak,
    challenge: getChallengeState(
      streak,
      currentStreak,
      completed,
      challengeEvent
    ),
    contribution: {
      completed: completionPath === "contribution",
      progress: completionPath === "contribution" ? 1 : 0,
      required: 1,
    },
    currentStreak,
    deadline: period.endsAt.toISOString(),
    initialized: true,
    localDate: period.localDate,
    mixedDiscovery: {
      completed: mixedCompleted,
      discovery: {
        progress: mixedCompleted
          ? STREAK_DISCOVERY_ACTION_REQUIREMENT
          : Math.min(
              currentEvidence.discoveryCandidates?.length ?? 0,
              STREAK_DISCOVERY_ACTION_REQUIREMENT
            ),
        required: STREAK_DISCOVERY_ACTION_REQUIREMENT,
      },
      reading: {
        progress: mixedCompleted
          ? 1
          : Math.min(currentEvidence.readingPageKeys?.length ?? 0, 1),
        required: 1,
      },
    },
    partialTimezoneDay: false,
    pendingTimezone: streak.pendingTimezone,
    pendingXp: event?.state === "pending",
    protectedDay: protection.currentDayProtected,
    reading: {
      completed: completionPath === "reading",
      progress: readingProgress,
      required: STREAK_READING_PAGE_REQUIREMENT,
    },
    stepUpRequired: Boolean(currentEvidence.pendingCompletion),
    timezone: streak.timezone,
    timezoneChangeAvailableAt:
      streak.timezoneChangeAvailableAt?.toISOString() ?? null,
    timezoneChangeAllowed:
      !streak.pendingTimezone &&
      (!streak.timezoneChangeAvailableAt ||
        now >= streak.timezoneChangeAvailableAt),
    timezoneChangeEffectiveAt:
      streak.timezoneChangeEffectiveAt?.toISOString() ?? null,
    todayXp: protection.currentDayProtected
      ? 0
      : completed
        ? event?.state === "cancelled"
          ? 0
          : (event?.amount ?? 0)
        : getDailyStreakReward(Math.max(1, nextStreak)),
    upcomingReward: upcoming ?? DAILY_STREAK_REWARDS.at(-1)!,
  } as const;
}

export async function selectStreakChallengeInTransaction(
  tx: StreakExecutor,
  userId: string,
  target: StreakChallengeTarget,
  now: Date
) {
  if (!(await isStreakAvailable(tx))) {
    return { available: false } as const;
  }
  if (!streakChallengeTargetSchema.safeParse(target).success) {
    throw new StreakError("INVALID_CHALLENGE_TARGET");
  }
  if (!(await isEligible(tx, userId, false, now))) {
    return { available: true, initialized: false } as const;
  }
  const existing = await tx.query.userStreak.findFirst({
    where: eq(userStreak.userId, userId),
  });
  if (!existing) {
    return { available: true, initialized: false } as const;
  }

  const lockedStreak = await lockStreak(tx, userId, existing.timezone, now);
  if (lockedStreak.challengeTarget) {
    throw new StreakError("CHALLENGE_ALREADY_SELECTED");
  }
  const transition = getPendingTimezoneTransition(lockedStreak);
  const streak = await activateTimezoneIfDue(tx, lockedStreak, now);
  const period = getStreakDayPeriod(now, streak.timezone);
  const protection = await getProtectionState(
    tx,
    streak.timezone,
    streak.lastCompletedLocalDate,
    period
  );
  const currentStreak =
    transition && isPartialTimezoneDay(transition, now)
      ? (await preservesContinuityIntoTimezoneChange(tx, streak, transition))
        ? streak.currentStreak
        : 0
      : getEffectiveCurrentStreak(
          streak,
          period.localDate,
          protection.missedDaysProtected
        );
  if (target <= currentStreak) {
    throw new StreakError("CHALLENGE_TARGET_REACHED");
  }
  if (currentStreak < 1) {
    throw new StreakError("CHALLENGE_NOT_AVAILABLE");
  }

  await tx
    .update(userStreak)
    .set({ challengeSelectedAt: now, challengeTarget: target, updatedAt: now })
    .where(eq(userStreak.userId, userId));

  return {
    available: true,
    selectedAt: now.toISOString(),
    target,
    upcomingBonus: getStreakChallengeReward(target),
  } as const;
}

export async function setStreakTimezoneInTransaction(
  tx: StreakExecutor,
  userId: string,
  timezone: string,
  now: Date
) {
  if (!(await isStreakAvailable(tx))) {
    return { available: false } as const;
  }
  const canonicalTimezone = getCanonicalIanaTimezone(timezone);
  if (!canonicalTimezone) {
    throw new StreakError("INVALID_TIMEZONE");
  }
  if (!(await isEligible(tx, userId, false, now))) {
    return { available: true, initialized: false } as const;
  }
  const lockedStreak = await lockStreak(tx, userId, canonicalTimezone, now);
  const streak = await activateTimezoneIfDue(tx, lockedStreak, now);
  const currentTimezone =
    getCanonicalIanaTimezone(streak.timezone) ?? streak.timezone;
  if (currentTimezone === canonicalTimezone && !streak.pendingTimezone) {
    if (streak.timezone !== currentTimezone) {
      await tx
        .update(userStreak)
        .set({ timezone: currentTimezone, updatedAt: now })
        .where(eq(userStreak.userId, userId));
    }
    return {
      available: true,
      initialized: true,
      timezone: currentTimezone,
    } as const;
  }
  if (streak.pendingTimezone) {
    throw new StreakError("TIMEZONE_CHANGE_PENDING");
  }
  if (
    streak.timezoneChangeAvailableAt &&
    now < streak.timezoneChangeAvailableAt
  ) {
    throw new StreakError("TIMEZONE_COOLDOWN");
  }

  const effectiveAt = getTimezoneChangeEffectiveAt(
    now,
    currentTimezone,
    canonicalTimezone
  );
  const availableAt = new Date(now.getTime() + TIMEZONE_CHANGE_COOLDOWN_MS);
  await tx
    .update(userStreak)
    .set({
      pendingTimezone: canonicalTimezone,
      timezone: currentTimezone,
      timezoneChangeAvailableAt: availableAt,
      timezoneChangeEffectiveAt: effectiveAt,
      updatedAt: now,
    })
    .where(eq(userStreak.userId, userId));

  return {
    available: true,
    initialized: true,
    pendingTimezone: canonicalTimezone,
    timezone: currentTimezone,
    timezoneChangeAvailableAt: availableAt.toISOString(),
    timezoneChangeEffectiveAt: effectiveAt.toISOString(),
  } as const;
}

type StreakLedgerEvent = Pick<
  typeof xpEvent.$inferSelect,
  | "amount"
  | "createdAt"
  | "id"
  | "kind"
  | "metadata"
  | "reversesEventId"
  | "state"
> &
  Partial<
    Pick<
      typeof xpEvent.$inferSelect,
      "availableAt" | "integrityCaseId" | "reasonCode" | "sourceRef"
    >
  >;

type StreakDay = {
  dayKey: string;
  event: StreakLedgerEvent;
  localDate: string;
  previousDayKey: string | null;
};

function getLedgerMetadataString(
  metadata: Record<string, unknown>,
  key: string
) {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStreakDay(event: StreakLedgerEvent): StreakDay | null {
  if (event.kind !== "streak_day") {
    return null;
  }
  const dayKey = getLedgerMetadataString(event.metadata, "dayKey");
  const localDate = getLedgerMetadataString(event.metadata, "localDate");
  const { previousDayKey } = event.metadata;
  return dayKey &&
    localDate &&
    (previousDayKey === null || typeof previousDayKey === "string")
    ? { dayKey, event, localDate, previousDayKey }
    : null;
}

function compareLedgerEvents(a: StreakLedgerEvent, b: StreakLedgerEvent) {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
}

function rebuildStreakProjectionFromLedger(events: StreakLedgerEvent[]) {
  const reversedEventIds = new Set(
    events.flatMap((event) =>
      event.kind === "reversal" &&
      event.state === "posted" &&
      event.reversesEventId
        ? [event.reversesEventId]
        : []
    )
  );
  const activeEvents = events.filter(
    (event) =>
      (event.state === "pending" || event.state === "posted") &&
      !reversedEventIds.has(event.id)
  );
  const logicalDays = new Map<string, StreakDay>();
  for (const event of activeEvents) {
    const day = getStreakDay(event);
    if (!day) {
      continue;
    }
    const existing = logicalDays.get(day.dayKey);
    if (
      !existing ||
      (existing.event.state === "pending" && event.state === "posted") ||
      (existing.event.state === event.state &&
        compareLedgerEvents(existing.event, event) < 0)
    ) {
      logicalDays.set(day.dayKey, day);
    }
  }

  const orderedDays = [...logicalDays.values()].toSorted((a, b) =>
    compareLedgerEvents(a.event, b.event)
  );
  const chainByDayKey = new Map<string, number>();
  const repricedDays: { amount: number; day: StreakDay }[] = [];
  let bestStreak = 0;
  for (const day of orderedDays) {
    const currentStreak = day.previousDayKey
      ? (chainByDayKey.get(day.previousDayKey) ?? 0) + 1
      : 1;
    chainByDayKey.set(day.dayKey, currentStreak);
    bestStreak = Math.max(bestStreak, currentStreak);
    const amount = Math.min(
      day.event.amount,
      getDailyStreakReward(currentStreak)
    );
    if (amount < day.event.amount) {
      repricedDays.push({ amount, day });
    }
  }

  const invalidChallengeEvents: StreakLedgerEvent[] = [];
  const validChallengeEvents = activeEvents
    .filter((event) => event.kind === "streak_challenge")
    .filter((event) => {
      const completedDayKey = getLedgerMetadataString(
        event.metadata,
        "completedDayKey"
      );
      const { target } = event.metadata;
      const valid =
        completedDayKey !== null &&
        typeof target === "number" &&
        Number.isInteger(target) &&
        (chainByDayKey.get(completedDayKey) ?? 0) >= target;
      if (!valid) {
        invalidChallengeEvents.push(event);
      }
      return valid;
    })
    .toSorted(compareLedgerEvents);
  const latestDay = orderedDays.at(-1);
  const latestChallenge = validChallengeEvents.at(-1);

  return {
    invalidChallengeEvents,
    projection: {
      bestStreak,
      challengeCompletedAt: latestChallenge?.createdAt ?? null,
      challengeCompletedDayKey: latestChallenge
        ? getLedgerMetadataString(latestChallenge.metadata, "completedDayKey")
        : null,
      currentStreak: latestDay ? (chainByDayKey.get(latestDay.dayKey) ?? 1) : 0,
      lastCompletedAt: latestDay?.event.createdAt ?? null,
      lastCompletedDayKey: latestDay?.dayKey ?? null,
      lastCompletedLocalDate: latestDay?.localDate ?? null,
    },
    repricedDays,
  };
}

function requireStreakReconciliationSettlement(
  settlement: Awaited<ReturnType<typeof postXpEventInTransaction>>
) {
  if (
    "projectionMismatch" in settlement &&
    settlement.projectionMismatch === true
  ) {
    if (settlement.projectionMismatchWalletIds) {
      throw new ContributionProjectionMismatchError(
        settlement.projectionMismatchWalletIds
      );
    }
    throw new Error("XP_PROJECTION_MISMATCH");
  }
  return settlement;
}

export async function reconcileStreakAfterIntegrityDecisionInTransaction(
  tx: StreakExecutor,
  input: {
    actorUserId: string;
    caseId: string;
    now: Date;
    userId: string;
  }
) {
  const events = await tx
    .select({
      amount: xpEvent.amount,
      availableAt: xpEvent.availableAt,
      createdAt: xpEvent.createdAt,
      id: xpEvent.id,
      integrityCaseId: xpEvent.integrityCaseId,
      kind: xpEvent.kind,
      metadata: xpEvent.metadata,
      reasonCode: xpEvent.reasonCode,
      reversesEventId: xpEvent.reversesEventId,
      sourceRef: xpEvent.sourceRef,
      state: xpEvent.state,
    })
    .from(xpEvent)
    .where(eq(xpEvent.userId, input.userId));
  const rebuilt = rebuildStreakProjectionFromLedger(events);
  const pendingReprices = rebuilt.repricedDays.filter(
    ({ day }) => day.event.state === "pending"
  );
  const pending = [
    ...rebuilt.invalidChallengeEvents.filter(
      ({ state }) => state === "pending"
    ),
    ...pendingReprices.map(({ day }) => day.event),
  ];
  if (pending.length > 0) {
    const progression = await lockUserProgressionInTransaction(
      tx,
      input.userId,
      input.now
    );
    await tx
      .update(xpEvent)
      .set({
        decidedAt: input.now,
        decidedBy: input.actorUserId,
        state: "cancelled",
        updatedAt: input.now,
      })
      .where(
        inArray(
          xpEvent.id,
          pending.map(({ id }) => id)
        )
      );
    await tx
      .update(userProgression)
      .set({
        pendingXp: Math.max(
          0,
          progression.pendingXp -
            pending.reduce((sum, event) => sum + event.amount, 0)
        ),
        updatedAt: input.now,
      })
      .where(eq(userProgression.userId, input.userId));
  }

  const settlements = [];
  for (const { amount, day } of rebuilt.repricedDays) {
    const { event } = day;
    const metadata = {
      ...event.metadata,
      repricedFromEventId:
        getLedgerMetadataString(event.metadata, "repricedFromEventId") ??
        event.id,
    };
    const reasonCode = event.reasonCode ?? "streak_day_repriced";
    const sourceRef = event.sourceRef ?? `streak-day:${day.dayKey}`;
    if (event.state === "pending") {
      if (!event.integrityCaseId) {
        throw new Error("STREAK_PENDING_INTEGRITY_CASE_REQUIRED");
      }
      await createPendingXpEventInTransaction(
        tx,
        {
          amount,
          ...(event.availableAt ? { availableAt: event.availableAt } : {}),
          idempotencyKey: `integrity-reprice:${input.caseId}:${event.id}`,
          integrityCaseId: event.integrityCaseId,
          kind: "streak_day",
          metadata,
          reasonCode,
          sourceCreatedAt: event.createdAt,
          sourceRef,
          userId: input.userId,
        },
        input.now
      );
      continue;
    }
    const reversal = requireStreakReconciliationSettlement(
      await postXpEventInTransaction(
        tx,
        {
          amount: -event.amount,
          createdBy: input.actorUserId,
          idempotencyKey: `integrity-reprice-reversal:${input.caseId}:${event.id}`,
          integrityCaseId: input.caseId,
          kind: "reversal",
          reasonCode: "confirmed_integrity_abuse",
          reversesEventId: event.id,
          sourceRef: `integrity-case:${input.caseId}:reprice:${event.id}`,
          userId: input.userId,
        },
        input.now
      )
    );
    settlements.push(reversal);
    const replacement = requireStreakReconciliationSettlement(
      await postXpEventInTransaction(
        tx,
        {
          amount,
          createdBy: input.actorUserId,
          idempotencyKey: `integrity-reprice:${input.caseId}:${event.id}`,
          ...(event.integrityCaseId
            ? { integrityCaseId: event.integrityCaseId }
            : {}),
          kind: "streak_day",
          metadata,
          reasonCode,
          sourceCreatedAt: event.createdAt,
          sourceRef,
          userId: input.userId,
        },
        input.now
      )
    );
    settlements.push(replacement);
  }
  for (const event of rebuilt.invalidChallengeEvents) {
    if (event.state !== "posted") {
      continue;
    }
    settlements.push(
      requireStreakReconciliationSettlement(
        await postXpEventInTransaction(
          tx,
          {
            amount: -event.amount,
            createdBy: input.actorUserId,
            idempotencyKey: `integrity-reversal:${input.caseId}:${event.id}`,
            integrityCaseId: input.caseId,
            kind: "reversal",
            reasonCode: "confirmed_integrity_abuse",
            reversesEventId: event.id,
            sourceRef: `integrity-case:${input.caseId}:reversal:${event.id}`,
            userId: input.userId,
          },
          input.now
        )
      )
    );
  }

  await tx
    .update(userStreak)
    .set({
      ...rebuilt.projection,
      currentEvidence: sql`case
        when ${rebuilt.projection.lastCompletedDayKey} is not null
          and ${userStreak.currentEvidenceDayKey} = ${rebuilt.projection.lastCompletedDayKey}
          then ${userStreak.currentEvidence}
        else ${userStreak.currentEvidence} - 'completedPath'
      end`,
      updatedAt: input.now,
    })
    .where(eq(userStreak.userId, input.userId));
  return settlements;
}
