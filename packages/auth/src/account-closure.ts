import { and, asc, desc, eq, inArray, isNull, not, or } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisPosting,
  eterisTransaction,
  eterisWallet,
  eterisWalletBalance,
  userComicProgress,
  userProgression,
  xpEvent,
  xpIntegrityCase,
  xpLikeDisqualification,
  xpRewardBlock,
  xpRewardSubject,
  xpRiskSignal,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  ETERIS_MAX_AMOUNT,
  ETERIS_MIN_AMOUNT,
  ETERIS_SYSTEM_WALLETS,
} from "@repo/shared/eteris";

type Database = typeof database;

function assertSignedBigint(value: bigint) {
  if (value < ETERIS_MIN_AMOUNT || value > ETERIS_MAX_AMOUNT) {
    throw new Error("El cierre excede el rango Eteris permitido.");
  }
}

export function closeAccount(db: Database, userId: string) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .select({ userId: userProgression.userId })
      .from(userProgression)
      .where(eq(userProgression.userId, userId))
      .for("update");

    await tx
      .insert(eterisWallet)
      .values(
        ETERIS_SYSTEM_WALLETS.map((wallet) => ({
          ...wallet,
          updatedAt: now,
        }))
      )
      .onConflictDoNothing({ target: eterisWallet.id });
    await tx
      .insert(eterisWalletBalance)
      .values(
        ETERIS_SYSTEM_WALLETS.map(({ id }) => ({
          updatedAt: now,
          walletId: id,
        }))
      )
      .onConflictDoNothing({ target: eterisWalletBalance.walletId });
    await tx
      .insert(eterisWallet)
      .values({ id: generateId(), kind: "user", updatedAt: now, userId })
      .onConflictDoNothing({ target: eterisWallet.userId });

    const wallet = await tx.query.eterisWallet.findFirst({
      where: eq(eterisWallet.userId, userId),
    });
    if (!wallet) {
      throw new Error("No se pudo cerrar la Billetera Eteris.");
    }
    await tx
      .insert(eterisWalletBalance)
      .values({ updatedAt: now, walletId: wallet.id })
      .onConflictDoNothing({ target: eterisWalletBalance.walletId });

    const balanceSnapshot = await tx.query.eterisWalletBalance.findFirst({
      columns: { balance: true },
      where: eq(eterisWalletBalance.walletId, wallet.id),
    });
    if (!balanceSnapshot) {
      throw new Error("No se pudo leer el saldo de la Billetera Eteris.");
    }
    const requiredSystemWalletId =
      balanceSnapshot.balance > 0n
        ? "eteris-system-sink"
        : balanceSnapshot.balance < 0n
          ? "eteris-system-write-off"
          : null;
    const walletIds = [
      wallet.id,
      ...(requiredSystemWalletId ? [requiredSystemWalletId] : []),
    ].toSorted();
    const locked = await tx
      .select({
        balance: eterisWalletBalance.balance,
        status: eterisWallet.status,
        walletId: eterisWallet.id,
      })
      .from(eterisWalletBalance)
      .innerJoin(
        eterisWallet,
        eq(eterisWallet.id, eterisWalletBalance.walletId)
      )
      .where(inArray(eterisWalletBalance.walletId, walletIds))
      .orderBy(asc(eterisWalletBalance.walletId))
      .for("update");
    if (locked.length !== walletIds.length) {
      throw new Error("No se pudieron bloquear las Billeteras Eteris.");
    }

    const lockedById = new Map(
      locked.map((lockedWallet) => [lockedWallet.walletId, lockedWallet])
    );
    const userWallet = lockedById.get(wallet.id)!;
    if (userWallet.status === "closed") {
      await deletePrivateProgression(tx, userId);
      return { replayed: true, walletId: wallet.id };
    }

    for (const lockedWallet of locked) {
      const [latest] = await tx
        .select({ balanceAfter: eterisPosting.balanceAfter })
        .from(eterisPosting)
        .innerJoin(
          eterisTransaction,
          eq(eterisTransaction.id, eterisPosting.transactionId)
        )
        .where(eq(eterisPosting.walletId, lockedWallet.walletId))
        .orderBy(desc(eterisTransaction.sequence))
        .limit(1);
      if (
        (latest && latest.balanceAfter !== lockedWallet.balance) ||
        (!latest && lockedWallet.balance !== 0n)
      ) {
        throw new Error("La proyeccion Eteris no coincide con el libro mayor.");
      }
    }

    if (userWallet.balance !== 0n) {
      assertSignedBigint(-userWallet.balance);
      const systemWalletId =
        userWallet.balance > 0n
          ? "eteris-system-sink"
          : "eteris-system-write-off";
      const systemWallet = lockedById.get(systemWalletId);
      if (!systemWallet) {
        throw new Error(
          "El saldo de la Billetera Eteris cambio durante el cierre."
        );
      }
      const userBalanceAfter = 0n;
      const systemBalanceAfter = systemWallet.balance + userWallet.balance;
      assertSignedBigint(systemBalanceAfter);

      const transactionId = generateId();
      await tx.insert(eterisTransaction).values({
        createdAt: now,
        id: transactionId,
        idempotencyKey: `account-closure:${wallet.id}`,
        kind: "account_closure",
        metadata: {},
        sourceModule: "account",
        sourceRef: `wallet:${wallet.id}`,
      });
      await tx.insert(eterisPosting).values([
        {
          amount: -userWallet.balance,
          balanceAfter: userBalanceAfter,
          transactionId,
          walletId: wallet.id,
        },
        {
          amount: userWallet.balance,
          balanceAfter: systemBalanceAfter,
          transactionId,
          walletId: systemWalletId,
        },
      ]);
      await tx
        .update(eterisWalletBalance)
        .set({ balance: userBalanceAfter, updatedAt: now })
        .where(eq(eterisWalletBalance.walletId, wallet.id));
      await tx
        .update(eterisWalletBalance)
        .set({ balance: systemBalanceAfter, updatedAt: now })
        .where(eq(eterisWalletBalance.walletId, systemWalletId));
    }

    await tx
      .update(eterisWallet)
      .set({
        anonymizedAt: now,
        publicBalance: false,
        status: "closed",
        updatedAt: now,
      })
      .where(eq(eterisWallet.id, wallet.id));
    await deletePrivateProgression(tx, userId);
    return { replayed: false, walletId: wallet.id };
  });
}

