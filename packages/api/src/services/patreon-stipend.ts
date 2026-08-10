import { and, eq, gte, lt } from "@repo/db";
import type { db as database } from "@repo/db";
import { eterisPosting, eterisTransaction, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  ETERIS_MONTHLY_PATREON_STIPENDS,
  ETERIS_PATREON_STIPEND_VERSION,
  ETERIS_SYSTEM_WALLETS,
} from "@repo/shared/eteris";

import {
  getOrCreateUserWalletInTransaction,
  lockEterisWalletsInTransaction,
  postEterisTransactionInTransaction,
} from "./eteris";
import { ensureProgressionActivationInTransaction } from "./progression-activation";

type Database = typeof database;
const ZERO = 0n;

function getUtcMonth(now: Date) {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  return {
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

export async function grantMonthlyPatreonStipend(
  db: Database,
  userId: string,
  now = new Date()
) {
  const month = getUtcMonth(now);
  if (!(env.XP_ACCRUAL_ENABLED && env.XP_ECONOMY_ENABLED)) {
    return { granted: "0", month: month.key };
  }

  const result = await db.transaction(async (tx) => {
    await ensureProgressionActivationInTransaction(tx, now);
    const [membership] = await tx
      .select({
        isActivePatron: patron.isActivePatron,
        tier: patron.tier,
      })
      .from(patron)
      .where(eq(patron.userId, userId))
      .for("update");
    if (!membership?.isActivePatron) {
      return { granted: "0", month: month.key };
    }

    const target = ETERIS_MONTHLY_PATREON_STIPENDS[membership.tier];
    if (target === ZERO) {
      return { granted: "0", month: month.key };
    }

    const wallet = await getOrCreateUserWalletInTransaction(tx, userId, now);
    const locked = await lockEterisWalletsInTransaction(tx, [
      wallet.id,
      ETERIS_SYSTEM_WALLETS[0].id,
    ]);
    if (locked.length !== 2) {
      throw new Error(
        "No se pudo bloquear la Billetera para el beneficio VIP."
      );
    }
    const userWallet = locked.find(({ walletId }) => walletId === wallet.id);
    if (userWallet?.status !== "active") {
      return { granted: "0", month: month.key };
    }

    const posted = await tx
      .select({ amount: eterisPosting.amount })
      .from(eterisPosting)
      .innerJoin(
        eterisTransaction,
        eq(eterisTransaction.id, eterisPosting.transactionId)
      )
      .where(
        and(
          eq(eterisPosting.walletId, wallet.id),
          eq(eterisTransaction.kind, "vip_stipend"),
          eq(eterisTransaction.sourceModule, "patreon"),
          gte(eterisTransaction.createdAt, month.start),
          lt(eterisTransaction.createdAt, month.end)
        )
      );
    const alreadyGranted = posted.reduce(
      (total, posting) => total + posting.amount,
      ZERO
    );
    const grant = target - alreadyGranted;
    if (grant <= ZERO) {
      return { granted: "0", month: month.key };
    }

    const sourceRef = `vip:${wallet.id}:${month.key}:target:${target}`;
    const posting = await postEterisTransactionInTransaction(tx, {
      createdAt: now,
      idempotencyKey: sourceRef,
      kind: "vip_stipend",
      metadata: {
        month: month.key,
        tier: membership.tier,
        version: ETERIS_PATREON_STIPEND_VERSION,
      },
      postings: [
        { amount: grant, walletId: wallet.id },
        { amount: -grant, walletId: ETERIS_SYSTEM_WALLETS[0].id },
      ],
      sourceModule: "patreon",
      sourceRef,
    });
    if ("mismatched" in posting) {
      return {
        granted: "0",
        month: month.key,
        projectionMismatch: true as const,
      };
    }

    return {
      granted: grant.toString(),
      month: month.key,
      publicProfileChanged: wallet.publicBalance,
    };
  });
  if ("projectionMismatch" in result) {
    throw new Error("ETERIS_PROJECTION_MISMATCH");
  }
  return result;
}

export async function grantMonthlyPatreonStipends(
  db: Database,
  now = new Date()
) {
  if (!(env.XP_ACCRUAL_ENABLED && env.XP_ECONOMY_ENABLED)) {
    return { checked: 0, granted: 0, profileUserIds: [] };
  }

  const memberships = await db.query.patron.findMany({
    columns: { userId: true },
    where: eq(patron.isActivePatron, true),
  });
  let granted = 0;
  const profileUserIds: string[] = [];
  const errors: unknown[] = [];
  for (const membership of memberships) {
    try {
      const result = await grantMonthlyPatreonStipend(
        db,
        membership.userId,
        now
      );
      if (BigInt(result.granted) > ZERO) {
        granted += 1;
        if ("publicProfileChanged" in result && result.publicProfileChanged) {
          profileUserIds.push(membership.userId);
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "No se pudieron liquidar todos los beneficios VIP."
    );
  }
  return { checked: memberships.length, granted, profileUserIds };
}
