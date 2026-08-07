import { isDeepStrictEqual } from "node:util";

import { and, asc, desc, eq, lt, or } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisWallet,
  eterisWalletBalance,
  user,
  userProgression,
  xpEvent,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  ACCOUNT_LEVEL_REWARD_CONFIG_VERSION,
  MAX_ACCOUNT_LEVEL,
  getAccountLevelProgress,
  getAccountLevelReward,
} from "@repo/shared/progression";

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
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_TOTAL"
  | "PRE_ACTIVATION_EVENT"
  | "VISIBILITY_DISABLED";

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

export async function getPublicAccountLevel(db: Database, userId: string) {
  const account = await db.query.user.findFirst({
    columns: { banned: true, id: true },
    where: eq(user.id, userId),
  });
  if (!account || account.banned) {
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
  userId: string,
  expectedTotalXp: number
) {
  const events = await executor
    .select({ amount: xpEvent.amount, id: xpEvent.id })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), eq(xpEvent.state, "posted")))
    .orderBy(asc(xpEvent.createdAt), asc(xpEvent.id));
  const activeSources = new Map<number, string>();
  let totalXp = 0;

  // ponytail: reversals scan one user's XP history; persist active crossings if reversal volume makes this measurable.
  for (const event of events) {
    const previousLevel = getAccountLevelProgress(totalXp).level;
    totalXp += event.amount;
    const { level } = getAccountLevelProgress(totalXp);
    if (level > previousLevel) {
      for (
        let crossedLevel = previousLevel + 1;
        crossedLevel <= level;
        crossedLevel += 1
      ) {
        activeSources.set(crossedLevel, event.id);
      }
    } else if (level < previousLevel) {
      for (let lostLevel = previousLevel; lostLevel > level; lostLevel -= 1) {
        activeSources.delete(lostLevel);
      }
    }
  }
  if (totalXp !== expectedTotalXp) {
    throw new ProgressionError("INVALID_TOTAL");
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
  const existingWallet = await tx.query.eterisWallet.findFirst({
    columns: { status: true },
    where: eq(eterisWallet.userId, input.userId),
  });
  if (existingWallet && existingWallet.status !== "active") {
    throw new ProgressionError("ACCOUNT_CLOSED");
  }

  const existing = await tx.query.xpEvent.findFirst({
    where: eq(xpEvent.idempotencyKey, input.idempotencyKey),
  });
  if (existing) {
    const existingMetadata =
      typeof existing.metadata === "object" && existing.metadata !== null
        ? (existing.metadata as Record<string, unknown>)
        : {};
    if (
      existing.userId !== input.userId ||
      existing.amount !== input.amount ||
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
      totalXp: progression.totalXp,
    };
  }

  if (input.amount > 0) {
    const account = await tx.query.user.findFirst({
      columns: { banned: true },
      where: eq(user.id, input.userId),
    });
    if (!account || account.banned) {
      throw new ProgressionError("ACCOUNT_BANNED");
    }
  }

  const totalXp = progression.totalXp + input.amount;
  let level: number;
  try {
    ({ level } = getAccountLevelProgress(totalXp));
  } catch {
    throw new ProgressionError("INVALID_TOTAL");
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
        await postEterisTransactionInTransaction(tx, {
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
      }
    } else {
      const activeSources = await getActiveLevelRewardSources(
        tx,
        input.userId,
        progression.totalXp
      );
      for (
        let lostLevel = progression.level;
        lostLevel > level;
        lostLevel -= 1
      ) {
        const sourceEventId = activeSources.get(lostLevel);
        if (!sourceEventId) {
          throw new ProgressionError("INVALID_TOTAL");
        }
        await reverseEterisTransactionByIdempotencyKeyInTransaction(tx, {
          idempotencyKey: `level-reward-reversal:${eventId}:${lostLevel}`,
          originalIdempotencyKey: `level-reward:${sourceEventId}:${lostLevel}`,
          reason: `Reversion automatica del nivel ${lostLevel}`,
          sourceRef: `xp-event:${eventId}:lost-level:${lostLevel}`,
        });
      }
      const settledBalance = await tx.query.eterisWalletBalance.findFirst({
        where: eq(eterisWalletBalance.walletId, wallet.id),
      });
      if (!settledBalance) {
        throw new Error("No se pudo leer el saldo Eteris asentado.");
      }
      debtCreated = wallet.balance >= 0n && settledBalance.balance < 0n;
    }
  }
  await tx.insert(xpEvent).values({
    amount: input.amount,
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
    columns: { banned: true },
    where: eq(user.id, input.userId),
  });
  if (!account || account.banned) {
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

export async function notifyXpSettlement(
  db: Database,
  userId: string,
  result: Awaited<ReturnType<typeof postXpEventInTransaction>>
) {
  if (!result.replayed && result.level > result.previousLevel) {
    await db.transaction((tx) =>
      createUserNotification(tx, {
        description: `Alcanzaste el Account Level ${result.level}. Tus recompensas de Eteris se acreditaron automaticamente.`,
        metadata: {
          category: "account_level_up",
          level: result.level,
          linkPath: "/profile?section=progression",
        },
        targetUserId: userId,
        title: `Subiste al nivel ${result.level}`,
      })
    );
  }
  if (!result.replayed && result.debtCreated) {
    await db.transaction((tx) =>
      createUserNotification(tx, {
        description:
          "Una reversion de nivel dejo tu Billetera Eteris con deuda. No podras gastar hasta saldarla.",
        metadata: {
          category: "eteris_debt",
          linkPath: "/profile?section=wallet",
        },
        targetUserId: userId,
        title: "Tu Billetera Eteris tiene deuda",
      })
    );
  }
}

export function postXpEvent(
  db: Database,
  input: XpEventCommand,
  ownerAdjustment?: { actorUserId: string }
) {
  const settlement = db.transaction((tx) =>
    postXpEventInTransaction(tx, input)
  );
  return settlement.then(async (result) => {
    await notifyXpSettlement(db, input.userId, result);
    if (!result.replayed && ownerAdjustment) {
      await db.transaction((tx) =>
        createUserNotification(tx, {
          description:
            "El propietario ajusto tu Account XP. Consulta tu historial para ver el movimiento.",
          metadata: {
            category: "xp_owner_adjustment",
            linkPath: "/profile?section=progression",
          },
          sourceUserId: ownerAdjustment.actorUserId,
          targetUserId: input.userId,
          title: "Tu Account XP fue ajustado",
        })
      );
    }
    return {
      eventId: result.eventId,
      level: result.level,
      totalXp: result.totalXp,
    };
  });
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
