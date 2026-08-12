import { and, eq, gte, inArray, sql } from "@repo/db";
import { userComicProgress, xpEvent, xpRewardBlock } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import { getPatronTierRank } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import type { RedisClientType } from "redis";
import { z } from "zod";

import type { Context } from "../context";
import { getPostEarlyAccessView } from "../utils/early-access";
import {
  assessXpSourceCapPressure,
  settleXpWithIntegrityInTransaction,
} from "./integrity-settlement";
import type { IntegrityCorrelationEvidence } from "./integrity-settlement";
import { getUserPatronTier } from "./profile";
import type { postXpEventInTransaction } from "./progression";
import {
  lockUserProgressionInTransaction,
  notifyXpSettlementInTransaction,
} from "./progression";
import { applyStreakEvidenceInTransaction } from "./streak";
import type { StreakDayCompletion } from "./streak";

const COMIC_READING_SESSION_TTL_SECONDS = 60 * 60 * 6;
const COMIC_READING_SESSION_LOCK_TTL_MS = 30_000;
const COMIC_READING_SESSION_LOCK_RETRY_ATTEMPTS = 40;
const COMIC_READING_SESSION_LOCK_RETRY_MS = 50;
const MIN_PAGE_ADVANCE_INTERVAL_MS = 400;
const MIN_REWARD_CHECKPOINT_INTERVAL_MS = 2000;
const MIN_REWARD_VISIBILITY_PERCENTAGE = 60;
const NON_VIP_PERSIST_INTERVAL_MS = 30_000;
const NON_VIP_PERSIST_PAGE_DELTA = 3;
const COMIC_READING_DAILY_XP_CAP = 200;
export const COMIC_READING_CAP_STATES = ["pending", "posted"] as const;

type Database = Context["db"];

export type ComicProgressStatus = "read" | "reading" | "unread" | "updated";

type ComicMetadata = {
  comicId: string;
  comicLastUpdateAt: Date | null;
  currentPageCount: number;
  earlyAccessEnabled: boolean;
  earlyAccessStartedAt: Date | null;
  releasedAt: Date | null;
  vip12EarlyAccessHours: number;
  vip8EarlyAccessHours: number;
};

type StoredComicProgress = {
  completed: boolean;
  completedAt: Date | null;
  lastPageRead: number;
  lastReadTimestamp: Date;
  totalPagesAtLastRead: number;
  updatedAt: Date;
  verifiedThroughPage: number;
};

type PendingRewardCheckpoint = {
  page: number;
  receivedAtMs: number;
};

type ReadingSessionState = {
  canUseResume: boolean;
  comicId: string;
  completedAtIso: string | null;
  completedSnapshot: boolean;
  consecutiveValidRewardCheckpoints: number;
  fastRewardCheckpoints: boolean;
  lastAcceptedAtMs: number | null;
  lastAcceptedPage: number | null;
  lastPageRead: number;
  lastPersistedAtMs: number | null;
  lastPersistedPage: number;
  lastRewardCheckpointAtMs: number | null;
  pendingRewardCheckpoints: PendingRewardCheckpoint[];
  startedAtMs: number;
  totalPages: number;
  totalPagesAtLastReadSnapshot: number;
  userId: string;
  verifiedThroughPage: number;
};

const storedReadingSessionSchema = z.object({
  canUseResume: z.boolean(),
  comicId: z.string().min(1),
  completedAtIso: z.iso.datetime().nullable(),
  completedSnapshot: z.boolean(),
  consecutiveValidRewardCheckpoints: z.number().int().nonnegative().optional(),
  fastRewardCheckpoints: z.boolean().optional(),
  lastAcceptedAtMs: z.number().int().nonnegative().nullable(),
  lastAcceptedPage: z.number().int().positive().nullable(),
  lastPageRead: z.number().int().nonnegative(),
  lastPersistedAtMs: z.number().int().nonnegative().nullable(),
  lastPersistedPage: z.number().int().nonnegative(),
  lastRewardCheckpointAtMs: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional(),
  pendingRewardCheckpoints: z
    .array(
      z.object({
        page: z.number().int().positive(),
        receivedAtMs: z.number().int().nonnegative(),
      })
    )
    .optional(),
  pendingRewardPages: z.array(z.number().int().positive()).optional(),
  startedAtMs: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  totalPagesAtLastReadSnapshot: z.number().int().nonnegative(),
  userId: z.string().min(1),
  verifiedThroughPage: z.number().int().nonnegative(),
});

type CatalogComicItem = {
  comicPageCount?: number | null;
  id: string;
  imageObjectKeys?: string[] | null;
  type: "comic" | "post";
};

type ApplyCheckpointResult = {
  accepted: boolean;
  markedCompleted: boolean;
  nextState: ReadingSessionState;
  persisted: boolean;
  reason: "accepted" | "invalid_page" | "rate_limited" | "session_mismatch";
};

export type ComicPageCheckpointEvidence = {
  documentVisible: boolean;
  visibleDurationMs: number;
  visiblePercentage: number;
};

type ApplyRewardCheckpointResult = {
  nextState: ReadingSessionState;
  reason:
    | "accepted"
    | "fast_checkpoint"
    | "invalid_evidence"
    | "invalid_page"
    | "recovery";
  rewardValid: boolean;
};

