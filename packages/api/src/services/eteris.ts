import { isDeepStrictEqual } from "node:util";

import { and, asc, desc, eq, inArray, lt, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisPosting,
  eterisTransaction,
  eterisWallet,
  eterisWalletBalance,
  eterisWalletReconciliation,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  ETERIS_MAX_AMOUNT,
  ETERIS_MIN_AMOUNT,
  ETERIS_SOURCE_MODULES,
  ETERIS_SYSTEM_WALLETS,
} from "@repo/shared/eteris";
import type {
  EterisSourceModule,
  EterisTransactionKind,
} from "@repo/shared/eteris";
import { z } from "zod";

import { createUserNotification } from "./notification";
import { ensureProgressionActivationInTransaction } from "./progression-activation";

type Database = typeof database;
export type EterisExecutor = Pick<
  Database,
  "insert" | "query" | "select" | "update"
>;
type Posting = { amount: bigint; walletId: string };

export type EterisTransactionInput = {
  actorUserId?: string;
  createdAt?: Date;
  debtPolicy?: "forbid" | "trusted-recovery";
  idempotencyKey: string;
  kind: EterisTransactionKind;
  metadata?: Record<string, unknown>;
  postings: Posting[];
  reason?: string;
  reversesTransactionId?: string;
  sourceModule: EterisSourceModule;
  sourceRef: string;
  spending?: boolean;
};

const ZERO = 0n;
const metadataSchema = z.record(z.string(), z.unknown());

type EterisErrorCode =
  | "ACCRUAL_DISABLED"
  | "CLOSED_OR_FROZEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_POSTINGS"
  | "PROJECTION_MISMATCH"
  | "SPENDING_DISABLED"
  | "VISIBILITY_DISABLED"
  | "WALLET_NOT_FOUND";

export class EterisError extends Error {
  readonly code: EterisErrorCode;

  constructor(code: EterisErrorCode) {
    super(code);
    this.name = "EterisError";
    this.code = code;
  }
}

function assertSignedBigint(value: bigint) {
  if (value < ETERIS_MIN_AMOUNT || value > ETERIS_MAX_AMOUNT) {
    throw new EterisError("INVALID_POSTINGS");
  }
}

function consolidatePostings(postings: Posting[]) {
  const amounts = new Map<string, bigint>();
  for (const posting of postings) {
    assertSignedBigint(posting.amount);
    amounts.set(
      posting.walletId,
      (amounts.get(posting.walletId) ?? ZERO) + posting.amount
    );
  }
  const consolidated = [...amounts]
    .filter(([, amount]) => amount !== ZERO)
    .map(([walletId, amount]) => ({ amount, walletId }))
    .toSorted((left, right) => left.walletId.localeCompare(right.walletId));
  if (
    consolidated.length < 2 ||
    consolidated.reduce((total, posting) => total + posting.amount, ZERO) !==
      ZERO
  ) {
    throw new EterisError("INVALID_POSTINGS");
  }
  for (const posting of consolidated) {
    assertSignedBigint(posting.amount);
  }
  return consolidated;
}

