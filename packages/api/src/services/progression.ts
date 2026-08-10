import { isDeepStrictEqual } from "node:util";

import {
  and,
  desc,
  eq,
  gt,
  inArray,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
} from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisWallet,
  eterisTransaction,
  eterisPosting,
  user,
  userProgression,
  xpEvent,
  xpIntegrityCase,
  xpRiskSignal,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  ACCOUNT_LEVEL_REWARD_CONFIG_VERSION,
  ACCOUNT_LEVEL_XP_CAP,
  MAX_ACCOUNT_LEVEL,
  getAccountLevelProgress,
  getAccountLevelReward,
} from "@repo/shared/progression";

import { isUserBanActive } from "../utils/user-ban";
import {
  getOrCreateUserWalletInTransaction,
  postEterisTransactionInTransaction,
  reverseEterisTransactionByIdempotencyKeyInTransaction,
} from "./eteris";
import { createUserNotification } from "./notification";
import { ensureProgressionActivationInTransaction } from "./progression-activation";

export { ensureProgressionActivationInTransaction } from "./progression-activation";

type Database = typeof database;
export type ProgressionExecutor = Pick<
  Database,
  "insert" | "query" | "select" | "update"
>;

type ProgressionErrorCode =
  | "ACCOUNT_BANNED"
  | "ACCOUNT_CLOSED"
  | "ACCRUAL_DISABLED"
  | "ADJUSTMENT_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_TOTAL"
  | "PRE_ACTIVATION_EVENT"
  | "PROGRESSION_NOT_FOUND"
  | "PROJECTION_MISMATCH"
  | "VISIBILITY_DISABLED";

const MAX_OWNER_LEVEL_CHANGE = 25;

export class ProgressionError extends Error {
  readonly code: ProgressionErrorCode;

  constructor(code: ProgressionErrorCode) {
    super(code);
    this.name = "ProgressionError";
    this.code = code;
  }
}

async function getOrCreateUserProgression(
  executor: ProgressionExecutor,
  userId: string,
  now = new Date()
) {
  const account = await executor.query.user.findFirst({
    columns: { id: true },
    where: eq(user.id, userId),
  });
  if (!account) {
    throw new ProgressionError("PROGRESSION_NOT_FOUND");
  }
  await executor
    .insert(userProgression)
    .values({ updatedAt: now, userId })
    .onConflictDoNothing({ target: userProgression.userId });

  const progression = await executor.query.userProgression.findFirst({
    where: eq(userProgression.userId, userId),
  });
  if (!progression) {
    throw new Error("No se pudo crear la progresion de la cuenta.");
  }
  return progression;
}

export async function lockUserProgressionInTransaction(
  executor: ProgressionExecutor,
  userId: string,
  now = new Date()
) {
  await getOrCreateUserProgression(executor, userId, now);
  const [progression] = await executor
    .select()
    .from(userProgression)
    .where(eq(userProgression.userId, userId))
    .for("update");
  if (!progression) {
    throw new Error("No se pudo bloquear la progresion de la cuenta.");
  }
  return progression;
}

export async function getUserProgression(db: Database, userId: string) {
  const progression = await getOrCreateUserProgression(db, userId);
  const { level } = getAccountLevelProgress(progression.totalXp);
  return {
    accrualEnabled: env.XP_ACCRUAL_ENABLED,
    automaticRewards: Array.from(
      { length: Math.min(5, MAX_ACCOUNT_LEVEL - level) },
      (_, index) => {
        const rewardLevel = level + index + 1;
        return {
          amount: getAccountLevelReward(rewardLevel),
          level: rewardLevel,
        };
      }
    ),
    enabled: env.XP_ECONOMY_ENABLED,
    pendingXp: progression.pendingXp,
    totalXp: progression.totalXp,
    ...getAccountLevelProgress(progression.totalXp),
  };
}