function getReadingSessionKey(readingSessionId: string) {
  return `comic-progress:session:${readingSessionId}`;
}

function getReadingSessionLockKey(readingSessionId: string) {
  return `comic-progress:session-lock:${readingSessionId}`;
}

function getTrackingUnavailableResult() {
  return {
    accepted: false,
    markedCompleted: false,
    persisted: false,
    processed: false,
    publicProfileChanged: false,
    reason: "tracking_unavailable" as const,
    rewardedXp: 0,
    status: "unread" as ComicProgressStatus,
    trackingAvailable: false,
  };
}

async function acquireReadingSessionLock(
  cache: RedisClientType,
  readingSessionId: string,
  token: string
) {
  for (
    let attempt = 0;
    attempt < COMIC_READING_SESSION_LOCK_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    if (
      (await cache.set(getReadingSessionLockKey(readingSessionId), token, {
        NX: true,
        PX: COMIC_READING_SESSION_LOCK_TTL_MS,
      })) === "OK"
    ) {
      return { acquired: true };
    }
    if (attempt < COMIC_READING_SESSION_LOCK_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, COMIC_READING_SESSION_LOCK_RETRY_MS)
      );
    }
  }
  return { acquired: false };
}

async function releaseReadingSessionLock(
  cache: RedisClientType,
  readingSessionId: string,
  token: string
) {
  await cache.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    {
      arguments: [token],
      keys: [getReadingSessionLockKey(readingSessionId)],
    }
  );
}

function getComicPageCount(item: CatalogComicItem): number {
  if (typeof item.comicPageCount === "number") {
    return item.comicPageCount;
  }

  return item.imageObjectKeys?.length ?? 0;
}

function getMinimumCompletionDurationMs(totalPages: number): number {
  return Math.min(60_000, Math.max(1000, totalPages * 350));
}

function canUseVipResume(role: string | null | undefined, tier: PatronTier) {
  if (role && role !== "user") {
    return true;
  }

  return getPatronTierRank(tier) > 0;
}

function parseStoredSession(value: string | null): ReadingSessionState | null {
  if (!value) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const validated = storedReadingSessionSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }
  const { pendingRewardPages, ...state } = validated.data;
  return {
    ...state,
    consecutiveValidRewardCheckpoints:
      state.consecutiveValidRewardCheckpoints ?? 0,
    fastRewardCheckpoints: state.fastRewardCheckpoints ?? false,
    lastRewardCheckpointAtMs: state.lastRewardCheckpointAtMs ?? null,
    pendingRewardCheckpoints:
      state.pendingRewardCheckpoints ??
      pendingRewardPages?.map((page) => ({
        page,
        receivedAtMs: state.lastRewardCheckpointAtMs ?? state.startedAtMs,
      })) ??
      [],
  };
}

export function normalizeProcessedPageRanges(
  ranges: [number, number][]
): [number, number][] {
  const normalized: [number, number][] = [];
  for (const [start, end] of ranges
    .filter(
      ([rangeStart, rangeEnd]) =>
        Number.isInteger(rangeStart) &&
        rangeStart >= 1 &&
        Number.isInteger(rangeEnd) &&
        rangeEnd >= rangeStart
    )
    .toSorted(([left], [right]) => left - right)) {
    const previous = normalized.at(-1);
    if (previous && start <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], end);
    } else {
      normalized.push([start, end]);
    }
  }
  return normalized;
}

export function addProcessedPage(
  ranges: [number, number][],
  page: number
): { added: boolean; ranges: [number, number][] } {
  const normalized = normalizeProcessedPageRanges(ranges);
  if (normalized.some(([start, end]) => page >= start && page <= end)) {
    return { added: false, ranges: normalized };
  }
  return {
    added: true,
    ranges: normalizeProcessedPageRanges([...normalized, [page, page]]),
  };
}

export function getPersistedProcessedPageRanges(input: {
  currentRanges: [number, number][];
  processedPages: number[];
  projectionMismatch: boolean;
  rewardCount: number;
  settlementDeferred?: boolean;
}) {
  const pages = getPersistedProcessedPages(input);
  let ranges = input.currentRanges;
  for (const page of pages) {
    ({ ranges } = addProcessedPage(ranges, page));
  }
  return ranges;
}

function getPersistedProcessedPages(input: {
  processedPages: number[];
  projectionMismatch: boolean;
  rewardCount: number;
  settlementDeferred?: boolean;
}) {
  if (input.settlementDeferred) {
    return [];
  }
  return input.projectionMismatch
    ? input.processedPages.slice(input.rewardCount)
    : input.processedPages;
}

export function getComicReadingRewardCount(
  newlyProcessedPageCount: number,
  rewardedToday: number
) {
  return Math.min(
    newlyProcessedPageCount,
    Math.max(0, COMIC_READING_DAILY_XP_CAP - rewardedToday)
  );
}

function clampPage(page: number, totalPages: number) {
  if (totalPages <= 0) {
    return 0;
  }

  return Math.min(Math.max(page, 0), totalPages);
}

function normalizeStoredProgress(
  progress: StoredComicProgress | null,
  currentPageCount: number
): StoredComicProgress | null {
  if (!progress) {
    return null;
  }

  return {
    ...progress,
    lastPageRead: clampPage(progress.lastPageRead, currentPageCount),
    totalPagesAtLastRead: Math.max(progress.totalPagesAtLastRead, 0),
    verifiedThroughPage: clampPage(
      progress.verifiedThroughPage,
      currentPageCount
    ),
  };
}

