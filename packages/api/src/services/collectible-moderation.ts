/* oxlint-disable eslint/require-await -- Moderation command boundaries preserve rejected-promise semantics for policy failures. */
import { and, asc, eq, isNull } from "@repo/db";
import type { db as database } from "@repo/db";
import type { collectibleAdminAction } from "@repo/db/schema/app";
import {
  cardInstance,
  cardTemplate,
  cardTemplateAuditEvent,
  collectibleCustody,
  giftOffer,
  gachaponMachine,
  officialCardShopOffer,
  packInstance,
  packRevision,
  tradeOffer,
} from "@repo/db/schema/app";
import { recordCollectibleMetric } from "@repo/shared/collectibles";
import type { CollectibleMetricSink } from "@repo/shared/collectibles";

import { administrativelyCancelBlackMarketListingInTransaction } from "./black-market";
import {
  appendCollectibleAdminAction,
  collectibleAdminActionFingerprint,
  getCollectibleAdminActionByIdempotencyKey,
} from "./collectible-admin-action";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import { closeSentGiftOfferInTransaction } from "./gift-offer";
import { closeSentTradeOfferInTransaction } from "./trade-offer";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CustodyDisposition = "retain" | "release";

type CommonModerationInput = {
  actorUserId: string;
  custody?: CustodyDisposition;
  expectedVersion: number;
  impersonated?: boolean;
  idempotencyKey: string;
  metrics?: CollectibleMetricSink;
  reason: string;
};

export type CollectibleModerationResult = {
  actionId: string;
  availability: "active" | "disabled" | "frozen";
  custodyReleased: number;
  custodyRetained: number;
  replayed: boolean;
  targetId: string;
  targetKind: "card-instance" | "pack-instance" | "pack-revision";
  version: number;
};

export type CollectibleModerationErrorCode =
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "REASON_REQUIRED"
  | "IDEMPOTENCY_CONFLICT";

export class CollectibleModerationError extends Error {
  readonly code: CollectibleModerationErrorCode;