export async function getPublicAccountLevel(
  db: Database,
  userId: string,
  now = new Date()
) {
  if (!env.XP_ECONOMY_ENABLED) {
    return null;
  }
  const account = await db.query.user.findFirst({
    columns: { banExpires: true, banned: true, id: true },
    where: eq(user.id, userId),
  });
  if (!account || isUserBanActive(account, now)) {
    return null;
  }

  const progression = await db.query.userProgression.findFirst({
    columns: { level: true },
    where: eq(userProgression.userId, userId),
  });
  return { level: progression?.level ?? 1 };
}

const HISTORY_LABELS = {
  admin_adjustment: "Corrección de Account XP",
  comment_milestone: "Hito de comentario",
  comic_reading: "Lectura verificada de cómic",
  reversal: "Reversión de Account XP",
  review_milestone: "Hito de reseña",
} as const;

export async function listUserXpHistory(
  db: Database,
  input: {
    authorizedStaff?: boolean;
    cursor?: { createdAt: Date; id: string };
    limit: number;
    userId: string;
  }
) {
  if (!env.XP_ECONOMY_ENABLED && !input.authorizedStaff) {
    throw new ProgressionError("VISIBILITY_DISABLED");
  }

  const cursorCondition = input.cursor
    ? or(
        lt(xpEvent.createdAt, input.cursor.createdAt),
        and(
          eq(xpEvent.createdAt, input.cursor.createdAt),
          lt(xpEvent.id, input.cursor.id)
        )
      )
    : undefined;
  const rows = await db
    .select({
      amount: xpEvent.amount,
      createdAt: xpEvent.createdAt,
      id: xpEvent.id,
      kind: xpEvent.kind,
      state: xpEvent.state,
    })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, input.userId), cursorCondition))
    .orderBy(desc(xpEvent.createdAt), desc(xpEvent.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((event) => ({
    amount: event.amount,
    createdAt: event.createdAt.toISOString(),
    id: event.id,
    kind: event.kind,
    label: HISTORY_LABELS[event.kind],
    state: event.state,
  }));
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

async function getActiveLevelRewardSources(
  executor: ProgressionExecutor,
  walletId: string
) {
  const transactions = await executor.query.eterisTransaction.findMany({
    columns: {
      id: true,
      kind: true,
      metadata: true,
      reversesTransactionId: true,
      sourceModule: true,
    },
    where: and(
      inArray(eterisTransaction.kind, ["level_reward", "reversal"]),
      eq(eterisTransaction.sourceModule, "progression"),
      sql`exists (
        select 1 from ${eterisPosting}
        where ${eterisPosting.transactionId} = ${eterisTransaction.id}
          and ${eterisPosting.walletId} = ${walletId}
      )`
    ),
  });
  const reversed = new Set(
    transactions.flatMap(({ reversesTransactionId }) =>
      reversesTransactionId ? [reversesTransactionId] : []
    )
  );
  const activeSources = new Map<number, string>();
  for (const transaction of transactions) {
    if (transaction.kind !== "level_reward" || reversed.has(transaction.id)) {
      continue;
    }
    const { metadata } = transaction;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }
    const level = "level" in metadata ? metadata.level : undefined;
    const xpEventId = "xpEventId" in metadata ? metadata.xpEventId : undefined;
    if (
      typeof level === "number" &&
      Number.isInteger(level) &&
      typeof xpEventId === "string"
    ) {
      activeSources.set(level, xpEventId);
    }
  }
  return activeSources;
}

export type XpEventCommand = {
  amount: number;
  createdBy?: string;
  idempotencyKey: string;
  integrityCaseId?: string;
  kind: typeof xpEvent.$inferInsert.kind;
  metadata?: Record<string, unknown>;
  milestone?: number;
  reasonCode: string;
  reversesEventId?: string;
  sourceRef: string;
  sourceCreatedAt?: Date;
  subjectId?: string;
  userId: string;
};

export function buildPendingXpReleaseCommand(
  event: Pick<
    typeof xpEvent.$inferSelect,
    | "amount"
    | "createdAt"
    | "id"
    | "kind"
    | "milestone"
    | "reasonCode"
    | "sourceRef"
    | "subjectId"
    | "userId"
  > & { metadata?: unknown },
  caseId: string,
  actorUserId?: string
): XpEventCommand {
  const metadata =
    event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return {
    amount: event.amount,
    createdBy: actorUserId,
    idempotencyKey: `pending-release:${event.id}`,
    integrityCaseId: caseId,
    kind: event.kind,
    metadata: { ...metadata, releasedPendingEventId: event.id },
    milestone: event.milestone ?? undefined,
    reasonCode: event.reasonCode,
    sourceCreatedAt: event.createdAt,
    sourceRef: event.sourceRef,
    subjectId: event.subjectId ?? undefined,
    userId: event.userId,
  };
}

export async function cancelPendingXpEventsInTransaction(
  tx: ProgressionExecutor,
  input: {
    actorUserId?: string;
    caseId?: string;
    closeEmptyCases?: boolean;
    eventId?: string;
    now: Date;
    decisionReason?: string;
    sourceRefPrefix?: string;
    subjectId?: string;
    userId?: string;
  }
) {
  const scopeCondition = input.eventId
    ? eq(xpEvent.id, input.eventId)
    : input.caseId
      ? eq(xpEvent.integrityCaseId, input.caseId)
      : input.subjectId
        ? eq(xpEvent.subjectId, input.subjectId)
        : input.sourceRefPrefix && input.userId
          ? and(
              eq(xpEvent.userId, input.userId),
              like(xpEvent.sourceRef, `${input.sourceRefPrefix}%`)
            )
          : null;
  if (!scopeCondition) {
    throw new Error("PENDING_XP_SCOPE_REQUIRED");
  }
  const events = await tx
    .select()
    .from(xpEvent)
    .where(and(eq(xpEvent.state, "pending"), scopeCondition))
    .for("update");
  if (events.length === 0) {
    return events;
  }

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
        events.map(({ id }) => id)
      )
    );
  const pendingByUser = new Map<string, number>();
  for (const event of events) {
    pendingByUser.set(
      event.userId,
      (pendingByUser.get(event.userId) ?? 0) + event.amount
    );
  }
  for (const [userId, pendingXp] of pendingByUser) {
    await tx
      .update(userProgression)
      .set({
        pendingXp: sql`greatest(0, ${userProgression.pendingXp} - ${pendingXp})`,
        updatedAt: input.now,
      })
      .where(eq(userProgression.userId, userId));
  }
  if (input.closeEmptyCases) {
    const caseIds = [
      ...new Set(
        events.flatMap(({ integrityCaseId }) =>
          integrityCaseId ? [integrityCaseId] : []
        )
      ),
    ];
    if (caseIds.length > 0) {
      const remaining = await tx
        .select({ integrityCaseId: xpEvent.integrityCaseId })
        .from(xpEvent)
        .where(
          and(
            inArray(xpEvent.integrityCaseId, caseIds),
            eq(xpEvent.state, "pending")
          )
        );
      const casesWithPending = new Set(
        remaining.flatMap(({ integrityCaseId }) =>
          integrityCaseId ? [integrityCaseId] : []
        )
      );
      const emptyCaseIds = caseIds.filter(
        (caseId) => !casesWithPending.has(caseId)
      );
      if (emptyCaseIds.length > 0) {
        await tx
          .update(xpIntegrityCase)
          .set({
            decidedAt: input.now,
            decidedBy: input.actorUserId,
            decisionReason:
              input.decisionReason ?? "El contenido de origen fue eliminado.",
            status: "dismissed",
            updatedAt: input.now,
          })
          .where(
            and(
              inArray(xpIntegrityCase.id, emptyCaseIds),
              eq(xpIntegrityCase.status, "open")
            )
          );
      }
    }
  }
  return events;
}