function createSessionState(params: {
  canUseResume: boolean;
  comicId: string;
  currentPageCount: number;
  nowMs: number;
  progress: StoredComicProgress | null;
  userId: string;
}): ReadingSessionState {
  const normalizedProgress = normalizeStoredProgress(
    params.progress,
    params.currentPageCount
  );

  const verifiedThroughPage = normalizedProgress?.completed
    ? Math.max(
        normalizedProgress.totalPagesAtLastRead,
        normalizedProgress.verifiedThroughPage
      )
    : (normalizedProgress?.verifiedThroughPage ?? 0);

  return {
    canUseResume: params.canUseResume,
    comicId: params.comicId,
    completedAtIso: normalizedProgress?.completedAt?.toISOString() ?? null,
    completedSnapshot: normalizedProgress?.completed ?? false,
    consecutiveValidRewardCheckpoints: 0,
    fastRewardCheckpoints: false,
    lastAcceptedAtMs: null,
    lastAcceptedPage: null,
    lastPageRead: normalizedProgress?.lastPageRead ?? 0,
    lastPersistedAtMs:
      normalizedProgress?.updatedAt.getTime() ??
      normalizedProgress?.lastReadTimestamp.getTime() ??
      null,
    lastPersistedPage: normalizedProgress?.lastPageRead ?? 0,
    lastRewardCheckpointAtMs: null,
    pendingRewardCheckpoints: [],
    startedAtMs: params.nowMs,
    totalPages: params.currentPageCount,
    totalPagesAtLastReadSnapshot:
      normalizedProgress?.totalPagesAtLastRead ?? params.currentPageCount,
    userId: params.userId,
    verifiedThroughPage,
  };
}

export function applyRewardCheckpoint(params: {
  evidence: ComicPageCheckpointEvidence;
  nowMs: number;
  page: number;
  state: ReadingSessionState;
}): ApplyRewardCheckpointResult {
  const { evidence, nowMs, page, state } = params;
  if (page < 1 || page > state.totalPages || page > state.verifiedThroughPage) {
    return {
      nextState: {
        ...state,
        consecutiveValidRewardCheckpoints: 0,
      },
      reason: "invalid_page",
      rewardValid: false,
    };
  }
  if (
    !evidence.documentVisible ||
    evidence.visibleDurationMs < MIN_REWARD_CHECKPOINT_INTERVAL_MS ||
    evidence.visiblePercentage < MIN_REWARD_VISIBILITY_PERCENTAGE
  ) {
    return {
      nextState: {
        ...state,
        consecutiveValidRewardCheckpoints: 0,
      },
      reason: "invalid_evidence",
      rewardValid: false,
    };
  }

  const previousCheckpointAtMs =
    state.lastRewardCheckpointAtMs ?? state.startedAtMs;
  if (nowMs - previousCheckpointAtMs < MIN_REWARD_CHECKPOINT_INTERVAL_MS) {
    return {
      nextState: {
        ...state,
        consecutiveValidRewardCheckpoints: 0,
        fastRewardCheckpoints: true,
        lastRewardCheckpointAtMs: nowMs,
      },
      reason: "fast_checkpoint",
      rewardValid: false,
    };
  }

  if (state.fastRewardCheckpoints) {
    const consecutiveValidRewardCheckpoints =
      state.consecutiveValidRewardCheckpoints + 1;
    return {
      nextState: {
        ...state,
        consecutiveValidRewardCheckpoints:
          consecutiveValidRewardCheckpoints >= 3
            ? 0
            : consecutiveValidRewardCheckpoints,
        fastRewardCheckpoints: consecutiveValidRewardCheckpoints < 3,
        lastRewardCheckpointAtMs: nowMs,
      },
      reason: "recovery",
      rewardValid: false,
    };
  }

  return {
    nextState: {
      ...state,
      consecutiveValidRewardCheckpoints: 0,
      lastRewardCheckpointAtMs: nowMs,
      pendingRewardCheckpoints: state.pendingRewardCheckpoints.some(
        (checkpoint) => checkpoint.page === page
      )
        ? state.pendingRewardCheckpoints
        : [...state.pendingRewardCheckpoints, { page, receivedAtMs: nowMs }],
    },
    reason: "accepted",
    rewardValid: true,
  };
}

export function getPersistedProgressStatus(
  currentPageCount: number,
  progress: Pick<
    StoredComicProgress,
    "completed" | "lastPageRead" | "totalPagesAtLastRead"
  > | null
): ComicProgressStatus {
  if (!progress || progress.lastPageRead <= 0) {
    return "unread";
  }

  if (progress.completed && currentPageCount > progress.totalPagesAtLastRead) {
    return "updated";
  }

  if (progress.completed) {
    return "read";
  }

  return "reading";
}

function buildSessionProgressSnapshot(
  state: ReadingSessionState
): Pick<
  StoredComicProgress,
  "completed" | "lastPageRead" | "totalPagesAtLastRead"
> {
  return {
    completed: state.completedSnapshot,
    lastPageRead: state.lastPageRead,
    totalPagesAtLastRead: state.totalPagesAtLastReadSnapshot,
  };
}