  constructor(code: CollectibleModerationErrorCode, message: string) {
    super(message);
    this.name = "CollectibleModerationError";
    this.code = code;
  }
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new CollectibleModerationError(
      "REASON_REQUIRED",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

function requireExpectedVersion(version: number) {
  if (!Number.isInteger(version) || version < 1) {
    throw new CollectibleModerationError(
      "STALE_VERSION",
      "Confirma la versión actual antes de continuar."
    );
  }
}

async function activeCustodyForAsset(
  tx: Transaction,
  kind: "card" | "pack",
  assetId: string
) {
  return tx
    .select()
    .from(collectibleCustody)
    .where(
      and(
        kind === "card"
          ? eq(collectibleCustody.cardInstanceId, assetId)
          : eq(collectibleCustody.packInstanceId, assetId),
        isNull(collectibleCustody.releasedAt)
      )
    )
    .orderBy(asc(collectibleCustody.createdAt), asc(collectibleCustody.id))
    .for("update");
}

async function releaseCustody(
  tx: Transaction,
  rows: readonly (typeof collectibleCustody.$inferSelect)[],
  reason: string,
  now: Date
) {
  for (const row of rows) {
    await tx
      .update(collectibleCustody)
      .set({ releasedAt: now, releaseReason: reason, updatedAt: now })
      .where(
        and(
          eq(collectibleCustody.id, row.id),
          isNull(collectibleCustody.releasedAt)
        )
      );
  }
}

async function releaseCustodyParents(
  tx: Transaction,
  rows: readonly (typeof collectibleCustody.$inferSelect)[],
  input: {
    actorUserId: string;
    idempotencyKey: string;
    metrics?: CollectibleMetricSink;
    reason: string;
  },
  now: Date
) {
  for (const row of rows) {
    if (row.tradeOfferId) {
      const [offer] = await tx
        .select()
        .from(tradeOffer)
        .where(eq(tradeOffer.id, row.tradeOfferId))
        .for("update");
      if (offer?.state === "sent") {
        const result = await closeSentTradeOfferInTransaction(
          tx,
          offer,
          input.actorUserId,
          "administratively-cancelled",
          input.reason,
          `${input.idempotencyKey}:custody:trade-offer:${offer.id}`,
          now,
          input.metrics
        );
        await appendCollectibleAdminAction(tx, {
          action: "cancel",
          actorUserId: input.actorUserId,
          after: { state: result.state, version: result.version },
          before: { state: offer.state, version: offer.version },
          idempotencyKey: `${input.idempotencyKey}:audit:trade-offer:${offer.id}`,
          metrics: input.metrics,
          reason: input.reason,
          targetId: offer.id,
          targetKind: "trade-offer",
          version: result.version,
        });
      }
      continue;
    }
    if (row.giftOfferId) {
      const [offer] = await tx
        .select()
        .from(giftOffer)
        .where(eq(giftOffer.id, row.giftOfferId))
        .for("update");
      if (offer?.state === "sent") {
        const result = await closeSentGiftOfferInTransaction(
          tx,
          offer,
          input.actorUserId,
          "administratively-cancelled",
          input.reason,
          `${input.idempotencyKey}:custody:gift-offer:${offer.id}`,
          now,
          input.metrics
        );
        await appendCollectibleAdminAction(tx, {
          action: "cancel",
          actorUserId: input.actorUserId,
          after: { state: result.state, version: result.version },
          before: { state: offer.state, version: offer.version },
          idempotencyKey: `${input.idempotencyKey}:audit:gift-offer:${offer.id}`,
          metrics: input.metrics,
          reason: input.reason,
          targetId: offer.id,
          targetKind: "gift-offer",
          version: result.version,
        });
      }
      continue;
    }
    if (row.blackMarketListingId) {
      const result =
        await administrativelyCancelBlackMarketListingInTransaction(
          tx,
          input.actorUserId,
          row.blackMarketListingId,
          input.reason,
          `${input.idempotencyKey}:custody:market-listing:${row.blackMarketListingId}`,
          now,
          input.metrics
        );
      if (!result.replayed) {
        await appendCollectibleAdminAction(tx, {
          action: "cancel",
          actorUserId: input.actorUserId,
          after: { state: result.state, version: result.version },
          before: { state: "active" },
          idempotencyKey: `${input.idempotencyKey}:audit:market-listing:${row.blackMarketListingId}`,
          metrics: input.metrics,
          reason: input.reason,
          targetId: row.blackMarketListingId,
          targetKind: "market-listing",
          version: result.version,
        });
      }
    }
  }
}

function replayResult(
  row: typeof collectibleAdminAction.$inferSelect,
  targetKind: CollectibleModerationResult["targetKind"]
): CollectibleModerationResult {
  const after = row.after as Record<string, unknown>;
  return {
    actionId: row.id,
    availability:
      (after.availability as CollectibleModerationResult["availability"]) ??
      "frozen",
    custodyReleased: Number(after.custodyReleased ?? 0),
    custodyRetained: Number(after.custodyRetained ?? 0),
    replayed: true,
    targetId: row.targetId,
    targetKind,
    version: row.version,
  };
}

async function findReplay(
  tx: Pick<Transaction, "select">,
  input: {
    action: "freeze" | "restore";
    actorUserId: string;
    after?: Record<string, unknown>;
    before?: Record<string, unknown>;
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
    targetId: string;
    targetKind: CollectibleModerationResult["targetKind"];
    version: number;
  }
) {
  const existing = await findExistingAction(tx, input);
  if (!existing) {
    return null;
  }
  return replayResult(existing, input.targetKind);
}

async function findExistingAction(
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
    throw new CollectibleModerationError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de moderación ya fue usada con otros términos."
    );
  }
  return existing;
}