export async function releasePendingXpCaseInTransaction(
  tx: ProgressionExecutor,
  input: { actorUserId?: string; caseId: string; now: Date }
) {
  const pending = await tx
    .select()
    .from(xpEvent)
    .where(
      and(
        eq(xpEvent.integrityCaseId, input.caseId),
        eq(xpEvent.state, "pending")
      )
    )
    .for("update");
  const settlements: Awaited<ReturnType<typeof postXpEventInTransaction>>[] =
    [];
  for (const event of pending) {
    const settlement = await postXpEventInTransaction(
      tx,
      buildPendingXpReleaseCommand(event, input.caseId, input.actorUserId),
      input.now
    );
    if (
      "projectionMismatch" in settlement &&
      settlement.projectionMismatch === true
    ) {
      return {
        completed: false,
        settlements,
        userId: pending[0]?.userId ?? null,
      };
    }
    await cancelPendingXpEventsInTransaction(tx, {
      actorUserId: input.actorUserId,
      eventId: event.id,
      now: input.now,
    });
    settlements.push(settlement);
  }
  return {
    completed: true,
    settlements,
    userId: pending[0]?.userId ?? null,
  };
}

export async function releaseMaturedPendingXpInTransaction(
  tx: ProgressionExecutor,
  userId: string,
  now = new Date()
) {
  const cases = await tx
    .select({ createdAt: xpIntegrityCase.createdAt, id: xpIntegrityCase.id })
    .from(xpIntegrityCase)
    .where(
      and(
        eq(xpIntegrityCase.userId, userId),
        eq(xpIntegrityCase.riskLevel, "medium"),
        eq(xpIntegrityCase.status, "open"),
        lte(xpIntegrityCase.autoReleaseAt, now)
      )
    )
    .for("update");
  const settlements = [] as Awaited<
    ReturnType<typeof postXpEventInTransaction>
  >[];
  for (const integrityCase of cases) {
    const [additional] = await tx
      .select({ id: xpRiskSignal.id })
      .from(xpRiskSignal)
      .where(
        and(
          eq(xpRiskSignal.userId, userId),
          ne(xpRiskSignal.kind, "like_correlation_observation"),
          gt(xpRiskSignal.occurredAt, integrityCase.createdAt),
          gt(xpRiskSignal.expiresAt, now)
        )
      )
      .limit(1);
    if (additional) {
      continue;
    }
    const released = await releasePendingXpCaseInTransaction(tx, {
      caseId: integrityCase.id,
      now,
    });
    settlements.push(...released.settlements);
    if (!released.completed) {
      return { completed: false, settlements };
    }
    await tx
      .update(xpIntegrityCase)
      .set({
        decidedAt: now,
        decisionReason:
          "Liberacion automatica tras 24 horas sin senales adicionales",
        status: "released",
        updatedAt: now,
      })
      .where(eq(xpIntegrityCase.id, integrityCase.id));
  }
  return { completed: true, settlements };
}

