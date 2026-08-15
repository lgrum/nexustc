import { and, eq, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  eterisTransaction,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileCatalogOwnership,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";

import {
  getOrCreateUserWalletInTransaction,
  postEterisTransactionInTransaction,
} from "./eteris";

type Database = typeof database;

export type ProfileCatalogPurchaseInput = {
  expectedPrice: bigint;
  expectedRevision: number;
  idempotencyKey: string;
  itemId: string;
  userId: string;
};

type ProfileCatalogPurchaseErrorCode =
  | "ALREADY_OWNED"
  | "CUSTOMIZATION_DISABLED"
  | "IDEMPOTENCY_CONFLICT"
  | "ITEM_UNAVAILABLE"
  | "NOT_PURCHASABLE"
  | "PRICE_CHANGED"
  | "PROJECTION_MISMATCH"
  | "REVISION_CHANGED"
  | "SPENDING_DISABLED"
  | "WALLET_BLOCKED"
  | "WALLET_DEBT";

export class ProfileCatalogPurchaseError extends Error {
  readonly code: ProfileCatalogPurchaseErrorCode;

  constructor(code: ProfileCatalogPurchaseErrorCode, message: string) {
    super(message);
    this.name = "ProfileCatalogPurchaseError";
    this.code = code;
  }
}

const purchaseMetadata = (input: ProfileCatalogPurchaseInput) => ({
  catalogItemId: input.itemId,
  price: input.expectedPrice.toString(),
  publishedRevision: input.expectedRevision,
});

function isMatchingReplay(
  replay: {
    actorUserId: string | null;
    kind: string;
    metadata: Record<string, unknown>;
    sourceModule: string;
  },
  input: ProfileCatalogPurchaseInput
) {
  const metadata = purchaseMetadata(input);
  return (
    replay.actorUserId === input.userId &&
    replay.kind === "purchase" &&
    replay.sourceModule === "commerce" &&
    replay.metadata.catalogItemId === metadata.catalogItemId &&
    replay.metadata.price === metadata.price &&
    replay.metadata.publishedRevision === metadata.publishedRevision
  );
}

/**
 * Acquires one published Profile Catalog item without changing the account's
 * Selected Profile Configuration. The catalog row is locked before the ledger
 * locks its sorted wallet set, keeping concurrent purchase settlement ordered.
 */
export async function purchaseProfileCatalogItem(
  db: Database,
  input: ProfileCatalogPurchaseInput
) {
  const result = await db.transaction(async (tx) => {
    const resolveReplay = async (
      replay: NonNullable<
        Awaited<ReturnType<typeof tx.query.eterisTransaction.findFirst>>
      >
    ) => {
      if (!isMatchingReplay(replay, input)) {
        throw new ProfileCatalogPurchaseError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de compra ya fue usada para otra operación."
        );
      }
      const ownership = await tx.query.profileCatalogOwnership.findFirst({
        where: and(
          eq(profileCatalogOwnership.userId, input.userId),
          eq(profileCatalogOwnership.catalogItemId, input.itemId),
          eq(profileCatalogOwnership.sourceType, "purchase"),
          eq(profileCatalogOwnership.sourceReference, replay.id),
          sql`${profileCatalogOwnership.revokedAt} IS NULL`
        ),
      });
      if (!ownership) {
        throw new ProfileCatalogPurchaseError(
          "IDEMPOTENCY_CONFLICT",
          "La compra anterior no tiene una propiedad activa asociada."
        );
      }
      return {
        itemId: input.itemId,
        ownershipId: ownership.id,
        price: input.expectedPrice.toString(),
        replayed: true,
        revision: input.expectedRevision,
        transactionId: replay.id,
      };
    };

    const replay = await tx.query.eterisTransaction.findFirst({
      where: eq(eterisTransaction.idempotencyKey, input.idempotencyKey),
    });
    if (replay) {
      return resolveReplay(replay);
    }

    if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
      throw new ProfileCatalogPurchaseError(
        "CUSTOMIZATION_DISABLED",
        "La personalización de perfiles no está disponible."
      );
    }
    if (!(env.XP_ECONOMY_ENABLED && env.ETERIS_SPENDING_ENABLED)) {
      throw new ProfileCatalogPurchaseError(
        "SPENDING_DISABLED",
        "Las compras con Eteris no están disponibles."
      );
    }

    const [item] = await tx
      .select({
        currentPublishedRevisionId:
          profileCatalogItem.currentPublishedRevisionId,
        eterisPrice: profileCatalogItemRevision.eterisPrice,
        id: profileCatalogItem.id,
        isFree: profileCatalogItemRevision.isFree,
        kind: profileCatalogItem.kind,
        lifecycle: profileCatalogItem.lifecycle,
        revision: profileCatalogItemRevision.revision,
        stableKey: profileCatalogItem.stableKey,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      )
      .where(eq(profileCatalogItem.id, input.itemId))
      .for("update");

    if (!item) {
      throw new ProfileCatalogPurchaseError(
        "ITEM_UNAVAILABLE",
        "Este elemento ya no está disponible."
      );
    }

    // A concurrent request can commit the ledger transaction while this
    // request waits for the catalog row lock. Recheck the idempotency key
    // after that lock before treating the new ownership as a conflict.
    const committedReplay = await tx.query.eterisTransaction.findFirst({
      where: eq(eterisTransaction.idempotencyKey, input.idempotencyKey),
    });
    if (committedReplay) {
      return resolveReplay(committedReplay);
    }

    if (item.lifecycle !== "active") {
      throw new ProfileCatalogPurchaseError(
        "ITEM_UNAVAILABLE",
        "Este elemento ya no está disponible."
      );
    }

    if (!item.currentPublishedRevisionId) {
      throw new ProfileCatalogPurchaseError(
        "ITEM_UNAVAILABLE",
        "Este elemento no tiene una revisión publicada."
      );
    }
    if (item.revision !== input.expectedRevision) {
      throw new ProfileCatalogPurchaseError(
        "REVISION_CHANGED",
        "El elemento cambió. Revisa la versión actual antes de comprar."
      );
    }
    if (item.isFree) {
      throw new ProfileCatalogPurchaseError(
        "NOT_PURCHASABLE",
        "Este elemento gratuito no se puede conservar con Eteris."
      );
    }
    if (item.eterisPrice === null || item.eterisPrice <= 0n) {
      throw new ProfileCatalogPurchaseError(
        "NOT_PURCHASABLE",
        "Este elemento no se puede conservar con Eteris."
      );
    }
    if (item.eterisPrice !== input.expectedPrice) {
      throw new ProfileCatalogPurchaseError(
        "PRICE_CHANGED",
        "El precio cambió. Confirma el precio actual antes de comprar."
      );
    }

    const existingOwnership = await tx.query.profileCatalogOwnership.findFirst({
      columns: { id: true },
      where: and(
        eq(profileCatalogOwnership.userId, input.userId),
        eq(profileCatalogOwnership.catalogItemId, input.itemId),
        sql`${profileCatalogOwnership.revokedAt} IS NULL`
      ),
    });
    if (existingOwnership) {
      throw new ProfileCatalogPurchaseError(
        "ALREADY_OWNED",
        "Ya conservas este elemento permanentemente."
      );
    }

    const wallet = await getOrCreateUserWalletInTransaction(tx, input.userId);
    if (wallet.status !== "active") {
      throw new ProfileCatalogPurchaseError(
        "WALLET_BLOCKED",
        "Tu billetera no permite compras."
      );
    }
    if (wallet.balance < 0n) {
      throw new ProfileCatalogPurchaseError(
        "WALLET_DEBT",
        "No puedes comprar mientras tu billetera tenga deuda."
      );
    }

    const settlement = await postEterisTransactionInTransaction(tx, {
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      kind: "purchase",
      metadata: purchaseMetadata(input),
      postings: [
        { amount: -item.eterisPrice, walletId: wallet.id },
        { amount: item.eterisPrice, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      sourceRef: `profile-catalog:${item.id}`,
      spending: true,
    });
    if ("mismatched" in settlement) {
      return { mismatched: settlement.mismatched } as const;
    }

    const ownershipId = generateId();
    await tx.insert(profileCatalogOwnership).values({
      catalogItemId: item.id,
      id: ownershipId,
      sourceReference: settlement.id,
      sourceType: "purchase",
      userId: input.userId,
    });

    return {
      itemId: item.id,
      ownershipId,
      price: item.eterisPrice.toString(),
      replayed: settlement.replayed,
      revision: item.revision,
      transactionId: settlement.id,
    };
  });

  if ("mismatched" in result) {
    throw new ProfileCatalogPurchaseError(
      "PROJECTION_MISMATCH",
      "La billetera necesita revisión antes de comprar."
    );
  }
  return result;
}