function shouldPersistCheckpoint(
  state: ReadingSessionState,
  nextPage: number,
  nowMs: number,
  markedCompleted: boolean
) {
  if (
    markedCompleted ||
    state.canUseResume ||
    state.lastPersistedAtMs === null
  ) {
    return true;
  }

  if (
    Math.abs(nextPage - state.lastPersistedPage) >= NON_VIP_PERSIST_PAGE_DELTA
  ) {
    return true;
  }

  return nowMs - state.lastPersistedAtMs >= NON_VIP_PERSIST_INTERVAL_MS;
}

export function applyCheckpoint(params: {
  nowMs: number;
  page: number;
  state: ReadingSessionState;
}): ApplyCheckpointResult {
  const { nowMs, page, state } = params;

  if (page < 1 || page > state.totalPages) {
    return {
      accepted: false,
      markedCompleted: false,
      nextState: state,
      persisted: false,
      reason: "invalid_page",
    };
  }

  const isForwardAdvance =
    state.lastAcceptedPage !== null && page > state.lastAcceptedPage;

  if (
    isForwardAdvance &&
    state.lastAcceptedAtMs !== null &&
    nowMs - state.lastAcceptedAtMs < MIN_PAGE_ADVANCE_INTERVAL_MS
  ) {
    return {
      accepted: false,
      markedCompleted: false,
      nextState: state,
      persisted: false,
      reason: "rate_limited",
    };
  }

  const nextState: ReadingSessionState = {
    ...state,
    lastAcceptedAtMs: nowMs,
    lastAcceptedPage: page,
    lastPageRead: page,
  };

  if (page <= nextState.verifiedThroughPage + 1) {
    nextState.verifiedThroughPage = Math.max(
      nextState.verifiedThroughPage,
      page
    );
  }

  const markedCompleted =
    page === nextState.totalPages &&
    nextState.verifiedThroughPage >= nextState.totalPages &&
    nowMs - nextState.startedAtMs >=
      getMinimumCompletionDurationMs(nextState.totalPages);

  if (markedCompleted) {
    nextState.completedAtIso = new Date(nowMs).toISOString();
    nextState.completedSnapshot = true;
    nextState.totalPagesAtLastReadSnapshot = nextState.totalPages;
  }

  const persisted = shouldPersistCheckpoint(
    state,
    page,
    nowMs,
    markedCompleted
  );

  if (persisted) {
    nextState.lastPersistedAtMs = nowMs;
    nextState.lastPersistedPage = page;
  }

  return {
    accepted: true,
    markedCompleted,
    nextState,
    persisted,
    reason: "accepted",
  };
}

async function readSessionState(
  cache: RedisClientType,
  readingSessionId: string
): Promise<ReadingSessionState | null> {
  const value = await cache.get(getReadingSessionKey(readingSessionId));
  return parseStoredSession(value);
}

async function writeSessionState(
  cache: RedisClientType,
  readingSessionId: string,
  state: ReadingSessionState
) {
  await cache.set(
    getReadingSessionKey(readingSessionId),
    JSON.stringify(state),
    {
      EX: COMIC_READING_SESSION_TTL_SECONDS,
    }
  );
}

async function getComicMetadata(
  db: Database,
  comicId: string
): Promise<ComicMetadata | null> {
  const result = await db.query.post.findFirst({
    columns: {
      comicLastUpdateAt: true,
      comicPageCount: true,
      earlyAccessEnabled: true,
      earlyAccessStartedAt: true,
      id: true,
      imageObjectKeys: true,
      releasedAt: true,
      vip12EarlyAccessHours: true,
      vip8EarlyAccessHours: true,
    },
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(
        equals(table.id, comicId),
        equals(table.status, "publish"),
        equals(table.type, "comic")
      ),
  });

  if (!result) {
    return null;
  }

  return {
    comicId: result.id,
    comicLastUpdateAt: result.comicLastUpdateAt,
    currentPageCount:
      result.comicPageCount > 0
        ? result.comicPageCount
        : (result.imageObjectKeys?.length ?? 0),
    earlyAccessEnabled: result.earlyAccessEnabled,
    earlyAccessStartedAt: result.earlyAccessStartedAt,
    releasedAt: result.releasedAt,
    vip12EarlyAccessHours: result.vip12EarlyAccessHours,
    vip8EarlyAccessHours: result.vip8EarlyAccessHours,
  };
}

function canAccessComicMetadata(params: {
  metadata: ComicMetadata;
  now?: Date;
  role?: string | null;
  tier: PatronTier;
}) {
  const now = params.now ?? new Date();
  if (params.metadata.releasedAt && params.metadata.releasedAt > now) {
    return false;
  }

  const earlyAccess = getPostEarlyAccessView(
    {
      earlyAccessEnabled: params.metadata.earlyAccessEnabled,
      earlyAccessStartedAt: params.metadata.earlyAccessStartedAt,
      type: "comic",
      vip12EarlyAccessHours: params.metadata.vip12EarlyAccessHours,
      vip8EarlyAccessHours: params.metadata.vip8EarlyAccessHours,
    },
    { role: params.role ?? undefined, tier: params.tier },
    now
  );

  return earlyAccess.viewerCanAccess;
}

