import { and, eq, inArray } from "@repo/db";
import { userComicProgress } from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { getPatronTierRank } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import type { RedisClientType } from "redis";

import type { Context } from "../context";
import { getUserPatronTier } from "./profile";

const COMIC_READING_SESSION_TTL_SECONDS = 60 * 60 * 6;
const MIN_PAGE_ADVANCE_INTERVAL_MS = 400;
const NON_VIP_PERSIST_INTERVAL_MS = 30_000;
const NON_VIP_PERSIST_PAGE_DELTA = 3;

type Database = Context["db"];

export type ComicProgressStatus = "read" | "reading" | "unread" | "updated";

type ComicMetadata = {
  comicId: string;
  comicLastUpdateAt: Date | null;
  currentPageCount: number;
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
  lastAcceptedAtMs: number | null;
  lastAcceptedPage: number | null;
  lastPageRead: number;
  lastPersistedAtMs: number | null;
  lastPersistedPage: number;
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

  return JSON.parse(value) as ReadingSessionState;
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
    lastAcceptedAtMs: null,
    lastAcceptedPage: null,
    lastPageRead: normalizedProgress?.lastPageRead ?? 0,
    lastPersistedAtMs:
      normalizedProgress?.updatedAt.getTime() ??
      normalizedProgress?.lastReadTimestamp.getTime() ??
      null,
    lastPersistedPage: normalizedProgress?.lastPageRead ?? 0,
    startedAtMs: params.nowMs,
    totalPages: params.currentPageCount,
    totalPagesAtLastReadSnapshot:
      normalizedProgress?.totalPagesAtLastRead ?? params.currentPageCount,
    userId: params.userId,
    verifiedThroughPage,
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
      id: true,
      imageObjectKeys: true,
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
  };
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
  db: Database;
  now: Date;
  state: ReadingSessionState;
}) {
  const completed = params.state.completedSnapshot;
  const completedAt = parseCompletedAt(params.state.completedAtIso);

  await params.db
    .insert(userComicProgress)
    .values({
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
    })
    .onConflictDoUpdate({
      set: {
        completed,
        completedAt,
        lastPageRead: params.state.lastPageRead,
        lastReadTimestamp: params.now,
        totalPagesAtLastRead: completed
          ? params.state.totalPagesAtLastReadSnapshot
          : params.state.totalPages,
        updatedAt: params.now,
        verifiedThroughPage: params.state.verifiedThroughPage,
      },
      target: [userComicProgress.userId, userComicProgress.comicId],
    });
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

  await writeSessionState(params.cache, readingSessionId, sessionState);

  return {
    readingSessionId,
    ...buildProgressOverview({
      currentPageCount: comicMetadata.currentPageCount,
      progress,
      resumeEnabled: sessionState.canUseResume,
    }),
  };
}

export async function trackComicPageView(params: {
  cache: RedisClientType;
  db: Database;
  comicId: string;
  page: number;
  readingSessionId: string;
  userId: string;
}) {
  const state = await readSessionState(params.cache, params.readingSessionId);

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
      reason: "session_mismatch" as const,
      status: "unread" as ComicProgressStatus,
    };
  }

  const nowMs = Date.now();
  const checkpoint = applyCheckpoint({
    nowMs,
    page: params.page,
    state,
  });

  if (checkpoint.accepted) {
    await writeSessionState(
      params.cache,
      params.readingSessionId,
      checkpoint.nextState
    );
  }

  if (checkpoint.persisted) {
    await persistProgressRecord({
      db: params.db,
      now: new Date(nowMs),
      state: checkpoint.nextState,
    });
  }

  return {
    accepted: checkpoint.accepted,
    lastPageRead: checkpoint.nextState.lastPageRead,
    markedCompleted: checkpoint.markedCompleted,
    persisted: checkpoint.persisted,
    reason: checkpoint.reason,
    status: getPersistedProgressStatus(
      checkpoint.nextState.totalPages,
      buildSessionProgressSnapshot(checkpoint.nextState)
    ),
    verifiedThroughPage: checkpoint.nextState.verifiedThroughPage,
  };
}