export async function postXpEventInTransaction(
  tx: ProgressionExecutor,
  input: XpEventCommand,
  now = new Date()
) {
  if (input.amount > 0 && !env.XP_ACCRUAL_ENABLED) {
    throw new ProgressionError("ACCRUAL_DISABLED");
  }

  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);
  if (now < activatedAt) {
    throw new ProgressionError("PRE_ACTIVATION_EVENT");
  }

  const progression = await lockUserProgressionInTransaction(
    tx,
    input.userId,
    now
  );
  const existing = await tx.query.xpEvent.findFirst({
    where: eq(xpEvent.idempotencyKey, input.idempotencyKey),
  });
  if (existing) {
    const existingMetadata =
      typeof existing.metadata === "object" && existing.metadata !== null
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const existingRequestedAmount =
      typeof existingMetadata.requestedAmount === "number"
        ? existingMetadata.requestedAmount
        : existing.amount;
    if (
      existing.userId !== input.userId ||
      existingRequestedAmount !== input.amount ||
      existing.createdBy !== (input.createdBy ?? null) ||
      existing.kind !== input.kind ||
      (existing.integrityCaseId ?? null) !== (input.integrityCaseId ?? null) ||
      (existing.milestone ?? null) !== (input.milestone ?? null) ||
      existing.reasonCode !== input.reasonCode ||
      existing.reversesEventId !== (input.reversesEventId ?? null) ||
      existing.sourceRef !== input.sourceRef ||
      (input.sourceCreatedAt &&
        existing.createdAt.getTime() !== input.sourceCreatedAt.getTime()) ||
      (existing.subjectId ?? null) !== (input.subjectId ?? null) ||
      Object.entries(input.metadata ?? {}).some(
        ([key, value]) => !isDeepStrictEqual(existingMetadata[key], value)
      )
    ) {
      throw new ProgressionError("IDEMPOTENCY_CONFLICT");
    }
    return {
      debtCreated: false,
      eventId: existing.id,
      level: progression.level,
      previousLevel: progression.level,
      replayed: true,
      settledXp: existing.amount,
      totalXp: progression.totalXp,
    };
  }

  const existingWallet = await tx.query.eterisWallet.findFirst({
    columns: { status: true },
    where: eq(eterisWallet.userId, input.userId),
  });
  if (existingWallet && existingWallet.status !== "active") {
    throw new ProgressionError("ACCOUNT_CLOSED");
  }

  if (input.amount > 0) {
    const account = await tx.query.user.findFirst({
      columns: { banExpires: true, banned: true },
      where: eq(user.id, input.userId),
    });
    if (!account || isUserBanActive(account, now)) {
      throw new ProgressionError("ACCOUNT_BANNED");
    }
  }

  const settledXp =
    input.amount > 0
      ? Math.min(input.amount, ACCOUNT_LEVEL_XP_CAP - progression.totalXp)
      : input.kind === "reversal"
        ? Math.max(input.amount, -progression.totalXp)
        : input.amount;
  if (settledXp === 0) {
    return {
      debtCreated: false,
      eventId: null,
      level: progression.level,
      previousLevel: progression.level,
      replayed: false,
      settledXp: 0,
      totalXp: progression.totalXp,
    };
  }
  const totalXp = progression.totalXp + settledXp;
  let level: number;
  try {
    ({ level } = getAccountLevelProgress(totalXp));
  } catch {
    throw new ProgressionError("INVALID_TOTAL");
  }
  if (
    input.kind === "admin_adjustment" &&
    Math.abs(level - progression.level) > MAX_OWNER_LEVEL_CHANGE
  ) {
    throw new ProgressionError("ADJUSTMENT_TOO_LARGE");
  }

  const eventId = generateId();
  let debtCreated = false;
  if (level !== progression.level) {
    const wallet = await getOrCreateUserWalletInTransaction(
      tx,
      input.userId,
      now
    );
    if (level > progression.level) {
      for (
        let crossedLevel = progression.level + 1;
        crossedLevel <= level;
        crossedLevel += 1
      ) {
        const amount = BigInt(getAccountLevelReward(crossedLevel));
        const reward = await postEterisTransactionInTransaction(tx, {
          idempotencyKey: `level-reward:${eventId}:${crossedLevel}`,
          kind: "level_reward",
          metadata: {
            level: crossedLevel,
            rewardConfigVersion: ACCOUNT_LEVEL_REWARD_CONFIG_VERSION,
            xpEventId: eventId,
          },
          postings: [
            { amount, walletId: wallet.id },
            { amount: -amount, walletId: "eteris-system-mint" },
          ],
          sourceModule: "progression",
          sourceRef: `xp-event:${eventId}:level:${crossedLevel}`,
        });
        if ("mismatched" in reward) {
          return {
            debtCreated: false,
            eventId: null,
            level: progression.level,
            previousLevel: progression.level,
            projectionMismatch: true,
            replayed: false,
            settledXp: 0,
            totalXp: progression.totalXp,
          };
        }
      }
    } else {
      const activeSources = await getActiveLevelRewardSources(tx, wallet.id);
      for (
        let lostLevel = progression.level;
        lostLevel > level;
        lostLevel -= 1
      ) {
        const sourceEventId = activeSources.get(lostLevel);
        if (!sourceEventId) {
          throw new ProgressionError("INVALID_TOTAL");
        }
        const reversal =
          await reverseEterisTransactionByIdempotencyKeyInTransaction(tx, {
            idempotencyKey: `level-reward-reversal:${eventId}:${lostLevel}`,
            originalIdempotencyKey: `level-reward:${sourceEventId}:${lostLevel}`,
            reason: `Reversion automatica del nivel ${lostLevel}`,
            sourceRef: `xp-event:${eventId}:lost-level:${lostLevel}`,
          });
        if ("mismatched" in reversal) {
          return {
            debtCreated: false,
            eventId: null,
            level: progression.level,
            previousLevel: progression.level,
            projectionMismatch: true,
            replayed: false,
            settledXp: 0,
            totalXp: progression.totalXp,
          };
        }
        if ("debtCreated" in reversal && reversal.debtCreated) {
          debtCreated = true;
        }
      }
    }
  }
  await tx.insert(xpEvent).values({
    amount: settledXp,
    createdBy: input.createdBy,
    createdAt: input.sourceCreatedAt,
    id: eventId,
    idempotencyKey: input.idempotencyKey,
    integrityCaseId: input.integrityCaseId,
    kind: input.kind,
    metadata: {
      ...input.metadata,
      levelAfter: level,
      levelBefore: progression.level,
      requestedAmount: input.amount,
    },
    milestone: input.milestone,
    reasonCode: input.reasonCode,
    reversesEventId: input.reversesEventId,
    sourceRef: input.sourceRef,
    state: "posted",
    subjectId: input.subjectId,
    updatedAt: now,
    userId: input.userId,
  });
  await tx
    .update(userProgression)
    .set({ level, totalXp, updatedAt: now })
    .where(eq(userProgression.userId, input.userId));

  return {
    debtCreated,
    eventId,
    level,
    previousLevel: progression.level,
    replayed: false,
    settledXp,
    totalXp,
  };
}

