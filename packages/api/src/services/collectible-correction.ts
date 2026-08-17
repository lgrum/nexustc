/* oxlint-disable eslint/require-await -- Command boundaries intentionally turn validation throws into rejected promises. */
import {
  and,
  collectibleCustody,
  cardInstance,
  cardTemplate,
  eq,
  eterisTransaction,
  isNull,
  packInstance,
} from "@repo/db";
import type { db as database } from "@repo/db";
import type {
  CollectibleBinding,
  CollectibleMetricSink,
} from "@repo/shared/collectibles";
import { recordCollectibleMetric } from "@repo/shared/collectibles";

import {
  appendCollectibleAdminAction,
  collectibleAdminActionFingerprint,
  getCollectibleAdminActionByIdempotencyKey,
} from "./collectible-admin-action";
import { issueCardInTransaction } from "./collectible-issuance";
import type { CollectibleTransaction } from "./collectible-issuance";
import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import { reverseEterisTransactionInTransaction } from "./eteris";

type Database = typeof database;
type Transaction = CollectibleTransaction;

export type CollectibleCorrectionErrorCode =
  | "ACTIVE_CUSTODY"
  | "ALREADY_REVERSED"
  | "INVALID_FAILURE"
  | "INVALID_TERMS"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "OWNERSHIP_CHANGED"
  | "STALE_VERSION";

export class CollectibleCorrectionError extends Error {
  readonly code: CollectibleCorrectionErrorCode;

  constructor(code: CollectibleCorrectionErrorCode, message: string) {
    super(message);
    this.name = "CollectibleCorrectionError";
    this.code = code;
  }
}

type BaseCorrectionInput = {
  actorUserId: string;
  idempotencyKey: string;
  impersonated?: boolean;
  metrics?: CollectibleMetricSink;
  reason: string;
};

function normalizedReason(reason: string) {
  const value = reason.trim();
  if (value.length < 3) {
    throw new CollectibleCorrectionError(
      "INVALID_TERMS",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return value;
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new CollectibleCorrectionError(
      "STALE_VERSION",
      "Confirma la versión actual antes de corregir el coleccionable."
    );
  }
}

async function findReplay(
  tx: Pick<Transaction, "select">,
  input: Parameters<typeof collectibleAdminActionFingerprint>[0]
) {
  const existing = await getCollectibleAdminActionByIdempotencyKey(
    tx,
    input.idempotencyKey
  );
  if (
    existing &&
    existing.fingerprint !== collectibleAdminActionFingerprint(input)
  ) {
    throw new CollectibleCorrectionError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de corrección ya fue usada con otros términos."
    );
  }
  return existing;
}

export type ExceptionalCardGrantInput = BaseCorrectionInput & {
  binding: CollectibleBinding;
  expectedVersion: number;
  targetUserId: string;
  templateId: string;
};

export async function grantExceptionalCard(
  db: Database,
  input: ExceptionalCardGrantInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = normalizedReason(input.reason);
  assertVersion(input.expectedVersion);
  if (!input.targetUserId.trim()) {
    throw new CollectibleCorrectionError(
      "INVALID_TERMS",
      "Falta la cuenta destinataria."
    );
  }
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const replayVersion = input.expectedVersion + 1;
        const replay = await findReplay(tx, {
          action: "exceptional-grant",
          actorUserId: input.actorUserId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          reason,
          targetId: input.templateId,
          targetKind: "card-template",
          version: replayVersion,
        });
        if (replay) {
          const after = replay.after as {
            binding?: CollectibleBinding;
            cardInstanceId?: string;
            templateId?: string;
          };
          return {
            actionId: replay.id,
            binding: after.binding ?? input.binding,
            cardInstanceId: after.cardInstanceId ?? null,
            replayed: true,
            templateId: after.templateId ?? input.templateId,
            version: replay.version,
          };
        }
        const [template] = await tx
          .select()
          .from(cardTemplate)
          .where(eq(cardTemplate.id, input.templateId))
          .for("update");
        if (!template) {
          throw new CollectibleCorrectionError(
            "NOT_FOUND",
            "La plantilla de carta no existe."
          );
        }
        if (template.version !== input.expectedVersion) {
          throw new CollectibleCorrectionError(
            "STALE_VERSION",
            "La plantilla cambió. Recarga antes de continuar."
          );
        }
        const issued = await issueCardInTransaction(tx, {
          actorUserId: input.actorUserId,
          binding: input.binding,
          issueReference: `exceptional-correction:${input.idempotencyKey}`,
          issueSource: "exceptional-correction",
          ownerUserId: input.targetUserId,
          templateId: input.templateId,
        });
        const [afterTemplate] = await tx
          .select({
            mintedSupply: cardTemplate.mintedSupply,
            version: cardTemplate.version,
          })
          .from(cardTemplate)
          .where(eq(cardTemplate.id, input.templateId));
        if (!afterTemplate) {
          throw new CollectibleCorrectionError(
            "NOT_FOUND",
            "La plantilla de carta no existe."
          );
        }
        const audit = await appendCollectibleAdminAction(tx, {
          action: "exceptional-grant",
          actorUserId: input.actorUserId,
          after: {
            binding: input.binding,
            cardInstanceId: issued.cardInstanceId,
            mintedSupply: afterTemplate.mintedSupply,
            templateId: input.templateId,
          },
          before: {
            mintedSupply: template.mintedSupply,
            version: template.version,
          },
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          metrics: input.metrics,
          reason,
          targetId: input.templateId,
          targetKind: "card-template",
          version: afterTemplate.version,
        });
        recordCollectibleMetric(input.metrics, {
          name: "exceptional_grant",
          operation: "collectibles.correction.grant",
          templateId: input.templateId,
        });
        return {
          actionId: audit.actionId,
          binding: issued.binding,
          cardInstanceId: issued.cardInstanceId,
          mintNumber: issued.mintNumber,
          replayed: audit.replayed,
          templateId: issued.templateId,
          version: afterTemplate.version,
        };
      }),
    { metrics: input.metrics, operation: "collectibles.correction.grant" }
  );
}