async function getStoredProgress(
  db: Database,
  userId: string,
  comicId: string
): Promise<StoredComicProgress | null> {
  const result = await db.query.userComicProgress.findFirst({
    columns: {
      completed: true,
      completedAt: true,
      lastPageRead: true,
      lastReadTimestamp: true,
      totalPagesAtLastRead: true,
      updatedAt: true,
      verifiedThroughPage: true,
    },
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(equals(table.comicId, comicId), equals(table.userId, userId)),
  });

  return result ?? null;
}

function getResumePage(
  currentPageCount: number,
  progress: StoredComicProgress | null,
  resumeEnabled: boolean
) {
  if (!(resumeEnabled && progress && progress.lastPageRead > 0)) {
    return null;
  }

  const hasUnreadNewPages =
    progress.completed &&
    currentPageCount > progress.totalPagesAtLastRead &&
    progress.lastPageRead > progress.totalPagesAtLastRead &&
    progress.lastPageRead < currentPageCount;

  if (hasUnreadNewPages) {
    return progress.lastPageRead;
  }

  if (!(progress.completed || progress.lastPageRead >= currentPageCount)) {
    return progress.lastPageRead;
  }

  return null;
}

function buildProgressOverview(params: {
  currentPageCount: number;
  progress: StoredComicProgress | null;
  resumeEnabled: boolean;
}) {
  const normalizedProgress = normalizeStoredProgress(
    params.progress,
    params.currentPageCount
  );
  const resumePage = getResumePage(
    params.currentPageCount,
    normalizedProgress,
    params.resumeEnabled
  );

  return {
    completed: normalizedProgress?.completed ?? false,
    currentPageCount: params.currentPageCount,
    hasNewPagesAvailable:
      Boolean(normalizedProgress?.completed) &&
      params.currentPageCount > (normalizedProgress?.totalPagesAtLastRead ?? 0),
    lastPageRead: normalizedProgress?.lastPageRead ?? 0,
    lastReadTimestamp: normalizedProgress?.lastReadTimestamp ?? null,
    resumePage,
    resumePromptEnabled: resumePage !== null,
    status: getPersistedProgressStatus(
      params.currentPageCount,
      normalizedProgress
    ),
    totalPagesAtLastRead: normalizedProgress?.totalPagesAtLastRead ?? 0,
    verifiedThroughPage: normalizedProgress?.verifiedThroughPage ?? 0,
    vipResumeEnabled: params.resumeEnabled,
  };
}

function parseCompletedAt(value: string | null) {
  return value ? new Date(value) : null;
}