async function deletePrivateProgression(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string
) {
  const ownedCaseIds = tx
    .select({ id: xpIntegrityCase.id })
    .from(xpIntegrityCase)
    .where(eq(xpIntegrityCase.userId, userId));
  const ownedSubjectIds = tx
    .select({ id: xpRewardSubject.id })
    .from(xpRewardSubject)
    .where(eq(xpRewardSubject.userId, userId));
  await tx
    .delete(xpLikeDisqualification)
    .where(
      or(
        eq(xpLikeDisqualification.likerUserId, userId),
        inArray(xpLikeDisqualification.integrityCaseId, ownedCaseIds),
        inArray(xpLikeDisqualification.subjectId, ownedSubjectIds)
      )
    );
  await tx
    .delete(xpEvent)
    .where(
      and(eq(xpEvent.userId, userId), not(isNull(xpEvent.reversesEventId)))
    );
  await tx.delete(xpEvent).where(eq(xpEvent.userId, userId));
  await tx.delete(xpRewardSubject).where(eq(xpRewardSubject.userId, userId));
  await tx.delete(xpRewardBlock).where(eq(xpRewardBlock.userId, userId));
  await tx.delete(xpRiskSignal).where(eq(xpRiskSignal.userId, userId));
  await tx.delete(xpIntegrityCase).where(eq(xpIntegrityCase.userId, userId));
  await tx.delete(userProgression).where(eq(userProgression.userId, userId));
  await tx
    .delete(userComicProgress)
    .where(eq(userComicProgress.userId, userId));
}
