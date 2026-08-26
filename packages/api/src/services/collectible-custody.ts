import {
  and,
  asc,
  cardInstance,
  collectibleCustody,
  eq,
  inArray,
  isNull,
  or,
  packInstance,
} from "@repo/db";
import { generateId } from "@repo/db/utils";
import type { CollectibleAssetReference } from "@repo/shared/collectibles";

import type { CollectibleTransaction } from "./collectible-issuance";
import { orderCollectibleLocks } from "./collectibles";

export type CollectibleCustodyAsset = CollectibleAssetReference;
export type CollectibleCustodySide = "proposer" | "recipient";

export type CollectibleCustodyErrorCode =
  | "ACTIVE_CUSTODY"
  | "DUPLICATE_ASSET"
  | "INVALID_ASSET";

export class CollectibleCustodyError extends Error {
  readonly code: CollectibleCustodyErrorCode;

  constructor(code: CollectibleCustodyErrorCode, message: string) {
    super(message);
    this.name = "CollectibleCustodyError";
    this.code = code;
  }
}

function uniqueAssets(assets: readonly CollectibleCustodyAsset[]) {
  const seen = new Set<string>();
  for (const asset of assets) {
    // Instance IDs are globally generated; do not permit an ID to be reserved
    // twice merely because a caller mislabeled its kind.
    const key = asset.assetId;
    if (seen.has(key)) {
      throw new CollectibleCustodyError(
        "DUPLICATE_ASSET",
        "Una operación no puede reservar dos veces el mismo coleccionable."
      );
    }
    seen.add(key);
  }
}

/**
 * Returns active custody without exposing the parent operation to callers.
 * Public collection/profile readers should never call this helper to shape a
 * response; it exists for mutation authorities and request-bound detail reads.
 */
export async function findActiveCollectibleCustody(
  tx: Pick<CollectibleTransaction, "select">,
  assets: readonly CollectibleCustodyAsset[]
) {
  uniqueAssets(assets);
  const cardIds = assets
    .filter(({ kind }) => kind === "card")
    .map(({ assetId }) => assetId);
  const packIds = assets
    .filter(({ kind }) => kind === "pack")
    .map(({ assetId }) => assetId);
  const rows = [] as {
    assetId: string;
    kind: "card" | "pack";
  }[];
  if (cardIds.length > 0) {
    const cardRows = await tx
      .select({ assetId: collectibleCustody.cardInstanceId })
      .from(collectibleCustody)
      .where(
        and(
          isNull(collectibleCustody.releasedAt),
          inArray(collectibleCustody.cardInstanceId, cardIds)
        )
      );
    rows.push(
      ...cardRows.flatMap(({ assetId }) =>
        assetId ? [{ assetId, kind: "card" as const }] : []
      )
    );
  }
  if (packIds.length > 0) {
    const packRows = await tx
      .select({ assetId: collectibleCustody.packInstanceId })
      .from(collectibleCustody)
      .where(
        and(
          isNull(collectibleCustody.releasedAt),
          inArray(collectibleCustody.packInstanceId, packIds)
        )
      );
    rows.push(
      ...packRows.flatMap(({ assetId }) =>
        assetId ? [{ assetId, kind: "pack" as const }] : []
      )
    );
  }
  return rows;
}

/** A reusable mutation authority used by opening, trade, gifts, and listings. */
export async function assertNoActiveCollectibleCustody(
  tx: Pick<CollectibleTransaction, "select">,
  assets: readonly CollectibleCustodyAsset[]
) {
  const active = await findActiveCollectibleCustody(tx, assets);
  if (active.length > 0) {
    throw new CollectibleCustodyError(
      "ACTIVE_CUSTODY",
      "El coleccionable ya está reservado por otra operación."
    );
  }
  return true;
}

/**
 * Locks Pack then Card instance rows in the one documented collectible lock
 * order (`orderCollectibleLocks`). Trade, gift, and market custody transfers
 * must share this single helper so competing operations cannot deadlock.
 */
