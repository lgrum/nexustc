import { and, eq, gte, inArray, sql } from "@repo/db";
import { userComicProgress, xpEvent } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import { getPatronTierRank } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import type { RedisClientType } from "redis";

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
  notifyXpSettlement,
} from "./progression";

const COMIC_READING_SESSION_TTL_SECONDS = 60 * 60 * 6;
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
  pendingRewardPages: number[];
  startedAtMs: number;
  totalPages: number;
  totalPagesAtLastReadSnapshot: number;
  userId: string;
  verifiedThroughPage: number;
};

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

  const state = JSON.parse(value) as ReadingSessionState;
  return {
    ...state,
    consecutiveValidRewardCheckpoints:
      state.consecutiveValidRewardCheckpoints ?? 0,
    fastRewardCheckpoints: state.fastRewardCheckpoints ?? false,
    lastRewardCheckpointAtMs: state.lastRewardCheckpointAtMs ?? null,
    pendingRewardPages: state.pendingRewardPages ?? [],
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
    pendingRewardPages: [],
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
  if (page < 1 || page > state.totalPages) {
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
      pendingRewardPages: state.pendingRewardPages.includes(page)
        ? state.pendingRewardPages
        : [...state.pendingRewardPages, page],
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
  now: Date;
  state: ReadingSessionState;
}) {
  const completed = params.state.completedSnapshot;
  const completedAt = parseCompletedAt(params.state.completedAtIso);
  const progressValues = {
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
    await tx
      .insert(userComicProgress)
      .values(progressValues)
      .onConflictDoNothing({
        target: [userComicProgress.userId, userComicProgress.comicId],
      });

    let processedPageRanges: [number, number][] | undefined;
    const processedPages: number[] = [];
    let rewardedPages: number[] = [];
    let settlement:
      | Awaited<ReturnType<typeof postXpEventInTransaction>>
      | undefined;

    if (env.XP_ACCRUAL_ENABLED && params.state.pendingRewardPages.length > 0) {
      await lockUserProgressionInTransaction(
        tx,
        params.state.userId,
        params.now
      );
      const [stored] = await tx
        .select({ ranges: userComicProgress.xpProcessedPageRanges })
        .from(userComicProgress)
        .where(
          and(
            eq(userComicProgress.userId, params.state.userId),
            eq(userComicProgress.comicId, params.state.comicId)
          )
        )
        .for("update");
      if (!stored) {
        throw new Error("No se pudo bloquear el progreso del comic.");
      }

      processedPageRanges = stored.ranges;
      for (const page of [...new Set(params.state.pendingRewardPages)].toSorted(
        (left, right) => left - right
      )) {
        const added = addProcessedPage(processedPageRanges, page);
        processedPageRanges = added.ranges;
        if (added.added) {
          processedPages.push(page);
        }
      }

      if (processedPages.length > 0) {
        const utcDayStart = new Date(
          Date.UTC(
            params.now.getUTCFullYear(),
            params.now.getUTCMonth(),
            params.now.getUTCDate()
          )
        );
        const [daily] = await tx
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
        const rewardCount = getComicReadingRewardCount(
          processedPages.length,
          Number(daily?.total ?? 0)
        );
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
          if (integrityResult.outcome === "posted") {
            ({ settlement } = integrityResult);
          } else {
            rewardedPages = [];
          }
        }
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

    return { processedPages, rewardedPages, settlement };
  });

  if (result.settlement) {
    await notifyXpSettlement(params.db, params.state.userId, result.settlement);
  }
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

export async function trackComicPageView(params: {
  cache: RedisClientType;
  correlation: IntegrityCorrelationEvidence;
  db: Database;
  evidence: ComicPageCheckpointEvidence;
  comicId: string;
  page: number;
  readingSessionId: string;
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
      reason: "session_mismatch" as const,
      rewardedXp: 0,
      status: "unread" as ComicProgressStatus,
      trackingAvailable: true,
    };
  }

  const nowMs = Date.now();
  const checkpoint = applyCheckpoint({
    nowMs,
    page: params.page,
    state,
  });
  const rewardCheckpoint = applyRewardCheckpoint({
    evidence: params.evidence,
    nowMs,
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
      now: new Date(nowMs),
      state: nextState,
    });
    nextState = { ...nextState, pendingRewardPages: [] };
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
        reason: "tracking_unavailable" as const,
        rewardedXp: persistenceResult?.rewardedPages.length ?? 0,
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
    reason: rewardCheckpoint.reason,
    rewardedXp: persistenceResult?.rewardedPages.length ?? 0,
    status: getPersistedProgressStatus(
      nextState.totalPages,
      buildSessionProgressSnapshot(nextState)
    ),
    trackingAvailable: true,
    verifiedThroughPage: nextState.verifiedThroughPage,
  };
}