export type ExceptionalTransferInput = BaseCorrectionInput & {
  assetId: string;
  expectedVersion: number;
  fromUserId: string;
  kind: "card" | "pack";
  toUserId: string;
};

export async function transferExceptionalCollectible(
  db: Database,
  input: ExceptionalTransferInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = normalizedReason(input.reason);
  assertVersion(input.expectedVersion);
  if (
    !input.fromUserId ||
    !input.toUserId ||
    input.fromUserId === input.toUserId
  ) {
    throw new CollectibleCorrectionError(
      "INVALID_TERMS",
      "La transferencia debe identificar dos cuentas distintas."
    );
  }
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const targetKind =
          input.kind === "card" ? "card-instance" : "pack-instance";
        const replay = await findReplay(tx, {
          action: "exceptional-transfer",
          actorUserId: input.actorUserId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          reason,
          targetId: input.assetId,
          targetKind,
          version: input.expectedVersion + 1,
        });
        if (replay) {
          const after = replay.after as { ownerUserId?: string };
          return {
            actionId: replay.id,
            assetId: input.assetId,
            kind: input.kind,
            ownerUserId: after.ownerUserId ?? input.toUserId,
            replayed: true,
            version: replay.version,
          };
        }
        const now = new Date();
        let current:
          | { ownerUserId: string | null; version: number }
          | undefined;
        if (input.kind === "card") {
          const [row] = await tx
            .select({
              ownerUserId: cardInstance.ownerUserId,
              version: cardInstance.version,
            })
            .from(cardInstance)
            .where(eq(cardInstance.id, input.assetId))
            .for("update");
          current = row;
        } else {
          const [row] = await tx
            .select({
              ownerUserId: packInstance.ownerUserId,
              version: packInstance.version,
            })
            .from(packInstance)
            .where(eq(packInstance.id, input.assetId))
            .for("update");
          current = row;
        }
        if (!current) {
          throw new CollectibleCorrectionError(
            "NOT_FOUND",
            "El coleccionable no existe."
          );
        }
        if (current.ownerUserId !== input.fromUserId) {
          throw new CollectibleCorrectionError(
            "OWNERSHIP_CHANGED",
            "La propiedad cambió. Recarga antes de continuar."
          );
        }
        if (current.version !== input.expectedVersion) {
          throw new CollectibleCorrectionError(
            "STALE_VERSION",
            "El coleccionable cambió. Recarga antes de continuar."
          );
        }
        const [activeCustody] = await tx
          .select({ id: collectibleCustody.id })
          .from(collectibleCustody)
          .where(
            and(
              input.kind === "card"
                ? eq(collectibleCustody.cardInstanceId, input.assetId)
                : eq(collectibleCustody.packInstanceId, input.assetId),
              isNull(collectibleCustody.releasedAt)
            )
          )
          .limit(1)
          .for("update");
        if (activeCustody) {
          throw new CollectibleCorrectionError(
            "ACTIVE_CUSTODY",
            "No se puede corregir un activo reservado por otra operación."
          );
        }
        const nextVersion = current.version + 1;
        const predicate = and(
          eq(
            input.kind === "card" ? cardInstance.id : packInstance.id,
            input.assetId
          ),
          eq(
            input.kind === "card"
              ? cardInstance.ownerUserId
              : packInstance.ownerUserId,
            input.fromUserId
          ),
          eq(
            input.kind === "card" ? cardInstance.version : packInstance.version,
            input.expectedVersion
          )
        );
        const [updated] = await tx
          .update(input.kind === "card" ? cardInstance : packInstance)
          .set({
            ownerUserId: input.toUserId,
            updatedAt: now,
            version: nextVersion,
          })
          .where(predicate)
          .returning({
            id: input.kind === "card" ? cardInstance.id : packInstance.id,
          });
        if (!updated) {
          throw new CollectibleCorrectionError(
            "OWNERSHIP_CHANGED",
            "La propiedad cambió durante la corrección."
          );
        }
        await appendCollectibleOwnershipEvent(tx, {
          actorUserId: input.actorUserId,
          fromUserId: input.fromUserId,
          kind: "correction",
          metadata: { reason },
          ...(input.kind === "card"
            ? { cardInstanceId: input.assetId }
            : { packInstanceId: input.assetId }),
          sourceReference: input.idempotencyKey,
          sourceType: "exceptional-correction",
          toUserId: input.toUserId,
        });
        const audit = await appendCollectibleAdminAction(tx, {
          action: "exceptional-transfer",
          actorUserId: input.actorUserId,
          after: { ownerUserId: input.toUserId },
          before: { ownerUserId: input.fromUserId },
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          metrics: input.metrics,
          reason,
          targetId: input.assetId,
          targetKind,
          version: nextVersion,
        });
        recordCollectibleMetric(input.metrics, {
          name: "exceptional_transfer",
          operation: `collectibles.correction.transfer.${input.kind}`,
        });
        return {
          actionId: audit.actionId,
          assetId: input.assetId,
          kind: input.kind,
          ownerUserId: input.toUserId,
          replayed: audit.replayed,
          version: nextVersion,
        };
      }),
    { metrics: input.metrics, operation: "collectibles.correction.transfer" }
  );
}