async function moderateAsset(
  db: Database,
  kind: "card" | "pack",
  input: CommonModerationInput & { assetId: string },
  action: "freeze" | "restore"
): Promise<CollectibleModerationResult> {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  requireExpectedVersion(input.expectedVersion);
  const targetKind = kind === "card" ? "card-instance" : "pack-instance";
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const replay = await findReplay(tx, {
          action,
          actorUserId: input.actorUserId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          reason,
          targetId: input.assetId,
          targetKind,
          version: input.expectedVersion + 1,
        });
        if (replay) {
          return replay;
        }
        const [current] = await tx
          .select()
          .from(kind === "card" ? cardInstance : packInstance)
          .where(
            eq(
              kind === "card" ? cardInstance.id : packInstance.id,
              input.assetId
            )
          )
          .for("update");
        if (!current) {
          throw new CollectibleModerationError(
            "NOT_FOUND",
            "El coleccionable no existe."
          );
        }
        if (current.version !== input.expectedVersion) {
          throw new CollectibleModerationError(
            "STALE_VERSION",
            "El coleccionable cambió. Recarga antes de continuar."
          );
        }
        const beforeAvailability = current.availability;
        if (action === "freeze" && beforeAvailability === "frozen") {
          throw new CollectibleModerationError(
            "INVALID_TRANSITION",
            "El coleccionable ya está congelado."
          );
        }
        if (action === "restore" && beforeAvailability !== "frozen") {
          throw new CollectibleModerationError(
            "INVALID_TRANSITION",
            "Solo se puede restaurar un coleccionable congelado."
          );
        }
        const now = new Date();
        const custody = await activeCustodyForAsset(tx, kind, input.assetId);
        const disposition = input.custody ?? "retain";
        if (disposition === "release" && custody.length > 0) {
          await releaseCustodyParents(
            tx,
            custody,
            {
              actorUserId: input.actorUserId,
              idempotencyKey: input.idempotencyKey,
              metrics: input.metrics,
              reason,
            },
            now
          );
          await releaseCustody(tx, custody, reason, now);
        }
        const nextVersion = current.version + 1;
        const nextAvailability = action === "freeze" ? "frozen" : "active";
        const [updated] = await tx
          .update(kind === "card" ? cardInstance : packInstance)
          .set({
            availability: nextAvailability,
            updatedAt: now,
            version: nextVersion,
          })
          .where(
            and(
              eq(
                kind === "card" ? cardInstance.id : packInstance.id,
                input.assetId
              ),
              eq(
                kind === "card" ? cardInstance.version : packInstance.version,
                input.expectedVersion
              )
            )
          )
          .returning();
        if (!updated) {
          throw new CollectibleModerationError(
            "STALE_VERSION",
            "El coleccionable cambió durante la moderación."
          );
        }
        const audit = await appendCollectibleAdminAction(tx, {
          action,
          actorUserId: input.actorUserId,
          after: {
            availability: nextAvailability,
            custodyReleased: disposition === "release" ? custody.length : 0,
            custodyRetained: disposition === "retain" ? custody.length : 0,
          },
          before: {
            availability: beforeAvailability,
            custodyActive: custody.length,
          },
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          metrics: input.metrics,
          reason,
          targetId: input.assetId,
          targetKind,
          version: nextVersion,
        });
        recordCollectibleMetric(input.metrics, {
          name: action === "freeze" ? "freeze" : "restore",
          operation: `collectibles.${action}`,
        });
        return {
          actionId: audit.actionId,
          availability: nextAvailability,
          custodyReleased: disposition === "release" ? custody.length : 0,
          custodyRetained: disposition === "retain" ? custody.length : 0,
          replayed: audit.replayed,
          targetId: input.assetId,
          targetKind,
          version: nextVersion,
        };
      }),
    { metrics: input.metrics, operation: `collectibles.${action}` }
  );
}

export function freezeCardInstance(
  db: Database,
  input: CommonModerationInput & { assetId: string }
) {
  return moderateAsset(db, "card", input, "freeze");
}

export function restoreCardInstance(
  db: Database,
  input: CommonModerationInput & { assetId: string }
) {
  return moderateAsset(db, "card", input, "restore");
}

export function freezePackInstance(
  db: Database,
  input: CommonModerationInput & { assetId: string }
) {
  return moderateAsset(db, "pack", input, "freeze");
}

export function restorePackInstance(
  db: Database,
  input: CommonModerationInput & { assetId: string }
) {
  return moderateAsset(db, "pack", input, "restore");
}

export type PackRevisionModerationInput = Omit<
  CommonModerationInput,
  "custody"