export async function lockCollectibleAssets(
  tx: Pick<CollectibleTransaction, "select">,
  assets: readonly CollectibleAssetReference[]
) {
  const orderedLocks = orderCollectibleLocks({
    cardInstanceIds: assets
      .filter(({ kind }) => kind === "card")
      .map(({ assetId }) => assetId),
    packInstanceIds: assets
      .filter(({ kind }) => kind === "pack")
      .map(({ assetId }) => assetId),
  });
  const packIds = orderedLocks
    .filter(({ kind }) => kind === "pack-instance")
    .map(({ id }) => id);
  const cardIds = orderedLocks
    .filter(({ kind }) => kind === "card-instance")
    .map(({ id }) => id);
  if (packIds.length > 0) {
    await tx
      .select({ id: packInstance.id })
      .from(packInstance)
      .where(inArray(packInstance.id, packIds))
      .orderBy(asc(packInstance.id))
      .for("update");
  }
  if (cardIds.length > 0) {
    await tx
      .select({ id: cardInstance.id })
      .from(cardInstance)
      .where(inArray(cardInstance.id, cardIds))
      .orderBy(asc(cardInstance.id))
      .for("update");
  }
}

/** Locks existing reservation rows after the parent/asset lock order is held. */
export async function lockActiveCollectibleCustody(
  tx: Pick<CollectibleTransaction, "select">,
  assets: readonly CollectibleCustodyAsset[]
) {
  uniqueAssets(assets);
  const active = await findActiveCollectibleCustody(tx, assets);
  if (active.length === 0) {
    return [];
  }
  const cardIds = active
    .filter(({ kind }) => kind === "card")
    .map(({ assetId }) => assetId);
  const packIds = active
    .filter(({ kind }) => kind === "pack")
    .map(({ assetId }) => assetId);
  const predicates = [
    ...(cardIds.length > 0
      ? [inArray(collectibleCustody.cardInstanceId, cardIds)]
      : []),
    ...(packIds.length > 0
      ? [inArray(collectibleCustody.packInstanceId, packIds)]
      : []),
  ];
  return tx
    .select()
    .from(collectibleCustody)
    .where(
      and(
        isNull(collectibleCustody.releasedAt),
        predicates.length === 1 ? predicates[0] : or(...predicates)
      )
    )
    .orderBy(
      collectibleCustody.tradeOfferId,
      collectibleCustody.side,
      collectibleCustody.id
    )
    .for("update");
}

export async function createCollectibleCustody(
  tx: Pick<CollectibleTransaction, "insert" | "select">,
  input: {
    acquiredAt: Date;
    assets: readonly {
      asset: CollectibleCustodyAsset;
      side: CollectibleCustodySide;
    }[];
    blackMarketListingId?: string;
    tradeOfferId?: string;
    giftOfferId?: string;
  }
) {
  if (
    (input.tradeOfferId ? 1 : 0) +
      (input.giftOfferId ? 1 : 0) +
      (input.blackMarketListingId ? 1 : 0) !==
    1
  ) {
    throw new Error(
      "La custodia debe pertenecer exactamente a una operación collectible."
    );
  }
  const assets = input.assets.map(({ asset }) => asset);
  uniqueAssets(assets);
  await assertNoActiveCollectibleCustody(tx, assets);
  return tx
    .insert(collectibleCustody)
    .values(
      input.assets.map(({ asset, side }) => ({
        acquiredAt: input.acquiredAt,
        cardInstanceId: asset.kind === "card" ? asset.assetId : undefined,
        id: generateId(),
        packInstanceId: asset.kind === "pack" ? asset.assetId : undefined,
        side,
        blackMarketListingId: input.blackMarketListingId,
        tradeOfferId: input.tradeOfferId,
        giftOfferId: input.giftOfferId,
      }))
    )
    .returning();
}

