import { and, eq, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisTransaction,
  profileCatalogAudit,
  profileCatalogOwnership,
} from "@repo/db/schema/app";

import { reverseEterisTransaction } from "./eteris";

type Database = typeof database;

export type ProfileCatalogPurchaseCorrectionInput = {
  actorUserId: string;
  purchaseTransactionId: string;
  reason: string;
};

type ProfileCatalogPurchaseCorrectionErrorCode =
  | "NOT_PROFILE_CATALOG_PURCHASE"
  | "PROJECTION_MISMATCH"
  | "PURCHASE_NOT_FOUND"
  | "REASON_REQUIRED";

export class ProfileCatalogPurchaseCorrectionError extends Error {
  readonly code: ProfileCatalogPurchaseCorrectionErrorCode;

  constructor(
    code: ProfileCatalogPurchaseCorrectionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ProfileCatalogPurchaseCorrectionError";
    this.code = code;
  }
}

function parseProfileCatalogPurchase(transaction: {
  actorUserId: string | null;
  kind: string;
  metadata: Record<string, unknown>;
  sourceModule: string;
}) {
  const itemId = transaction.metadata.catalogItemId;
  if (
    transaction.kind !== "purchase" ||
    transaction.sourceModule !== "commerce" ||
    !transaction.actorUserId ||
    typeof itemId !== "string" ||
    !itemId
  ) {
    throw new ProfileCatalogPurchaseCorrectionError(
      "NOT_PROFILE_CATALOG_PURCHASE",
      "La transacci\u00F3n no es una compra del Cat\u00E1logo de Perfiles."
    );
  }
  return { itemId, userId: transaction.actorUserId };
}

/**
 * Reverses one exact catalog purchase and revokes only the ownership source
 * linked to that journal transaction. The ownership update serializes
 * concurrent corrections; any later ledger or audit failure rolls it back.
 */
export function correctProfileCatalogPurchase(
  db: Database,
  input: ProfileCatalogPurchaseCorrectionInput
) {
  const reason = input.reason.trim();
  if (!reason) {
    return Promise.reject(
      new ProfileCatalogPurchaseCorrectionError(
        "REASON_REQUIRED",
        "Debes indicar el motivo de la correcci\u00F3n."
      )
    );
  }

  return db.transaction(async (tx) => {
    const [original] = await tx
      .select({
        actorUserId: eterisTransaction.actorUserId,
        id: eterisTransaction.id,
        kind: eterisTransaction.kind,
        metadata: eterisTransaction.metadata,
        sourceModule: eterisTransaction.sourceModule,
      })
      .from(eterisTransaction)
      .where(eq(eterisTransaction.id, input.purchaseTransactionId))
      .for("update");
    if (!original) {
      throw new ProfileCatalogPurchaseCorrectionError(
        "PURCHASE_NOT_FOUND",
        "La compra original no existe."
      );
    }
    const purchase = parseProfileCatalogPurchase(original);
    const correctedAt = new Date();
    const [ownership] = await tx
      .update(profileCatalogOwnership)
      .set({
        revokedAt: correctedAt,
        revokedByUserId: input.actorUserId,
        revokeReason: reason,
      })
      .where(
        and(
          eq(profileCatalogOwnership.userId, purchase.userId),
          eq(profileCatalogOwnership.catalogItemId, purchase.itemId),
          eq(profileCatalogOwnership.sourceType, "purchase"),
          eq(profileCatalogOwnership.sourceReference, original.id),
          sql`${profileCatalogOwnership.revokedAt} IS NULL`
        )
      )
      .returning({
        catalogItemId: profileCatalogOwnership.catalogItemId,
        id: profileCatalogOwnership.id,
        userId: profileCatalogOwnership.userId,
      });

    if (!ownership) {
      const correctedOwnership =
        await tx.query.profileCatalogOwnership.findFirst({
          where: and(
            eq(profileCatalogOwnership.userId, purchase.userId),
            eq(profileCatalogOwnership.catalogItemId, purchase.itemId),
            eq(profileCatalogOwnership.sourceType, "purchase"),
            eq(profileCatalogOwnership.sourceReference, original.id),
            sql`${profileCatalogOwnership.revokedAt} IS NOT NULL`
          ),
        });
      const reversal = await tx.query.eterisTransaction.findFirst({
        columns: { id: true },
        where: eq(eterisTransaction.reversesTransactionId, original.id),
      });
      if (!(correctedOwnership && reversal)) {
        throw new ProfileCatalogPurchaseCorrectionError(
          "PURCHASE_NOT_FOUND",
          "La compra no tiene una propiedad activa asociada."
        );
      }
      const remainingOwnership =
        await tx.query.profileCatalogOwnership.findFirst({
          columns: { id: true },
          where: and(
            eq(profileCatalogOwnership.userId, correctedOwnership.userId),
            eq(
              profileCatalogOwnership.catalogItemId,
              correctedOwnership.catalogItemId
            ),
            sql`${profileCatalogOwnership.revokedAt} IS NULL`
          ),
        });
      return {
        effectivePermanentEntitlement: Boolean(remainingOwnership),
        itemId: correctedOwnership.catalogItemId,
        ownershipId: correctedOwnership.id,
        replayed: true,
        reversalTransactionId: reversal.id,
        userId: correctedOwnership.userId,
      };
    }

    const reversal = await reverseEterisTransaction(tx, {
      actorUserId: input.actorUserId,
      idempotencyKey: `profile-catalog-correction:${original.id}`,
      reason,
      transactionId: original.id,
    });
    if ("mismatched" in reversal) {
      throw new ProfileCatalogPurchaseCorrectionError(
        "PROJECTION_MISMATCH",
        "La billetera necesita revisi\u00F3n antes de corregir la compra."
      );
    }

    const remainingOwnership = await tx.query.profileCatalogOwnership.findFirst(
      {
        columns: { id: true },
        where: and(
          eq(profileCatalogOwnership.userId, ownership.userId),
          eq(profileCatalogOwnership.catalogItemId, ownership.catalogItemId),
          sql`${profileCatalogOwnership.revokedAt} IS NULL`
        ),
      }
    );
    const before = {
      effectivePermanentEntitlement: true,
      itemId: ownership.catalogItemId,
      originalTransactionId: original.id,
      ownershipId: ownership.id,
      userId: ownership.userId,
    };
    const after = {
      ...before,
      correctedAt: correctedAt.toISOString(),
      effectivePermanentEntitlement: Boolean(remainingOwnership),
      reason,
      reversalTransactionId: reversal.id,
    };
    await tx.insert(profileCatalogAudit).values({
      action: "correct-purchase",
      actorUserId: input.actorUserId,
      after,
      before,
      note: reason,
      targetId: ownership.id,
      targetKind: "profile-catalog-ownership",
    });

    return {
      effectivePermanentEntitlement: Boolean(remainingOwnership),
      itemId: ownership.catalogItemId,
      ownershipId: ownership.id,
      replayed: reversal.replayed,
      reversalTransactionId: reversal.id,
      userId: ownership.userId,
    };
  });
}