const ALLOWED_FAILURE_KINDS = new Set([
  "gacha",
  "market_listing_fee",
  "market_sale",
  "purchase",
]);

export type ExceptionalEterisReversalInput = BaseCorrectionInput & {
  expectedSequence: string;
  failureCode: "platform-timeout" | "settlement-failure" | "duplicate-attempt";
  transactionId: string;
  verifiedFailure: boolean;
};

export async function reverseExceptionalEteris(
  db: Database,
  input: ExceptionalEterisReversalInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = normalizedReason(input.reason);
  if (!input.verifiedFailure) {
    throw new CollectibleCorrectionError(
      "INVALID_FAILURE",
      "La reversión requiere una falla de plataforma verificada."
    );
  }
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const [original] = await tx
          .select()
          .from(eterisTransaction)
          .where(eq(eterisTransaction.id, input.transactionId))
          .for("update");
        if (!original) {
          throw new CollectibleCorrectionError(
            "NOT_FOUND",
            "El movimiento Eteris no existe."
          );
        }
        if (original.sequence.toString() !== input.expectedSequence) {
          throw new CollectibleCorrectionError(
            "STALE_VERSION",
            "El movimiento Eteris cambió. Recarga antes de continuar."
          );
        }
        if (!ALLOWED_FAILURE_KINDS.has(original.kind)) {
          throw new CollectibleCorrectionError(
            "INVALID_FAILURE",
            "Este tipo de movimiento no admite una reversión correctiva."
          );
        }
        if (original.sourceModule !== "commerce") {
          throw new CollectibleCorrectionError(
            "INVALID_FAILURE",
            "Solo los movimientos de comercio con falla de plataforma verificada pueden revertirse."
          );
        }
        const replay = await findReplay(tx, {
          action: "reverse-eteris",
          actorUserId: input.actorUserId,
          expectedVersion: 1,
          idempotencyKey: input.idempotencyKey,
          linkedEterisTransactionId: original.id,
          reason,
          targetId: original.id,
          targetKind: "eteris-transaction",
          version: 1,
        });
        if (replay) {
          const after = replay.after as { reversalTransactionId?: string };
          return {
            actionId: replay.id,
            originalTransactionId: original.id,
            replayed: true,
            reversalTransactionId: after.reversalTransactionId ?? null,
          };
        }
        const [existingReversal] = await tx
          .select({ id: eterisTransaction.id })
          .from(eterisTransaction)
          .where(eq(eterisTransaction.reversesTransactionId, original.id))
          .limit(1);
        if (existingReversal) {
          throw new CollectibleCorrectionError(
            "ALREADY_REVERSED",
            "El movimiento Eteris ya tiene una reversión."
          );
        }
        const reversal = await reverseEterisTransactionInTransaction(tx, {
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          reason,
          transactionId: original.id,
        });
        if ("mismatched" in reversal) {
          throw new CollectibleCorrectionError(
            "INVALID_FAILURE",
            "La reversión no pudo reconciliar el saldo Eteris."
          );
        }
        const audit = await appendCollectibleAdminAction(tx, {
          action: "reverse-eteris",
          actorUserId: input.actorUserId,
          after: { reversalTransactionId: reversal.id },
          before: { kind: original.kind, sequence: input.expectedSequence },
          expectedVersion: 1,
          idempotencyKey: input.idempotencyKey,
          linkedEterisTransactionId: original.id,
          metrics: input.metrics,
          reason,
          targetId: original.id,
          targetKind: "eteris-transaction",
          version: 1,
        });
        recordCollectibleMetric(input.metrics, {
          name: "fee_reversal",
          operation: `collectibles.correction.reverse-eteris.${input.failureCode}`,
        });
        return {
          actionId: audit.actionId,
          originalTransactionId: original.id,
          replayed: audit.replayed,
          reversalTransactionId: reversal.id,
        };
      }),
    {
      metrics: input.metrics,
      operation: "collectibles.correction.reverse-eteris",
    }
  );
}