> & {
  revisionId: string;
};

export async function changePackRevisionAvailability(
  db: Database,
  input: PackRevisionModerationInput,
  action: "disable" | "restore"
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  requireExpectedVersion(input.expectedVersion);
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const targetKind = "pack-revision" as const;
        const replayVersion = input.expectedVersion + 1;
        const replay = await findExistingAction(tx, {
          action: action === "disable" ? "disable" : "restore",
          actorUserId: input.actorUserId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          reason,
          targetId: input.revisionId,
          targetKind,
          version: replayVersion,
        });
        if (replay) {
          return {
            actionId: replay.id,
            availability:
              (replay.after as { availability?: "active" | "disabled" })
                .availability ?? (action === "disable" ? "disabled" : "active"),
            replayed: true,
            revisionId: input.revisionId,
            targetKind,
            version: replay.version,
          };
        }
        const [current] = await tx
          .select()
          .from(packRevision)
          .where(eq(packRevision.id, input.revisionId))
          .for("update");
        if (!current) {
          throw new CollectibleModerationError(
            "NOT_FOUND",
            "La revisión no existe."
          );
        }
        const nextAvailability = action === "disable" ? "disabled" : "active";
        if (current.version !== input.expectedVersion) {
          throw new CollectibleModerationError(
            "STALE_VERSION",
            "La revisión cambió. Recarga antes de continuar."
          );
        }
        if (action === "disable" && current.availability !== "active") {
          throw new CollectibleModerationError(
            "INVALID_TRANSITION",
            "La revisión no está activa."
          );
        }
        if (action === "restore" && current.availability !== "disabled") {
          throw new CollectibleModerationError(
            "INVALID_TRANSITION",
            "Solo se puede restaurar una revisión deshabilitada."
          );
        }
        const nextVersion = current.version + 1;
        const [updated] = await tx
          .update(packRevision)
          .set({
            availability: nextAvailability,
            updatedAt: new Date(),
            updatedByUserId: input.actorUserId,
            version: nextVersion,
          })
          .where(
            and(
              eq(packRevision.id, current.id),
              eq(packRevision.version, input.expectedVersion)
            )
          )
          .returning();
        if (!updated) {
          throw new CollectibleModerationError(
            "STALE_VERSION",
            "La revisión cambió durante la moderación."
          );
        }
        const audit = await appendCollectibleAdminAction(tx, {
          action: action === "disable" ? "disable" : "restore",
          actorUserId: input.actorUserId,
          after: { availability: nextAvailability },
          before: { availability: current.availability },
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          metrics: input.metrics,
          reason,
          targetId: current.id,
          targetKind,
          version: nextVersion,
        });
        recordCollectibleMetric(input.metrics, {
          name: action === "disable" ? "revision_disabled" : "restore",
          operation: `collectibles.revision.${action}`,
          revisionId: current.id,
        });
        return {
          actionId: audit.actionId,
          availability: nextAvailability,
          replayed: audit.replayed,
          revisionId: current.id,
          targetKind,
          version: nextVersion,
        };
      }),
    { metrics: input.metrics, operation: `collectibles.revision.${action}` }
  );
}

export const disablePackRevision = (
  db: Database,
  input: PackRevisionModerationInput
) => changePackRevisionAvailability(db, input, "disable");
export const restorePackRevision = (
  db: Database,
  input: PackRevisionModerationInput
) => changePackRevisionAvailability(db, input, "restore");

export type CardTemplateModerationInput = Omit<
  CommonModerationInput,
  "custody"
> & {
  templateId: string;
};