async function ensureSystemWallets(executor: EterisExecutor, now: Date) {
  await executor
    .insert(eterisWallet)
    .values(
      ETERIS_SYSTEM_WALLETS.map((wallet) => ({
        ...wallet,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing({ target: eterisWallet.id });
  await executor
    .insert(eterisWalletBalance)
    .values(
      ETERIS_SYSTEM_WALLETS.map(({ id }) => ({
        updatedAt: now,
        walletId: id,
      }))
    )
    .onConflictDoNothing({ target: eterisWalletBalance.walletId });
}

export async function getOrCreateUserWalletInTransaction(
  executor: EterisExecutor,
  userId: string,
  now = new Date()
) {
  await ensureSystemWallets(executor, now);
  await executor
    .insert(eterisWallet)
    .values({ id: generateId(), kind: "user", updatedAt: now, userId })
    .onConflictDoNothing({ target: eterisWallet.userId });
  const wallet = await executor.query.eterisWallet.findFirst({
    where: eq(eterisWallet.userId, userId),
  });
  if (!wallet) {
    throw new EterisError("WALLET_NOT_FOUND");
  }
  await executor
    .insert(eterisWalletBalance)
    .values({ updatedAt: now, walletId: wallet.id })
    .onConflictDoNothing({ target: eterisWalletBalance.walletId });
  const balance = await executor.query.eterisWalletBalance.findFirst({
    where: eq(eterisWalletBalance.walletId, wallet.id),
  });
  if (!balance) {
    throw new EterisError("WALLET_NOT_FOUND");
  }
  return { ...wallet, balance: balance.balance };
}

export async function getUserWallet(db: Database, userId: string) {
  const [wallet, account] = await Promise.all([
    db.transaction((tx) => getOrCreateUserWalletInTransaction(tx, userId)),
    db.query.user.findFirst({
      columns: { banned: true },
      where: eq(user.id, userId),
    }),
  ]);
  return {
    balance: wallet.balance.toString(),
    canSpend:
      env.XP_ECONOMY_ENABLED &&
      env.ETERIS_SPENDING_ENABLED &&
      !account?.banned &&
      wallet.status === "active" &&
      wallet.balance >= ZERO,
    debt: wallet.balance < ZERO,
    enabled: env.XP_ECONOMY_ENABLED,
    publicBalance: wallet.publicBalance,
    spendingEnabled: env.ETERIS_SPENDING_ENABLED,
    status: wallet.status,
  };
}

export function setPublicWalletBalance(
  db: Database,
  userId: string,
  publicBalance: boolean
) {
  if (!env.XP_ECONOMY_ENABLED) {
    throw new EterisError("VISIBILITY_DISABLED");
  }
  return db.transaction(async (tx) => {
    const wallet = await getOrCreateUserWalletInTransaction(tx, userId);
    const [locked] = await lockEterisWalletsInTransaction(tx, [wallet.id]);
    if (locked?.status !== "active") {
      throw new EterisError("CLOSED_OR_FROZEN");
    }
    await tx
      .update(eterisWallet)
      .set({ publicBalance })
      .where(eq(eterisWallet.id, wallet.id));
    return { publicBalance };
  });
}

export async function getPublicWalletBalance(db: Database, userId: string) {
  if (!env.XP_ECONOMY_ENABLED) {
    return null;
  }
  const account = await db.query.user.findFirst({
    columns: { banned: true },
    where: eq(user.id, userId),
  });
  if (!account || account.banned) {
    return null;
  }
  const wallet = await db.query.eterisWallet.findFirst({
    columns: { id: true, publicBalance: true },
    where: eq(eterisWallet.userId, userId),
  });
  if (!wallet?.publicBalance) {
    return null;
  }
  const balance = await db.query.eterisWalletBalance.findFirst({
    columns: { balance: true },
    where: eq(eterisWalletBalance.walletId, wallet.id),
  });
  return balance && balance.balance >= ZERO
    ? { balance: balance.balance.toString() }
    : null;
}

function loadExistingPostings(executor: EterisExecutor, transactionId: string) {
  return executor
    .select({ amount: eterisPosting.amount, walletId: eterisPosting.walletId })
    .from(eterisPosting)
    .where(eq(eterisPosting.transactionId, transactionId))
    .orderBy(asc(eterisPosting.walletId));
}

function samePostings(left: Posting[], right: Posting[]) {
  return (
    left.length === right.length &&
    left.every(
      (posting, index) =>
        posting.walletId === right[index]?.walletId &&
        posting.amount === right[index]?.amount
    )
  );
}

export function lockEterisWalletsInTransaction(
  executor: EterisExecutor,
  walletIds: string[]
) {
  return executor
    .select({
      balance: eterisWalletBalance.balance,
      kind: eterisWallet.kind,
      status: eterisWallet.status,
      userId: eterisWallet.userId,
      walletId: eterisWallet.id,
    })
    .from(eterisWalletBalance)
    .innerJoin(eterisWallet, eq(eterisWallet.id, eterisWalletBalance.walletId))
    .where(inArray(eterisWalletBalance.walletId, walletIds.toSorted()))
    .orderBy(asc(eterisWalletBalance.walletId))
    .for("update");
}

async function settleEterisTransaction(
  db: Database | EterisExecutor,
  input: EterisTransactionInput
) {
  if (
    (input.spending ||
      ["auction", "gacha", "purchase", "trade"].includes(input.kind)) &&
    !env.ETERIS_SPENDING_ENABLED
  ) {
    throw new EterisError("SPENDING_DISABLED");
  }
  if (!ETERIS_SOURCE_MODULES.includes(input.sourceModule)) {
    throw new EterisError("INVALID_POSTINGS");
  }
  if (
    (input.kind === "admin_adjustment" || input.kind === "reversal") &&
    !input.reason?.trim()
  ) {
    throw new EterisError("INVALID_POSTINGS");
  }

  const metadata = metadataSchema.parse(input.metadata ?? {});
  const postings = consolidatePostings(input.postings);
  if (
    input.debtPolicy === "trusted-recovery" &&
    !(
      (input.kind === "admin_adjustment" && input.sourceModule === "owner") ||
      (input.kind === "reversal" &&
        ["account", "progression"].includes(input.sourceModule)) ||
      (input.kind === "refund" && input.sourceModule === "commerce") ||
      (input.kind === "account_closure" && input.sourceModule === "account")
    )
  ) {
    throw new EterisError("INVALID_POSTINGS");
  }
  const settle = async (tx: EterisExecutor) => {
    const replay = await tx.query.eterisTransaction.findFirst({
      where: eq(eterisTransaction.idempotencyKey, input.idempotencyKey),
    });
    if (replay) {
      const replayPostings = await loadExistingPostings(tx, replay.id);
      if (
        replay.kind !== input.kind ||
        replay.sourceModule !== input.sourceModule ||
        replay.sourceRef !== input.sourceRef ||
        replay.reason !== (input.reason ?? null) ||
        replay.reversesTransactionId !==
          (input.reversesTransactionId ?? null) ||
        !isDeepStrictEqual(replay.metadata, metadata) ||
        !samePostings(replayPostings, postings)
      ) {
        throw new EterisError("IDEMPOTENCY_CONFLICT");
      }
      return { id: replay.id, replayed: true } as const;
    }

    const walletIds = postings.map(({ walletId }) => walletId);
    const locked = await lockEterisWalletsInTransaction(tx, walletIds);
    if (locked.length !== walletIds.length) {
      throw new EterisError("WALLET_NOT_FOUND");
    }

    const replayAfterLock = await tx.query.eterisTransaction.findFirst({
      where: eq(eterisTransaction.idempotencyKey, input.idempotencyKey),
    });
    if (replayAfterLock) {
      const replayPostings = await loadExistingPostings(tx, replayAfterLock.id);
      if (
        replayAfterLock.kind !== input.kind ||
        replayAfterLock.sourceModule !== input.sourceModule ||
        replayAfterLock.sourceRef !== input.sourceRef ||
        replayAfterLock.reason !== (input.reason ?? null) ||
        replayAfterLock.reversesTransactionId !==
          (input.reversesTransactionId ?? null) ||
        !isDeepStrictEqual(replayAfterLock.metadata, metadata) ||
        !samePostings(replayPostings, postings)
      ) {
        throw new EterisError("IDEMPOTENCY_CONFLICT");
      }
      return { id: replayAfterLock.id, replayed: true } as const;
    }

    const mismatched: string[] = [];
    for (const wallet of locked) {
      const [latest] = await tx
        .select({ balanceAfter: eterisPosting.balanceAfter })
        .from(eterisPosting)
        .innerJoin(
          eterisTransaction,
          eq(eterisTransaction.id, eterisPosting.transactionId)
        )
        .where(eq(eterisPosting.walletId, wallet.walletId))
        .orderBy(desc(eterisTransaction.sequence))
        .limit(1);
      if (latest && latest.balanceAfter !== wallet.balance) {
        mismatched.push(wallet.walletId);
      }
    }
    if (mismatched.length) {
      await tx
        .update(eterisWallet)
        .set({ status: "frozen" })
        .where(inArray(eterisWallet.id, mismatched));
      return { mismatched } as const;
    }

    const lockedById = new Map(
      locked.map((wallet) => [wallet.walletId, wallet])
    );
    if (input.spending) {
      for (const wallet of locked) {
        if (wallet.kind !== "user" || !wallet.userId) {
          continue;
        }
        const account = await tx.query.user.findFirst({
          columns: { banned: true },
          where: eq(user.id, wallet.userId),
        });
        if (!account || account.banned) {
          throw new EterisError("CLOSED_OR_FROZEN");
        }
      }
    }
    const balances = postings.map((posting) => {
      const wallet = lockedById.get(posting.walletId)!;
      if (wallet.status !== "active") {
        throw new EterisError("CLOSED_OR_FROZEN");
      }
      const balanceAfter = wallet.balance + posting.amount;
      assertSignedBigint(balanceAfter);
      if (
        wallet.kind === "user" &&
        posting.amount < ZERO &&
        balanceAfter < ZERO &&
        input.debtPolicy !== "trusted-recovery"
      ) {
        throw new EterisError("INSUFFICIENT_FUNDS");
      }
      return { ...posting, balanceAfter };
    });
    const debtCreated = balances.some((posting) => {
      const wallet = lockedById.get(posting.walletId)!;
      return (
        wallet.kind === "user" &&
        wallet.balance >= ZERO &&
        posting.balanceAfter < ZERO
      );
    });

    const transactionId = generateId();
    await tx.insert(eterisTransaction).values({
      actorUserId: input.actorUserId,
      createdAt: input.createdAt,
      id: transactionId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      metadata,
      reason: input.reason,
      reversesTransactionId: input.reversesTransactionId,
      sourceModule: input.sourceModule,
      sourceRef: input.sourceRef,
    });
    await tx.insert(eterisPosting).values(
      balances.map((posting) => ({
        amount: posting.amount,
        balanceAfter: posting.balanceAfter,
        transactionId,
        walletId: posting.walletId,
      }))
    );
    const now = new Date();
    for (const posting of balances) {
      await tx
        .update(eterisWalletBalance)
        .set({ balance: posting.balanceAfter, updatedAt: now })
        .where(eq(eterisWalletBalance.walletId, posting.walletId));
    }
    return { debtCreated, id: transactionId, replayed: false } as const;
  };
  const result =
    "transaction" in db ? await db.transaction(settle) : await settle(db);

  return result;
}

export async function postEterisTransaction(
  db: Database,
  input: EterisTransactionInput
) {
  const result = await settleEterisTransaction(db, input);
  if ("mismatched" in result) {
    throw new EterisError("PROJECTION_MISMATCH");
  }
  return result;
}

export function postEterisTransactionInTransaction(
  tx: EterisExecutor,
  input: EterisTransactionInput
) {
  return settleEterisTransaction(tx, input);
}

export async function reverseEterisTransactionByIdempotencyKeyInTransaction(
  tx: EterisExecutor,
  input: {
    idempotencyKey: string;
    originalIdempotencyKey: string;
    reason: string;
    sourceRef: string;
  }
) {
  const original = await tx.query.eterisTransaction.findFirst({
    where: eq(eterisTransaction.idempotencyKey, input.originalIdempotencyKey),
  });
  if (!original) {
    throw new EterisError("WALLET_NOT_FOUND");
  }
  const originalPostings = await loadExistingPostings(tx, original.id);
  return postEterisTransactionInTransaction(tx, {
    debtPolicy: "trusted-recovery",
    idempotencyKey: input.idempotencyKey,
    kind: "reversal",
    metadata: { originalKind: original.kind },
    postings: originalPostings.map((posting) => ({
      amount: -posting.amount,
      walletId: posting.walletId,
    })),
    reason: input.reason,
    reversesTransactionId: original.id,
    sourceModule: "progression",
    sourceRef: input.sourceRef,
  });
}

export async function adjustEteris(
  db: Database,
  input: {
    actorUserId: string;
    amount: bigint;
    idempotencyKey: string;
    reason: string;
    userId: string;
  }
) {
  if (!env.XP_ACCRUAL_ENABLED) {
    throw new EterisError("ACCRUAL_DISABLED");
  }
  const result = await db.transaction(async (tx) => {
    const now = new Date();
    await ensureProgressionActivationInTransaction(tx, now);
    const wallet = await getOrCreateUserWalletInTransaction(
      tx,
      input.userId,
      now
    );
    return postEterisTransactionInTransaction(tx, {
      actorUserId: input.actorUserId,
      debtPolicy: "trusted-recovery",
      idempotencyKey: input.idempotencyKey,
      kind: "admin_adjustment",
      postings: [
        { amount: input.amount, walletId: wallet.id },
        { amount: -input.amount, walletId: ETERIS_SYSTEM_WALLETS[0].id },
      ],
      reason: input.reason,
      sourceModule: "owner",
      sourceRef: `owner-adjustment:${input.idempotencyKey}`,
    });
  });
  if ("mismatched" in result) {
    throw new EterisError("PROJECTION_MISMATCH");
  }
  if (!result.replayed) {
    await db.transaction(async (tx) => {
      await createUserNotification(tx, {
        description:
          "El propietario ajusto tu saldo Eteris. Consulta tu historial para ver el movimiento.",
        metadata: {
          category: "eteris_owner_adjustment",
          linkPath: "/profile?section=wallet",
        },
        sourceUserId: input.actorUserId,
        targetUserId: input.userId,
        title: "Tu saldo Eteris fue ajustado",
      });
      if ("debtCreated" in result && result.debtCreated) {
        await createUserNotification(tx, {
          description:
            "Tu Billetera Eteris tiene deuda. No podras gastar hasta saldarla.",
          metadata: {
            category: "eteris_debt",
            linkPath: "/profile?section=wallet",
          },
          targetUserId: input.userId,
          title: "Tu Billetera Eteris tiene deuda",
        });
      }
    });
  }
  return { id: result.id, replayed: result.replayed };
}

export async function reverseEterisTransaction(
  db: Database,
  input: {
    actorUserId: string;
    idempotencyKey: string;
    reason: string;
    transactionId: string;
  }
) {
  const original = await db.query.eterisTransaction.findFirst({
    where: eq(eterisTransaction.id, input.transactionId),
  });
  if (!original) {
    throw new EterisError("WALLET_NOT_FOUND");
  }
  const originalPostings = await loadExistingPostings(db, original.id);
  return postEterisTransaction(db, {
    actorUserId: input.actorUserId,
    debtPolicy: "trusted-recovery",
    idempotencyKey: input.idempotencyKey,
    kind: "reversal",
    metadata: { originalKind: original.kind },
    postings: originalPostings.map((posting) => ({
      amount: -posting.amount,
      walletId: posting.walletId,
    })),
    reason: input.reason,
    reversesTransactionId: original.id,
    sourceModule: "account",
    sourceRef: `reversal:${original.id}`,
  });
}

const HISTORY_LABELS: Record<EterisTransactionKind, string> = {
  account_closure: "Cierre de cuenta",
  admin_adjustment: "Correcci\u00F3n del propietario",
  auction: "Subasta",
  gacha: "Canje",
  level_reward: "Recompensa de nivel",
  purchase: "Compra",
  refund: "Reembolso",
  reversal: "Reversi\u00F3n",
  trade: "Intercambio",
  vip_stipend: "Beneficio VIP mensual",
};

export async function listEterisHistory(
  db: Database,
  input: {
    authorizedStaff?: boolean;
    cursor?: { sequence: bigint };
    limit: number;
    userId: string;
  }
) {
  if (!env.XP_ECONOMY_ENABLED && !input.authorizedStaff) {
    throw new EterisError("VISIBILITY_DISABLED");
  }
  const wallet = await db.transaction((tx) =>
    getOrCreateUserWalletInTransaction(tx, input.userId)
  );
  const cursorCondition = input.cursor
    ? lt(eterisTransaction.sequence, input.cursor.sequence)
    : undefined;
  const rows = await db
    .select({
      amount: eterisPosting.amount,
      balanceAfter: eterisPosting.balanceAfter,
      createdAt: eterisTransaction.createdAt,
      id: eterisTransaction.id,
      kind: eterisTransaction.kind,
      sequence: eterisTransaction.sequence,
    })
    .from(eterisPosting)
    .innerJoin(
      eterisTransaction,
      eq(eterisTransaction.id, eterisPosting.transactionId)
    )
    .where(and(eq(eterisPosting.walletId, wallet.id), cursorCondition))
    .orderBy(desc(eterisTransaction.sequence))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((row) => ({
    amount: row.amount.toString(),
    balanceAfter: row.balanceAfter.toString(),
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    label: HISTORY_LABELS[row.kind],
  }));
  const last = items.at(-1);
  const cursorRow = rows[input.limit - 1];
  return {
    items,
    nextCursor:
      hasMore && last && cursorRow
        ? { sequence: cursorRow.sequence.toString() }
        : null,
  };
}

export async function inspectWallet(db: Database, userId: string) {
  const wallet = await db.transaction((tx) =>
    getOrCreateUserWalletInTransaction(tx, userId)
  );
  return {
    balance: wallet.balance.toString(),
    debt: wallet.balance < ZERO,
    publicBalance: wallet.publicBalance,
    status: wallet.status,
    userId,
    walletId: wallet.id,
  };
}

export async function reconcileWallet(
  db: Database,
  userId: string,
  repair = false,
  actorUserId?: string
) {
  const wallet = await db.transaction((tx) =>
    getOrCreateUserWalletInTransaction(tx, userId)
  );
  return db.transaction(async (tx) => {
    const [projection] = await tx
      .select({ balance: eterisWalletBalance.balance })
      .from(eterisWalletBalance)
      .where(eq(eterisWalletBalance.walletId, wallet.id))
      .for("update");
    if (!projection) {
      throw new EterisError("WALLET_NOT_FOUND");
    }
    const [row] = await tx
      .select({
        balance: sql<string>`coalesce(sum(${eterisPosting.amount}), 0)::text`,
      })
      .from(eterisPosting)
      .where(eq(eterisPosting.walletId, wallet.id));
    const ledgerBalance = BigInt(row?.balance ?? "0");
    const matches = ledgerBalance === projection.balance;
    if (!matches) {
      await tx
        .update(eterisWallet)
        .set({ status: repair ? "active" : "frozen" })
        .where(eq(eterisWallet.id, wallet.id));
      if (repair) {
        await tx
          .update(eterisWalletBalance)
          .set({ balance: ledgerBalance, updatedAt: new Date() })
          .where(eq(eterisWalletBalance.walletId, wallet.id));
      }
      await tx.insert(eterisWalletReconciliation).values({
        actorUserId,
        ledgerBalance,
        projectionBalance: projection.balance,
        repaired: repair,
        walletId: wallet.id,
      });
    }
    return {
      ledgerBalance: ledgerBalance.toString(),
      matches,
      projectionBalance: projection.balance.toString(),
      repaired: repair && !matches,
      walletId: wallet.id,
    };
  });
}