async function persistProgressRecord(params: {
  correlation: IntegrityCorrelationEvidence;
  db: Database;
  impersonated: boolean;
  now: Date;
  processingNow: Date;
  state: ReadingSessionState;
  timezone?: string;
}) {
  const completed = params.state.completedSnapshot;
  const completedAt = parseCompletedAt(params.state.completedAtIso);
  const incomingProgressValues = {
    comicId: params.state.comicId,
    completed,
    completedAt,
    lastPageRead: params.state.lastPageRead,
    lastReadTimestamp: params.now,
    totalPagesAtLastRead: completed
      ? params.state.totalPagesAtLastReadSnapshot
      : params.state.totalPages,
    userId: params.state.userId,
    verifiedThroughPage: params.state.verifiedThroughPage,
  };

  const result = await params.db.transaction(async (tx) => {
    const pendingRewardCheckpoints = [
      ...new Map(
        params.state.pendingRewardCheckpoints.map((checkpoint) => [
          checkpoint.page,
          checkpoint,
        ])
      ).values(),
    ];
    let dayCompletion: StreakDayCompletion | undefined;
    for (const checkpoint of pendingRewardCheckpoints) {
      const streak = await applyStreakEvidenceInTransaction(
        tx,
        {
          comicId: params.state.comicId,
          impersonated: params.impersonated,
          integrity: { correlation: params.correlation },
          kind: "reading",
          page: checkpoint.page,
          timezone: params.timezone,
          userId: params.state.userId,
        },
        new Date(checkpoint.receivedAtMs),
        params.processingNow
      );
      if (streak && "dayCompletion" in streak) {
        dayCompletion ??= streak.dayCompletion;
      }
    }

    await tx
      .insert(userComicProgress)
      .values(incomingProgressValues)
      .onConflictDoNothing({
        target: [userComicProgress.userId, userComicProgress.comicId],
      });

    const [storedProgress] = await tx
      .select({
        completed: userComicProgress.completed,
        completedAt: userComicProgress.completedAt,
        lastPageRead: userComicProgress.lastPageRead,
        lastReadTimestamp: userComicProgress.lastReadTimestamp,
        ranges: userComicProgress.xpProcessedPageRanges,
        totalPagesAtLastRead: userComicProgress.totalPagesAtLastRead,
        verifiedThroughPage: userComicProgress.verifiedThroughPage,
      })
      .from(userComicProgress)
      .where(
        and(
          eq(userComicProgress.userId, params.state.userId),
          eq(userComicProgress.comicId, params.state.comicId)
        )
      )
      .for("update");
    if (!storedProgress) {
      throw new Error("No se pudo bloquear el progreso del comic.");
    }
    const incomingCompletedNewerSnapshot =
      incomingProgressValues.completed &&
      incomingProgressValues.totalPagesAtLastRead >
        storedProgress.totalPagesAtLastRead;
    const incomingProgressIsLatest =
      incomingProgressValues.lastReadTimestamp >=
      storedProgress.lastReadTimestamp;
    const progressValues = {
      ...incomingProgressValues,
      completed: storedProgress.completed || incomingProgressValues.completed,
      completedAt: incomingCompletedNewerSnapshot
        ? incomingProgressValues.completedAt
        : (storedProgress.completedAt ?? incomingProgressValues.completedAt),
      lastPageRead: incomingProgressIsLatest
        ? incomingProgressValues.lastPageRead
        : storedProgress.lastPageRead,
      lastReadTimestamp: incomingProgressIsLatest
        ? incomingProgressValues.lastReadTimestamp
        : storedProgress.lastReadTimestamp,
      totalPagesAtLastRead: Math.max(
        storedProgress.totalPagesAtLastRead,
        incomingProgressValues.totalPagesAtLastRead
      ),
      verifiedThroughPage: Math.max(
        storedProgress.verifiedThroughPage,
        incomingProgressValues.verifiedThroughPage
      ),
    };

    let processedPageRanges: [number, number][] | undefined;
    const processedPages: number[] = [];
    let rewardedPages: number[] = [];
    let releasedSettlements: Awaited<
      ReturnType<typeof postXpEventInTransaction>
    >[] = [];
    let settlement:
      | Awaited<ReturnType<typeof postXpEventInTransaction>>
      | undefined;

    if (env.XP_ACCRUAL_ENABLED && pendingRewardCheckpoints.length > 0) {
      await lockUserProgressionInTransaction(
        tx,
        params.state.userId,
        params.now
      );
      const currentProcessedPageRanges = storedProgress.ranges;
      processedPageRanges = currentProcessedPageRanges;
      for (const { page } of pendingRewardCheckpoints.toSorted(
        (left, right) => left.page - right.page
      )) {
        const added = addProcessedPage(processedPageRanges, page);
        processedPageRanges = added.ranges;
        if (added.added) {
          processedPages.push(page);
        }
      }

      if (processedPages.length > 0) {
        const rewardBlock = await tx.query.xpRewardBlock.findFirst({
          columns: { id: true },
          where: and(
            eq(xpRewardBlock.userId, params.state.userId),
            eq(xpRewardBlock.kind, "comic"),
            eq(xpRewardBlock.scopeKey, `comic:${params.state.comicId}`)
          ),
        });
        const utcDayStart = new Date(
          Date.UTC(
            params.now.getUTCFullYear(),
            params.now.getUTCMonth(),
            params.now.getUTCDate()
          )
        );
        const [daily] = rewardBlock
          ? []
          : await tx
              .select({
                total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)`,
              })
              .from(xpEvent)
              .where(
                and(
                  eq(xpEvent.userId, params.state.userId),
                  eq(xpEvent.kind, "comic_reading"),
                  inArray(xpEvent.state, COMIC_READING_CAP_STATES),
                  gte(xpEvent.createdAt, utcDayStart)
                )
              );
        const rewardCount = rewardBlock
          ? 0
          : getComicReadingRewardCount(
              processedPages.length,
              Number(daily?.total ?? 0)
            );
        let projectionMismatch = false;
        let settlementDeferred = false;
        rewardedPages = processedPages.slice(0, rewardCount);
        if (rewardCount > 0) {
          const batchKey = processedPages.join(",");
          const integrityResult = await settleXpWithIntegrityInTransaction(
            tx,
            {
              amount: rewardCount,
              idempotencyKey: `comic-reading:${params.state.userId}:${params.state.comicId}:${batchKey}`,
              kind: "comic_reading",
              metadata: {
                comicId: params.state.comicId,
                processedPages,
                rewardedPages,
              },
              reasonCode: "verified_comic_reading",
              sourceRef: `comic:${params.state.comicId}:pages:${batchKey}`,
              userId: params.state.userId,
            },
            assessXpSourceCapPressure({
              correlation: params.correlation,
              limit: COMIC_READING_DAILY_XP_CAP,
              observed: Number(daily?.total ?? 0) + rewardCount,
              source: "comic_reading_daily",
            }),
            params.now
          );
          if (
            "releasedSettlements" in integrityResult &&
            integrityResult.releasedSettlements
          ) {
            ({ releasedSettlements } = integrityResult);
          }
          if (
            integrityResult.outcome === "posted" &&
            "settlement" in integrityResult
          ) {
            ({ settlement } = integrityResult);
            projectionMismatch =
              "projectionMismatch" in settlement &&
              settlement.projectionMismatch === true;
            rewardedPages = rewardedPages.slice(0, settlement.settledXp);
          } else {
            settlementDeferred = integrityResult.outcome === "deferred";
            rewardedPages = [];
          }
        }
        const persistedPages = getPersistedProcessedPages({
          processedPages,
          projectionMismatch,
          rewardCount,
          settlementDeferred,
        });
        processedPageRanges = getPersistedProcessedPageRanges({
          currentRanges: currentProcessedPageRanges,
          processedPages,
          projectionMismatch,
          rewardCount,
          settlementDeferred,
        });
        processedPages.splice(0, processedPages.length, ...persistedPages);
      }
    }

    await tx
      .update(userComicProgress)
      .set({
        ...progressValues,
        ...(processedPageRanges
          ? {
              xpProcessedPageRanges: processedPageRanges,
              xpTrackingUpdatedAt: params.now,
            }
          : {}),
        updatedAt: params.now,
      })
      .where(
        and(
          eq(userComicProgress.userId, params.state.userId),
          eq(userComicProgress.comicId, params.state.comicId)
        )
      );

    const publicProfileChanged = [settlement, ...releasedSettlements].some(
      (candidate) =>
        candidate &&
        !candidate.replayed &&
        candidate.level !== candidate.previousLevel
    );
    if (settlement) {
      await notifyXpSettlementInTransaction(
        tx,
        params.state.userId,
        settlement
      );
    }
    for (const releasedSettlement of releasedSettlements) {
      await notifyXpSettlementInTransaction(
        tx,
        params.state.userId,
        releasedSettlement
      );
    }
    return {
      dayCompletion,
      processedPages,
      publicProfileChanged: Boolean(dayCompletion) || publicProfileChanged,
      releasedSettlements,
      rewardedPages,
      settlement,
    };
  });
  return result;
}

export async function attachComicCatalogProgress<
  TItem extends CatalogComicItem,
>(
  db: Database,
  params: { items: TItem[]; userId?: string }
): Promise<(TItem & { comicProgressStatus: ComicProgressStatus | null })[]> {
  if (!params.userId) {
    return params.items.map((item) => ({
      ...item,
      comicProgressStatus: item.type === "comic" ? "unread" : null,
    }));
  }

  const comicIds = params.items
    .filter((item) => item.type === "comic")
    .map((item) => item.id);

  if (comicIds.length === 0) {
    return params.items.map((item) => ({
      ...item,
      comicProgressStatus: null,
    }));
  }

  const progressRows = await db
    .select({
      comicId: userComicProgress.comicId,
      completed: userComicProgress.completed,
      lastPageRead: userComicProgress.lastPageRead,
      totalPagesAtLastRead: userComicProgress.totalPagesAtLastRead,
    })
    .from(userComicProgress)
    .where(
      and(
        eq(userComicProgress.userId, params.userId),
        inArray(userComicProgress.comicId, comicIds)
      )
    );

  const progressByComicId = new Map(
    progressRows.map((row) => [row.comicId, row] as const)
  );

  return params.items.map((item) => ({
    ...item,
    comicProgressStatus:
      item.type === "comic"
        ? getPersistedProgressStatus(
            getComicPageCount(item),
            progressByComicId.get(item.id) ?? null
          )
        : null,
  }));
}

export async function getComicProgressOverview(
  db: Database,
  params: { role?: string | null; comicId: string; userId: string }
) {
  const comicMetadata = await getComicMetadata(db, params.comicId);

  if (!comicMetadata) {
    return null;
  }

  const [progress, tier] = await Promise.all([
    getStoredProgress(db, params.userId, params.comicId),
    getUserPatronTier(db, params.userId),
  ]);

  if (
    !canAccessComicMetadata({
      metadata: comicMetadata,
      role: params.role,
      tier,
    })
  ) {
    return null;
  }

  return {
    comicId: comicMetadata.comicId,
    comicLastUpdateAt: comicMetadata.comicLastUpdateAt,
    ...buildProgressOverview({
      currentPageCount: comicMetadata.currentPageCount,
      progress,
      resumeEnabled: canUseVipResume(params.role, tier),
    }),
  };
}

export async function startComicReadingSession(params: {
  cache: RedisClientType;
  db: Database;
  comicId: string;
  role?: string | null;
  userId: string;
}) {
  const comicMetadata = await getComicMetadata(params.db, params.comicId);

  if (!comicMetadata) {
    return null;
  }

  const [progress, tier] = await Promise.all([
    getStoredProgress(params.db, params.userId, params.comicId),
    getUserPatronTier(params.db, params.userId),
  ]);

  if (
    !canAccessComicMetadata({
      metadata: comicMetadata,
      role: params.role,
      tier,
    })
  ) {
    return null;
  }

  const nowMs = Date.now();
  const sessionState = createSessionState({
    canUseResume: canUseVipResume(params.role, tier),
    comicId: params.comicId,
    currentPageCount: comicMetadata.currentPageCount,
    nowMs,
    progress,
    userId: params.userId,
  });
  const readingSessionId = generateId();

  let trackingAvailable = true;
  try {
    await writeSessionState(params.cache, readingSessionId, sessionState);
  } catch {
    trackingAvailable = false;
  }

  return {
    readingSessionId: trackingAvailable ? readingSessionId : null,
    trackingAvailable,
    ...buildProgressOverview({
      currentPageCount: comicMetadata.currentPageCount,
      progress,
      resumeEnabled: sessionState.canUseResume,
    }),
  };
}

async function trackComicPageViewWithLockHeld(params: {
  cache: RedisClientType;
  correlation: IntegrityCorrelationEvidence;
  db: Database;
  evidence: ComicPageCheckpointEvidence;
  comicId: string;
  impersonated: boolean;
  now: Date;
  processingNow: Date;
  page: number;
  readingSessionId: string;
  role?: string | null;
  timezone?: string;
  userId: string;
}) {
  let state: ReadingSessionState | null;
  try {
    state = await readSessionState(params.cache, params.readingSessionId);
  } catch {
    return {
      accepted: false,
      markedCompleted: false,
      persisted: false,
      processed: false,
      publicProfileChanged: false,
      reason: "tracking_unavailable" as const,
      rewardedXp: 0,
      status: "unread" as ComicProgressStatus,
      trackingAvailable: false,
    };
  }

  if (
    !(
      state &&
      state.userId === params.userId &&
      state.comicId === params.comicId
    )
  ) {
    return {
      accepted: false,
      markedCompleted: false,
      persisted: false,
      processed: false,
      publicProfileChanged: false,
      reason: "session_mismatch" as const,
      rewardedXp: 0,
      status: "unread" as ComicProgressStatus,
      trackingAvailable: true,
    };
  }

  const [comicMetadata, tier] = await Promise.all([
    getComicMetadata(params.db, params.comicId),
    getUserPatronTier(params.db, params.userId),
  ]);
  if (
    !comicMetadata ||
    !canAccessComicMetadata({
      metadata: comicMetadata,
      now: params.now,
      role: params.role,
      tier,
    })
  ) {
    return {
      accepted: false,
      markedCompleted: false,
      persisted: false,
      processed: false,
      publicProfileChanged: false,
      reason: "session_mismatch" as const,
      rewardedXp: 0,
      status: "unread" as ComicProgressStatus,
      trackingAvailable: true,
    };
  }

  const nowMs = params.processingNow.getTime();
  const checkpoint = applyCheckpoint({
    nowMs,
    page: params.page,
    state,
  });
  const rewardCheckpoint = applyRewardCheckpoint({
    evidence: params.evidence,
    nowMs: params.now.getTime(),
    page: params.page,
    state: checkpoint.nextState,
  });
  let { nextState } = rewardCheckpoint;
  let persistenceResult:
    | Awaited<ReturnType<typeof persistProgressRecord>>
    | undefined;

  const persisted = checkpoint.persisted || rewardCheckpoint.rewardValid;
  try {
    await writeSessionState(params.cache, params.readingSessionId, nextState);
  } catch {
    return {
      accepted: checkpoint.accepted,
      lastPageRead: nextState.lastPageRead,
      markedCompleted: checkpoint.markedCompleted,
      persisted: false,
      processed: false,
      publicProfileChanged: false,
      reason: "tracking_unavailable" as const,
      rewardedXp: 0,
      status: getPersistedProgressStatus(
        nextState.totalPages,
        buildSessionProgressSnapshot(nextState)
      ),
      trackingAvailable: false,
      verifiedThroughPage: nextState.verifiedThroughPage,
    };
  }

  if (persisted) {
    persistenceResult = await persistProgressRecord({
      correlation: params.correlation,
      db: params.db,
      impersonated: params.impersonated,
      now: params.now,
      processingNow: params.processingNow,
      state: nextState,
      timezone: params.timezone,
    });
    nextState = { ...nextState, pendingRewardCheckpoints: [] };
  }

  if (persisted) {
    try {
      await writeSessionState(params.cache, params.readingSessionId, nextState);
    } catch {
      return {
        accepted: checkpoint.accepted,
        lastPageRead: nextState.lastPageRead,
        markedCompleted: checkpoint.markedCompleted,
        persisted,
        processed: (persistenceResult?.processedPages.length ?? 0) > 0,
        publicProfileChanged: persistenceResult?.publicProfileChanged ?? false,
        reason: "tracking_unavailable" as const,
        rewardedXp: persistenceResult?.rewardedPages.length ?? 0,
        ...(persistenceResult?.dayCompletion && {
          dayCompletion: persistenceResult.dayCompletion,
        }),
        status: getPersistedProgressStatus(
          nextState.totalPages,
          buildSessionProgressSnapshot(nextState)
        ),
        trackingAvailable: false,
        verifiedThroughPage: nextState.verifiedThroughPage,
      };
    }
  }

  return {
    accepted: checkpoint.accepted,
    lastPageRead: nextState.lastPageRead,
    markedCompleted: checkpoint.markedCompleted,
    persisted,
    processed: (persistenceResult?.processedPages.length ?? 0) > 0,
    publicProfileChanged: persistenceResult?.publicProfileChanged ?? false,
    reason: rewardCheckpoint.reason,
    rewardedXp: persistenceResult?.rewardedPages.length ?? 0,
    ...(persistenceResult?.dayCompletion && {
      dayCompletion: persistenceResult.dayCompletion,
    }),
    status: getPersistedProgressStatus(
      nextState.totalPages,
      buildSessionProgressSnapshot(nextState)
    ),
    trackingAvailable: true,
    verifiedThroughPage: nextState.verifiedThroughPage,
  };
}

export async function trackComicPageView(
  params: Omit<
    Parameters<typeof trackComicPageViewWithLockHeld>[0],
    "processingNow"
  >
) {
  const token = generateId();
  const lockWaitStartedAtMs = Date.now();
  try {
    const lock = await acquireReadingSessionLock(
      params.cache,
      params.readingSessionId,
      token
    );
    if (!lock.acquired) {
      return getTrackingUnavailableResult();
    }
  } catch {
    return getTrackingUnavailableResult();
  }

  try {
    return await trackComicPageViewWithLockHeld({
      ...params,
      processingNow: new Date(
        params.now.getTime() + Math.max(0, Date.now() - lockWaitStartedAtMs)
      ),
    });
  } finally {
    try {
      await releaseReadingSessionLock(
        params.cache,
        params.readingSessionId,
        token
      );
    } catch {
      // The short lease expires safely; a failed cleanup must not alter output.
    }
  }
}