/** Presentation disable/restore keeps every Card Instance and Mint Number. */
export async function changeCardTemplateAvailability(
  db: Database,
  input: CardTemplateModerationInput,
  action: "disable" | "restore"
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  requireExpectedVersion(input.expectedVersion);
  return db.transaction(async (tx) => {
    const replayVersion = input.expectedVersion + 1;
    const replay = await findExistingAction(tx, {
      action,
      actorUserId: input.actorUserId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      reason,
      targetId: input.templateId,
      targetKind: "card-template",
      version: replayVersion,
    });
    if (replay) {
      const after = replay.after as { availability?: "active" | "disabled" };
      return {
        actionId: replay.id,
        availability:
          after.availability ?? (action === "disable" ? "disabled" : "active"),
        replayed: true,
        targetId: input.templateId,
        targetKind: "card-template" as const,
        version: replay.version,
      };
    }
    const [current] = await tx
      .select()
      .from(cardTemplate)
      .where(eq(cardTemplate.id, input.templateId))
      .for("update");
    if (!current) {
      throw new CollectibleModerationError(
        "NOT_FOUND",
        "La plantilla no existe."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La plantilla cambió. Recarga antes de continuar."
      );
    }
    if (action === "disable" && current.availability !== "active") {
      throw new CollectibleModerationError(
        "INVALID_TRANSITION",
        "La plantilla ya está deshabilitada."
      );
    }
    if (action === "restore" && current.availability !== "disabled") {
      throw new CollectibleModerationError(
        "INVALID_TRANSITION",
        "La plantilla no está deshabilitada."
      );
    }
    const now = new Date();
    const nextVersion = current.version + 1;
    const nextAvailability = action === "disable" ? "disabled" : "active";
    const [updated] = await tx
      .update(cardTemplate)
      .set({
        availability: nextAvailability,
        disabledAt: action === "disable" ? now : null,
        disabledByUserId: action === "disable" ? input.actorUserId : null,
        updatedAt: now,
        updatedByUserId: input.actorUserId,
        version: nextVersion,
      })
      .where(
        and(
          eq(cardTemplate.id, current.id),
          eq(cardTemplate.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La plantilla cambió durante la moderación."
      );
    }
    await tx.insert(cardTemplateAuditEvent).values({
      action,
      actorUserId: input.actorUserId,
      after: { availability: nextAvailability, version: nextVersion },
      before: { availability: current.availability, version: current.version },
      reason,
      templateId: current.id,
    });
    const audit = await appendCollectibleAdminAction(tx, {
      action,
      actorUserId: input.actorUserId,
      after: { availability: nextAvailability },
      before: { availability: current.availability },
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      metrics: input.metrics,
      reason,
      targetId: current.id,
      targetKind: "card-template",
      version: nextVersion,
    });
    recordCollectibleMetric(input.metrics, {
      name: action === "disable" ? "freeze" : "restore",
      operation: `collectibles.card-template.${action}`,
      templateId: current.id,
    });
    return {
      actionId: audit.actionId,
      availability: nextAvailability,
      replayed: audit.replayed,
      targetId: current.id,
      targetKind: "card-template" as const,
      version: nextVersion,
    };
  });
}

export const disableCardTemplate = (
  db: Database,
  input: CardTemplateModerationInput
) => changeCardTemplateAvailability(db, input, "disable");
export const restoreCardTemplate = (
  db: Database,
  input: CardTemplateModerationInput
) => changeCardTemplateAvailability(db, input, "restore");

export type ShopOfferModerationInput = Omit<
  CommonModerationInput,
  "custody"
> & {
  offerId: string;
};

export async function changeShopOfferAvailability(
  db: Database,
  input: ShopOfferModerationInput,
  action: "disable" | "restore"
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  requireExpectedVersion(input.expectedVersion);
  return db.transaction(async (tx) => {
    const actionKind = action === "disable" ? "disable" : "restore";
    const replayVersion = input.expectedVersion + 1;
    const replay = await findExistingAction(tx, {
      action: actionKind,
      actorUserId: input.actorUserId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      reason,
      targetId: input.offerId,
      targetKind: "shop-offer",
      version: replayVersion,
    });
    if (replay) {
      const after = replay.after as { enabled?: boolean };
      return {
        actionId: replay.id,
        enabled: after.enabled ?? action === "restore",
        replayed: true,
        targetId: input.offerId,
        targetKind: "shop-offer" as const,
        version: replay.version,
      };
    }
    const [current] = await tx
      .select()
      .from(officialCardShopOffer)
      .where(eq(officialCardShopOffer.id, input.offerId))
      .for("update");
    if (!current) {
      throw new CollectibleModerationError("NOT_FOUND", "La oferta no existe.");
    }
    if (current.version !== input.expectedVersion) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de continuar."
      );
    }
    const nextEnabled = action === "restore";
    if (current.enabled === nextEnabled) {
      throw new CollectibleModerationError(
        "INVALID_TRANSITION",
        "La oferta ya tiene ese estado."
      );
    }
    const nextVersion = current.version + 1;
    const [updated] = await tx
      .update(officialCardShopOffer)
      .set({
        enabled: nextEnabled,
        updatedAt: new Date(),
        updatedByUserId: input.actorUserId,
        version: nextVersion,
      })
      .where(
        and(
          eq(officialCardShopOffer.id, current.id),
          eq(officialCardShopOffer.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La oferta cambió durante la moderación."
      );
    }
    const audit = await appendCollectibleAdminAction(tx, {
      action: actionKind,
      actorUserId: input.actorUserId,
      after: { enabled: nextEnabled },
      before: { enabled: current.enabled },
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      metrics: input.metrics,
      reason,
      targetId: current.id,
      targetKind: "shop-offer",
      version: nextVersion,
    });
    return {
      actionId: audit.actionId,
      enabled: nextEnabled,
      replayed: audit.replayed,
      targetId: current.id,
      targetKind: "shop-offer" as const,
      version: nextVersion,
    };
  });
}