export async function createPendingXpEventInTransaction(
  tx: ProgressionExecutor,
  input: XpEventCommand & {
    availableAt?: Date;
    integrityCaseId: string;
  },
  now = new Date()
) {
  if (input.amount <= 0) {
    throw new ProgressionError("INVALID_TOTAL");
  }
  if (!env.XP_ACCRUAL_ENABLED) {
    throw new ProgressionError("ACCRUAL_DISABLED");
  }
  const activatedAt = await ensureProgressionActivationInTransaction(tx, now);
  if (now < activatedAt) {
    throw new ProgressionError("PRE_ACTIVATION_EVENT");
  }
  const progression = await lockUserProgressionInTransaction(
    tx,
    input.userId,
    now
  );
  const existing = await tx.query.xpEvent.findFirst({
    where: eq(xpEvent.idempotencyKey, input.idempotencyKey),
  });
  if (existing) {
    if (
      existing.userId !== input.userId ||
      existing.amount !== input.amount ||
      existing.integrityCaseId !== input.integrityCaseId ||
      existing.state !== "pending"
    ) {
      throw new ProgressionError("IDEMPOTENCY_CONFLICT");
    }
    return {
      eventId: existing.id,
      pendingXp: progression.pendingXp,
      replayed: true,
    };
  }
  const account = await tx.query.user.findFirst({
    columns: { banExpires: true, banned: true },
    where: eq(user.id, input.userId),
  });
  if (!account || isUserBanActive(account, now)) {
    throw new ProgressionError("ACCOUNT_BANNED");
  }
  const wallet = await tx.query.eterisWallet.findFirst({
    columns: { status: true },
    where: eq(eterisWallet.userId, input.userId),
  });
  if (wallet && wallet.status !== "active") {
    throw new ProgressionError("ACCOUNT_CLOSED");
  }

  const eventId = generateId();
  const pendingXp = progression.pendingXp + input.amount;
  await tx.insert(xpEvent).values({
    amount: input.amount,
    availableAt: input.availableAt,
    createdBy: input.createdBy,
    id: eventId,
    idempotencyKey: input.idempotencyKey,
    integrityCaseId: input.integrityCaseId,
    kind: input.kind,
    metadata: input.metadata,
    milestone: input.milestone,
    reasonCode: input.reasonCode,
    sourceRef: input.sourceRef,
    state: "pending",
    subjectId: input.subjectId,
    updatedAt: now,
    userId: input.userId,
  });
  await tx
    .update(userProgression)
    .set({ pendingXp, updatedAt: now })
    .where(eq(userProgression.userId, input.userId));
  return { eventId, pendingXp, replayed: false };
}