/** Release is idempotent and deliberately only updates active rows. */
export function releaseCollectibleCustody(
  tx: Pick<CollectibleTransaction, "update">,
  offerId: string,
  reason: string,
  releasedAt = new Date(),
  kind: "gift" | "trade" | "black-market" = "trade"
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("La liberación de custodia requiere un motivo.");
  }
  return tx
    .update(collectibleCustody)
    .set({ releasedAt, releaseReason: normalizedReason, updatedAt: releasedAt })
    .where(
      and(
        eq(
          kind === "gift"
            ? collectibleCustody.giftOfferId
            : kind === "black-market"
              ? collectibleCustody.blackMarketListingId
              : collectibleCustody.tradeOfferId,
          offerId
        ),
        isNull(collectibleCustody.releasedAt)
      )
    )
    .returning({ id: collectibleCustody.id });
}

export function releaseGiftCollectibleCustody(
  tx: Pick<CollectibleTransaction, "update">,
  giftOfferId: string,
  reason: string,
  releasedAt = new Date()
) {
  return releaseCollectibleCustody(tx, giftOfferId, reason, releasedAt, "gift");
}

export function releaseBlackMarketCollectibleCustody(
  tx: Pick<CollectibleTransaction, "update">,
  listingId: string,
  reason: string,
  releasedAt = new Date()
) {
  return releaseCollectibleCustody(
    tx,
    listingId,
    reason,
    releasedAt,
    "black-market"
  );
}

export function listTradeOfferCustody(
  tx: Pick<CollectibleTransaction, "select">,
  tradeOfferId: string
) {
  return tx
    .select()
    .from(collectibleCustody)
    .where(eq(collectibleCustody.tradeOfferId, tradeOfferId))
    .orderBy(
      collectibleCustody.side,
      collectibleCustody.createdAt,
      collectibleCustody.id
    );
}

export function listGiftOfferCustody(
  tx: Pick<CollectibleTransaction, "select">,
  giftOfferId: string
) {
  return tx
    .select()
    .from(collectibleCustody)
    .where(eq(collectibleCustody.giftOfferId, giftOfferId))
    .orderBy(
      collectibleCustody.side,
      collectibleCustody.createdAt,
      collectibleCustody.id
    );
}

export function listBlackMarketListingCustody(
  tx: Pick<CollectibleTransaction, "select">,
  listingId: string
) {
  return tx
    .select()
    .from(collectibleCustody)
    .where(eq(collectibleCustody.blackMarketListingId, listingId))
    .orderBy(collectibleCustody.createdAt, collectibleCustody.id);
}

/**
 * Transfer exactly one authoritative owner row. Callers must hold the global
 * account/asset locks and revalidate binding/availability before invoking it.
 */
export async function transferCollectibleAssetOwner(
  tx: Pick<CollectibleTransaction, "update">,
  asset: CollectibleCustodyAsset,
  fromUserId: string,
  toUserId: string,
  updatedAt: Date
) {
  if (asset.kind === "card") {
    const rows = await tx
      .update(cardInstance)
      .set({ ownerUserId: toUserId, updatedAt })
      .where(
        and(
          eq(cardInstance.id, asset.assetId),
          eq(cardInstance.ownerUserId, fromUserId),
          isNull(cardInstance.packInstanceId)
        )
      )
      .returning({ id: cardInstance.id });
    if (rows.length !== 1) {
      throw new CollectibleCustodyError(
        "INVALID_ASSET",
        "La propiedad del coleccionable cambió antes de transferirlo."
      );
    }
    return rows[0]!.id;
  }
  const rows = await tx
    .update(packInstance)
    .set({ ownerUserId: toUserId, updatedAt })
    .where(
      and(
        eq(packInstance.id, asset.assetId),
        eq(packInstance.ownerUserId, fromUserId),
        eq(packInstance.state, "unopened")
      )
    )
    .returning({ id: packInstance.id });
  if (rows.length !== 1) {
    throw new CollectibleCustodyError(
      "INVALID_ASSET",
      "La propiedad del coleccionable cambió antes de transferirlo."
    );
  }
  return rows[0]!.id;
}