export type GachaponModerationInput = Omit<CommonModerationInput, "custody"> & {
  machineId: string;
};

export async function changeGachaponMachineAvailability(
  db: Database,
  input: GachaponModerationInput,
  action: "pause" | "restore"
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = requireReason(input.reason);
  requireExpectedVersion(input.expectedVersion);
  return db.transaction(async (tx) => {
    const actionKind = action === "pause" ? "freeze" : "restore";
    const replayVersion = input.expectedVersion + 1;
    const replay = await findExistingAction(tx, {
      action: actionKind,
      actorUserId: input.actorUserId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      reason,
      targetId: input.machineId,
      targetKind: "gachapon-machine",
      version: replayVersion,
    });
    if (replay) {
      const after = replay.after as { state?: "active" | "paused" };
      return {
        actionId: replay.id,
        replayed: true,
        state: after.state ?? (action === "pause" ? "paused" : "active"),
        targetId: input.machineId,
        targetKind: "gachapon-machine" as const,
        version: replay.version,
      };
    }
    const [current] = await tx
      .select()
      .from(gachaponMachine)
      .where(eq(gachaponMachine.id, input.machineId))
      .for("update");
    if (!current) {
      throw new CollectibleModerationError(
        "NOT_FOUND",
        "La máquina no existe."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La máquina cambió. Recarga antes de continuar."
      );
    }
    const nextState = action === "pause" ? "paused" : "active";
    if (current.state === nextState) {
      throw new CollectibleModerationError(
        "INVALID_TRANSITION",
        "La máquina ya tiene ese estado."
      );
    }
    if (action === "restore" && current.state !== "paused") {
      throw new CollectibleModerationError(
        "INVALID_TRANSITION",
        "Solo se puede restaurar una máquina pausada."
      );
    }
    const nextVersion = current.version + 1;
    const [updated] = await tx
      .update(gachaponMachine)
      .set({
        state: nextState,
        updatedAt: new Date(),
        updatedByUserId: input.actorUserId,
        version: nextVersion,
      })
      .where(
        and(
          eq(gachaponMachine.id, current.id),
          eq(gachaponMachine.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new CollectibleModerationError(
        "STALE_VERSION",
        "La máquina cambió durante la moderación."
      );
    }
    const audit = await appendCollectibleAdminAction(tx, {
      action: actionKind,
      actorUserId: input.actorUserId,
      after: { state: nextState },
      before: { state: current.state },
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      metrics: input.metrics,
      reason,
      targetId: current.id,
      targetKind: "gachapon-machine",
      version: nextVersion,
    });
    return {
      actionId: audit.actionId,
      replayed: audit.replayed,
      state: nextState,
      targetId: current.id,
      targetKind: "gachapon-machine" as const,
      version: nextVersion,
    };
  });
}