export async function notifyXpSettlementInTransaction(
  tx: Parameters<typeof createUserNotification>[0],
  userId: string,
  result: Awaited<ReturnType<typeof postXpEventInTransaction>>
) {
  if (!result.replayed && result.level > result.previousLevel) {
    await createUserNotification(tx, {
      description: `Alcanzaste el Account Level ${result.level}. Tus recompensas de Eteris se acreditaron automaticamente.`,
      metadata: {
        category: "account_level_up",
        level: result.level,
        linkPath: "/profile?section=progression",
      },
      targetUserId: userId,
      title: `Subiste al nivel ${result.level}`,
    });
  }
  if (!result.replayed && result.debtCreated) {
    await createUserNotification(tx, {
      description:
        "Una reversion de nivel dejo tu Billetera Eteris con deuda. No podras gastar hasta saldarla.",
      metadata: {
        category: "eteris_debt",
        linkPath: "/profile?section=wallet",
      },
      targetUserId: userId,
      title: "Tu Billetera Eteris tiene deuda",
    });
  }
}

export function notifyXpSettlement(
  db: Database,
  userId: string,
  result: Awaited<ReturnType<typeof postXpEventInTransaction>>
) {
  if (
    result.replayed ||
    (result.level <= result.previousLevel && !result.debtCreated)
  ) {
    return Promise.resolve();
  }
  return db.transaction((tx) =>
    notifyXpSettlementInTransaction(tx, userId, result)
  );
}

