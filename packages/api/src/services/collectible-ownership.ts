import { collectibleOwnershipEvent } from "@repo/db";

import type { CollectibleTransaction } from "./collectible-issuance";

type OwnershipTransaction = Pick<CollectibleTransaction, "insert">;

export type CollectibleOwnershipEventInput = {
  actorUserId?: string | null;
  cardInstanceId?: string;
  fromUserId?: string | null;
  kind:
    | "correction"
    | "gift"
    | "grant"
    | "issuance"
    | "opening"
    | "sale"
    | "trade"
    | "transfer";
  metadata?: Record<string, unknown>;
  packInstanceId?: string;
  sourceReference: string;
  sourceType: string;
  toUserId?: string | null;
};

/**
 * One private ownership-event boundary for every collectible owner change.
 * The authoritative card/pack update must happen in the same transaction.
 */
export function appendCollectibleOwnershipEvent(
  tx: OwnershipTransaction,
  input: CollectibleOwnershipEventInput
) {
  if ((input.cardInstanceId ? 1 : 0) + (input.packInstanceId ? 1 : 0) !== 1) {
    throw new Error(
      "Un evento de propiedad debe identificar exactamente una carta o un Pack."
    );
  }
  return tx.insert(collectibleOwnershipEvent).values({
    actorUserId: input.actorUserId,
    cardInstanceId: input.cardInstanceId,
    fromUserId: input.fromUserId,
    kind: input.kind,
    metadata: input.metadata,
    packInstanceId: input.packInstanceId,
    sourceReference: input.sourceReference,
    sourceType: input.sourceType,
    toUserId: input.toUserId,
  });
}

export const recordCollectibleOwnershipEvent = appendCollectibleOwnershipEvent;