export async function postXpEvent(
  db: Database,
  input: XpEventCommand,
  ownerAdjustment?: { actorUserId: string }
) {
  const result = await db.transaction(async (tx) => {
    const settlement = await postXpEventInTransaction(tx, input);
    if (
      ownerAdjustment &&
      !("projectionMismatch" in settlement) &&
      settlement.eventId !== null
    ) {
      await notifyXpSettlementInTransaction(tx, input.userId, settlement);
      if (!settlement.replayed) {
        await createUserNotification(tx, {
          description:
            "El propietario ajusto tu Account XP. Consulta tu historial para ver el movimiento.",
          metadata: {
            category: "xp_owner_adjustment",
            linkPath: "/profile?section=progression",
          },
          sourceUserId: ownerAdjustment.actorUserId,
          targetUserId: input.userId,
          title: "Tu Account XP fue ajustado",
        });
      }
    }
    return settlement;
  });

  if (
    ownerAdjustment &&
    "projectionMismatch" in result &&
    result.projectionMismatch === true
  ) {
    throw new ProgressionError("PROJECTION_MISMATCH");
  }
  if (ownerAdjustment && !result.replayed && result.eventId === null) {
    throw new ProgressionError("INVALID_TOTAL");
  }
  if (!ownerAdjustment) {
    await notifyXpSettlement(db, input.userId, result);
  }
  return {
    eventId: result.eventId,
    level: result.level,
    settledXp: result.settledXp,
    totalXp: result.totalXp,
  };
}

export function adjustXp(
  db: Database,
  input: {
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    reason: string;
    userId: string;
  }
) {
  return postXpEvent(
    db,
    {
      amount: input.amount,
      createdBy: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      kind: "admin_adjustment",
      metadata: { reason: input.reason },
      reasonCode: "owner_adjustment",
      sourceRef: `owner-adjustment:${input.idempotencyKey}`,
      userId: input.userId,
    },
    { actorUserId: input.actorUserId }
  );
}
