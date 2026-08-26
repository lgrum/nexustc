import { and, asc, desc, eq, gt, inArray, lte, or, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  officialCardShopOffer,
  officialCardShopOfferAuditEvent,
  officialCardShopOfferUsage,
  officialCardShopPurchase,
  officialCardShopPurchaseItem,
  cardTemplate,
  packDrawGroup,
  packDrawGroupCardWeight,
  packRevision,
  packTemplate,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  normalizeCollectiblePayload,
  officialCardShopOfferDraftSchema,
  officialCardShopPurchaseInputSchema,
} from "@repo/shared/collectibles";
import type {
  CollectibleMetricSink,
  OfficialCardShopOfferDraft,
  OfficialCardShopPublicOffer,
  OfficialCardShopPurchaseInput,
} from "@repo/shared/collectibles";
import { ETERIS_MAX_AMOUNT, ETERIS_SYSTEM_WALLETS } from "@repo/shared/eteris";

import { isUserBanActive } from "../utils/user-ban";
import {
  CollectibleIssuanceError,
  issuePackInTransaction,
  runCollectibleIssuanceInTransaction,
} from "./collectible-issuance";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import {
  getOrCreateUserWalletInTransaction,
  lockEterisWalletsInTransaction,
  postEterisTransactionInTransaction,
} from "./eteris";
import { createUserNotification } from "./notification";
import { getPublishedPackTemplate } from "./pack-catalog";

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINK_WALLET_ID = ETERIS_SYSTEM_WALLETS.find(
  ({ kind }) => kind === "sink"
)!.id;

export type OfficialCardShopOfferCreateInput = Omit<
  OfficialCardShopOfferDraft,
  "price"
> & {
  actorUserId: string;
  enabled?: boolean;
  price: bigint | string;
  reason: string;
};

export type OfficialCardShopOfferUpdateInput = Omit<
  OfficialCardShopOfferDraft,
  "price"
> & {
  actorUserId: string;
  enabled?: boolean;
  expectedVersion: number;
  offerId: string;
  price: bigint | string;
  reason: string;
};

export type OfficialCardShopPurchaseCommand = OfficialCardShopPurchaseInput & {
  actorUserId?: string;
  impersonated?: boolean;
  metrics?: CollectibleMetricSink;
  now?: Date;
  random?: () => number;
  userId: string;
};

export type OfficialCardShopPurchaseResult = {
  offerId: string;
  packInstanceIds: string[];
  purchaseId: string;
  quantity: number;
  totalPrice: string;
  transactionId: string;
  unitPrice: string;
  revisionId: string;
  replayed: boolean;
};

export type OfficialCardShopErrorCode =
  | "ACCOUNT_INELIGIBLE"
  | "GATE_DISABLED"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "LIMIT_REACHED"
  | "OFFER_EXPIRED"
  | "OFFER_NOT_STARTED"
  | "OFFER_UNAVAILABLE"
  | "PROJECTION_MISMATCH"
  | "QUOTA_EXHAUSTED"
  | "SPENDING_DISABLED"
  | "STALE_PRICE"
  | "STALE_VERSION"
  | "WALLET_BLOCKED";

export class OfficialCardShopError extends Error {
  readonly code: OfficialCardShopErrorCode;

  constructor(code: OfficialCardShopErrorCode, message: string) {
    super(message);
    this.name = "OfficialCardShopError";
    this.code = code;
  }
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

function offerSnapshot(offer: typeof officialCardShopOffer.$inferSelect) {
  return {
    binding: offer.binding,
    enabled: offer.enabled,
    endsAt: offer.endsAt?.toISOString() ?? null,
    packTemplateId: offer.packTemplateId,
    perAccountLimit: offer.perAccountLimit,
    price: offer.price.toString(),
    remainingSales: offer.remainingSales,
    startsAt: offer.startsAt?.toISOString() ?? null,
    totalSold: offer.totalSold,
    version: offer.version,
  };
}

function normalizeOfferInput(
  input: OfficialCardShopOfferCreateInput | OfficialCardShopOfferUpdateInput
) {
  const parsed = officialCardShopOfferDraftSchema.parse({
    binding: input.binding,
    endsAt: input.endsAt,
    packTemplateId: input.packTemplateId,
    perAccountLimit: input.perAccountLimit,
    price:
      typeof input.price === "bigint" ? input.price.toString() : input.price,
    remainingSales: input.remainingSales,
    startsAt: input.startsAt,
  });
  return parsed;
}

function normalizePurchaseInput(input: OfficialCardShopPurchaseCommand) {
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 10
  ) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "Puedes comprar entre uno y diez Packs."
    );
  }
  if (
    !Number.isInteger(input.expectedOfferVersion) ||
    input.expectedOfferVersion < 1 ||
    typeof input.expectedUnitPrice !== "bigint" ||
    input.expectedUnitPrice <= 0n
  ) {
    throw new OfficialCardShopError(
      "STALE_PRICE",
      "Confirma el precio y la versión actuales antes de comprar."
    );
  }
  const parsed = officialCardShopPurchaseInputSchema.safeParse({
    expectedOfferVersion: input.expectedOfferVersion,
    expectedUnitPrice: input.expectedUnitPrice.toString(),
    idempotencyKey: input.idempotencyKey,
    offerId: input.offerId,
    quantity: input.quantity,
  });
  if (!parsed.success) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "Los datos de compra no son válidos."
    );
  }
  return parsed.data;
}

function purchaseFingerprint(input: {
  offerId: string;
  quantity: number;
  expectedOfferVersion: number;
  expectedUnitPrice: bigint;
  userId: string;
}) {
  return normalizeCollectiblePayload({
    expectedOfferVersion: input.expectedOfferVersion,
    expectedUnitPrice: input.expectedUnitPrice,
    offerId: input.offerId,
    quantity: input.quantity,
    userId: input.userId,
  });
}

function purchaseResult(
  purchase: typeof officialCardShopPurchase.$inferSelect,
  itemIds: string[],
  replayed: boolean
): OfficialCardShopPurchaseResult {
  return {
    offerId: purchase.offerId,
    packInstanceIds: itemIds,
    purchaseId: purchase.id,
    quantity: purchase.quantity,
    revisionId: purchase.revisionId,
    totalPrice: purchase.totalPrice.toString(),
    transactionId: purchase.eterisTransactionId,
    unitPrice: purchase.unitPrice.toString(),
    replayed,
  };
}

async function purchaseItems(
  tx: Pick<Transaction, "select">,
  purchaseId: string
) {
  const rows = await tx
    .select({
      ordinal: officialCardShopPurchaseItem.ordinal,
      packInstanceId: officialCardShopPurchaseItem.packInstanceId,
    })
    .from(officialCardShopPurchaseItem)
    .where(eq(officialCardShopPurchaseItem.purchaseId, purchaseId))
    .orderBy(asc(officialCardShopPurchaseItem.ordinal));
  return rows.map(({ packInstanceId }) => packInstanceId);
}

async function resolvePurchaseReplay(
  tx: Transaction,
  input: ReturnType<typeof normalizePurchaseInput>,
  userId: string,
  fingerprint: string,
  purchase: typeof officialCardShopPurchase.$inferSelect
) {
  if (
    purchase.buyerUserId !== userId ||
    purchase.fingerprint !== fingerprint ||
    purchase.offerId !== input.offerId ||
    purchase.quantity !== input.quantity ||
    purchase.offerVersion !== input.expectedOfferVersion ||
    purchase.unitPrice !== input.expectedUnitPrice
  ) {
    throw new OfficialCardShopError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de compra ya fue usada para otra operación."
    );
  }
  return purchaseResult(purchase, await purchaseItems(tx, purchase.id), true);
}

function assertOfferWindow(
  offer: typeof officialCardShopOffer.$inferSelect,
  now: Date
) {
  if (!offer.enabled) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "Esta oferta no está disponible."
    );
  }
  if (offer.startsAt && offer.startsAt > now) {
    throw new OfficialCardShopError(
      "OFFER_NOT_STARTED",
      "Esta oferta todavía no está disponible."
    );
  }
  if (offer.endsAt && offer.endsAt <= now) {
    throw new OfficialCardShopError("OFFER_EXPIRED", "La oferta ya terminó.");
  }
}

/**
 * Locks the latest Pack Revision and every Card Template that can satisfy it
 * before the offer row is locked. This is the concrete database side of the
 * shared collectible order: wallet, revision/supply, offer, then quota.
 * Published draw configuration is immutable, so the group/weight reads only
 * discover the stable supply IDs; the final Card Template read is the supply
 * lock that issuance reuses.
 */
async function lockOfficialCardShopSupply(
  tx: Transaction,
  packTemplateId: string
) {
  const [template] = await tx
    .select({
      id: packTemplate.id,
      latestPublishedRevisionId: packTemplate.latestPublishedRevisionId,
    })
    .from(packTemplate)
    .where(eq(packTemplate.id, packTemplateId))
    .for("update");
  if (!template?.latestPublishedRevisionId) {
    return;
  }

  const [revision] = await tx
    .select({ id: packRevision.id })
    .from(packRevision)
    .where(
      and(
        eq(packRevision.id, template.latestPublishedRevisionId),
        eq(packRevision.templateId, packTemplateId)
      )
    )
    .for("update");
  if (!revision) {
    return;
  }

  const groups = await tx
    .select({ id: packDrawGroup.id })
    .from(packDrawGroup)
    .where(eq(packDrawGroup.revisionId, revision.id))
    .orderBy(asc(packDrawGroup.order))
    .for("update");
  const groupIds = groups.map(({ id }) => id);
  if (groupIds.length === 0) {
    return;
  }

  const weights = await tx
    .select({ cardTemplateId: packDrawGroupCardWeight.cardTemplateId })
    .from(packDrawGroupCardWeight)
    .where(inArray(packDrawGroupCardWeight.drawGroupId, groupIds))
    .orderBy(asc(packDrawGroupCardWeight.cardTemplateId))
    .for("update");
  const cardTemplateIds = [
    ...new Set(weights.map(({ cardTemplateId }) => cardTemplateId)),
  ].toSorted();
  if (cardTemplateIds.length === 0) {
    return;
  }

  await tx
    .select({ id: cardTemplate.id })
    .from(cardTemplate)
    .where(inArray(cardTemplate.id, cardTemplateIds))
    .orderBy(asc(cardTemplate.id))
    .for("update");
}

function throwPurchaseError(error: unknown): never {
  if (error instanceof OfficialCardShopError) {
    throw error;
  }
  if (error instanceof CollectibleIssuanceError) {
    const code: OfficialCardShopErrorCode =
      error.code === "EXHAUSTED_SUPPLY"
        ? "QUOTA_EXHAUSTED"
        : error.code === "PROJECTION_MISMATCH"
          ? "PROJECTION_MISMATCH"
          : "OFFER_UNAVAILABLE";
    throw new OfficialCardShopError(code, error.message);
  }
  throw error;
}

export function createOfficialCardShopOffer(
  db: Database,
  input: OfficialCardShopOfferCreateInput
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  const parsed = normalizeOfferInput(input);
  return db.transaction(async (tx) => {
    const template = await tx.query.packTemplate.findFirst({
      columns: { id: true, lifecycle: true },
      where: eq(packTemplate.id, parsed.packTemplateId),
    });
    if (!template || template.lifecycle === "retired") {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "El Pack Template no está disponible."
      );
    }
    const now = new Date();
    const [created] = await tx
      .insert(officialCardShopOffer)
      .values({
        binding: parsed.binding,
        createdByUserId: input.actorUserId,
        enabled: input.enabled ?? false,
        endsAt: parsed.endsAt ?? null,
        packTemplateId: parsed.packTemplateId,
        perAccountLimit: parsed.perAccountLimit ?? null,
        price: parsed.price,
        remainingSales: parsed.remainingSales ?? null,
        startsAt: parsed.startsAt ?? null,
        updatedByUserId: input.actorUserId,
      })
      .returning();
    if (!created) {
      throw new Error("No se pudo crear la oferta.");
    }
    await tx.insert(officialCardShopOfferAuditEvent).values({
      action: "create",
      actorUserId: input.actorUserId,
      after: offerSnapshot(created),
      before: null,
      offerId: created.id,
      reason,
      version: created.version,
    });
    return { ...created, price: created.price.toString(), updatedAt: now };
  });
}

export function updateOfficialCardShopOffer(
  db: Database,
  input: OfficialCardShopOfferUpdateInput
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  const parsed = normalizeOfferInput(input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(officialCardShopOffer)
      .where(eq(officialCardShopOffer.id, input.offerId))
      .for("update");
    if (!current) {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "La oferta no existe."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de guardarla."
      );
    }
    if (
      parsed.remainingSales !== undefined &&
      parsed.remainingSales !== null &&
      parsed.remainingSales < 0
    ) {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "El stock restante no puede ser negativo."
      );
    }
    const nextEndsAt =
      parsed.endsAt === undefined ? current.endsAt : parsed.endsAt;
    const nextStartsAt =
      parsed.startsAt === undefined ? current.startsAt : parsed.startsAt;
    const auditAction =
      nextEndsAt?.getTime() !== current.endsAt?.getTime() ||
      nextStartsAt?.getTime() !== current.startsAt?.getTime()
        ? "schedule"
        : "update";
    const nextValues = {
      binding: parsed.binding,
      enabled: input.enabled ?? current.enabled,
      endsAt: nextEndsAt,
      packTemplateId: parsed.packTemplateId,
      perAccountLimit: parsed.perAccountLimit ?? null,
      price: parsed.price,
      remainingSales:
        parsed.remainingSales === undefined
          ? current.remainingSales
          : parsed.remainingSales,
      startsAt: nextStartsAt,
      updatedByUserId: input.actorUserId,
      version: current.version + 1,
    };
    const [updated] = await tx
      .update(officialCardShopOffer)
      .set(nextValues)
      .where(
        and(
          eq(officialCardShopOffer.id, current.id),
          eq(officialCardShopOffer.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de guardarla."
      );
    }
    await tx.insert(officialCardShopOfferAuditEvent).values({
      action: auditAction,
      actorUserId: input.actorUserId,
      after: offerSnapshot(updated),
      before: offerSnapshot(current),
      offerId: current.id,
      reason,
      version: updated.version,
    });
    return { ...updated, price: updated.price.toString() };
  });
}

function transitionOffer(
  db: Database,
  input: {
    action: "disable" | "enable";
    actorUserId: string;
    expectedVersion: number;
    offerId: string;
    reason: string;
  }
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(officialCardShopOffer)
      .where(eq(officialCardShopOffer.id, input.offerId))
      .for("update");
    if (!current) {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "La oferta no existe."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de continuar."
      );
    }
    const [updated] = await tx
      .update(officialCardShopOffer)
      .set({
        enabled: input.action === "enable",
        updatedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(officialCardShopOffer.id, current.id),
          eq(officialCardShopOffer.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de continuar."
      );
    }
    await tx.insert(officialCardShopOfferAuditEvent).values({
      action: input.action,
      actorUserId: input.actorUserId,
      after: offerSnapshot(updated),
      before: offerSnapshot(current),
      offerId: current.id,
      reason,
      version: updated.version,
    });
    return {
      enabled: updated.enabled,
      offerId: updated.id,
      version: updated.version,
    };
  });
}

export const enableOfficialCardShopOffer = (
  db: Database,
  input: Omit<Parameters<typeof transitionOffer>[1], "action">
) => transitionOffer(db, { ...input, action: "enable" });
export const disableOfficialCardShopOffer = (
  db: Database,
  input: Omit<Parameters<typeof transitionOffer>[1], "action">
) => transitionOffer(db, { ...input, action: "disable" });

function changeOfferQuota(
  db: Database,
  input: {
    action: "restock" | "reduce_quota";
    actorUserId: string;
    amount: number;
    expectedVersion: number;
    offerId: string;
    reason: string;
  }
) {
  assertCollectiblesMutationAllowed();
  const reason = requireReason(input.reason);
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "La cantidad debe ser un entero positivo."
    );
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(officialCardShopOffer)
      .where(eq(officialCardShopOffer.id, input.offerId))
      .for("update");
    if (!current) {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "La oferta no existe."
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de continuar."
      );
    }
    if (current.remainingSales === null) {
      throw new OfficialCardShopError(
        "OFFER_UNAVAILABLE",
        "Una oferta ilimitada no necesita reposición."
      );
    }
    if (
      input.action === "reduce_quota" &&
      input.amount > current.remainingSales
    ) {
      throw new OfficialCardShopError(
        "QUOTA_EXHAUSTED",
        "No puedes reducir el stock por debajo de cero."
      );
    }
    const remainingSales =
      input.action === "restock"
        ? current.remainingSales + input.amount
        : current.remainingSales - input.amount;
    const [updated] = await tx
      .update(officialCardShopOffer)
      .set({
        remainingSales,
        updatedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(officialCardShopOffer.id, current.id),
          eq(officialCardShopOffer.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new OfficialCardShopError(
        "STALE_VERSION",
        "La oferta cambió. Recarga antes de continuar."
      );
    }
    await tx.insert(officialCardShopOfferAuditEvent).values({
      action: input.action,
      actorUserId: input.actorUserId,
      after: offerSnapshot(updated),
      before: offerSnapshot(current),
      offerId: current.id,
      reason,
      version: updated.version,
    });
    return {
      offerId: updated.id,
      remainingSales: updated.remainingSales,
      version: updated.version,
    };
  });
}

type OfficialCardShopQuotaInput = Omit<
  Parameters<typeof changeOfferQuota>[1],
  "action"
>;

export const restockOfficialCardShopOffer = (
  db: Database,
  input: OfficialCardShopQuotaInput
) => changeOfferQuota(db, { ...input, action: "restock" });
export const reduceOfficialCardShopOfferQuota = (
  db: Database,
  input: OfficialCardShopQuotaInput
) => changeOfferQuota(db, { ...input, action: "reduce_quota" });

export async function listOfficialCardShopOffers(
  db: Pick<Database, "select">,
  now = new Date()
): Promise<OfficialCardShopPublicOffer[]> {
  const rows = await db
    .select()
    .from(officialCardShopOffer)
    .where(
      and(
        eq(officialCardShopOffer.enabled, true),
        or(
          sql`${officialCardShopOffer.startsAt} IS NULL`,
          lte(officialCardShopOffer.startsAt, now)
        ),
        or(
          sql`${officialCardShopOffer.endsAt} IS NULL`,
          gt(officialCardShopOffer.endsAt, now)
        ),
        or(
          sql`${officialCardShopOffer.remainingSales} IS NULL`,
          gt(officialCardShopOffer.remainingSales, 0)
        )
      )
    )
    .orderBy(asc(officialCardShopOffer.createdAt));
  const offers: OfficialCardShopPublicOffer[] = [];
  for (const offer of rows) {
    const pack = await getPublishedPackTemplate(db, offer.packTemplateId);
    if (!pack) {
      continue;
    }
    offers.push({
      binding: offer.binding,
      cardCount: pack.revision.cardCount,
      description: pack.description,
      endsAt: offer.endsAt?.toISOString() ?? null,
      guarantees: pack.revision.guarantees,
      id: offer.id,
      latestRevision: pack.revision,
      name: pack.name,
      perAccountLimit: offer.perAccountLimit,
      possiblePool: pack.revision.possiblePool,
      price: offer.price.toString(),
      remainingSales: offer.remainingSales,
      startsAt: offer.startsAt?.toISOString() ?? null,
      unavailableCards: pack.revision.unavailableCards,
      version: offer.version,
    });
  }
  return offers;
}

export const listActiveOfficialCardShopOffers = listOfficialCardShopOffers;
export const getOfficialCardShopOffers = listOfficialCardShopOffers;

export function listOfficialCardShopOffersForAdmin(
  db: Pick<Database, "select">,
  limit = 100
) {
  return db
    .select()
    .from(officialCardShopOffer)
    .orderBy(desc(officialCardShopOffer.updatedAt))
    .limit(Math.max(1, Math.min(100, limit)))
    .then((rows) =>
      rows.map((offer) => ({
        ...offer,
        endsAt: offer.endsAt?.toISOString() ?? null,
        price: offer.price.toString(),
        startsAt: offer.startsAt?.toISOString() ?? null,
      }))
    );
}

export async function getOfficialCardShopOfferImpact(
  db: Pick<Database, "select">,
  offerId: string
) {
  const [offer] = await db
    .select({
      id: officialCardShopOffer.id,
      packTemplateId: officialCardShopOffer.packTemplateId,
    })
    .from(officialCardShopOffer)
    .where(eq(officialCardShopOffer.id, offerId));
  if (!offer) {
    return null;
  }
  const pack = await getPublishedPackTemplate(db, offer.packTemplateId);
  return {
    latestRevision: pack?.revision.revision ?? null,
    offerId: offer.id,
    packTemplateId: offer.packTemplateId,
    warning:
      "Publicar una nueva Pack Revision cambiará la revisión usada por las futuras compras de esta oferta.",
  };
}

export async function purchaseOfficialCardShopOffer(
  db: Database,
  rawInput: OfficialCardShopPurchaseCommand
): Promise<OfficialCardShopPurchaseResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  if (!(env.XP_ECONOMY_ENABLED && env.ETERIS_SPENDING_ENABLED)) {
    throw new OfficialCardShopError(
      "SPENDING_DISABLED",
      "Las compras de Packs con Eteris no están disponibles."
    );
  }
  const input = normalizePurchaseInput(rawInput);
  const fingerprint = purchaseFingerprint({
    expectedOfferVersion: input.expectedOfferVersion,
    expectedUnitPrice: input.expectedUnitPrice,
    offerId: input.offerId,
    quantity: input.quantity,
    userId: rawInput.userId,
  });
  let result: OfficialCardShopPurchaseResult;
  try {
    result = await withCollectibleDeadlockRetry(
      () =>
        db.transaction(async (tx) => {
          const replay = await tx.query.officialCardShopPurchase.findFirst({
            where: eq(
              officialCardShopPurchase.idempotencyKey,
              input.idempotencyKey
            ),
          });
          if (replay) {
            return resolvePurchaseReplay(
              tx,
              input,
              rawInput.userId,
              fingerprint,
              replay
            );
          }

          const now = rawInput.now ?? new Date();
          const [account] = await tx
            .select({
              banExpires: user.banExpires,
              banned: user.banned,
              emailVerified: user.emailVerified,
              id: user.id,
            })
            .from(user)
            .where(eq(user.id, rawInput.userId))
            .for("update");
          if (
            !account ||
            !account.emailVerified ||
            account.banned ||
            isUserBanActive(account, now)
          ) {
            throw new OfficialCardShopError(
              "ACCOUNT_INELIGIBLE",
              "Tu cuenta no puede realizar compras de coleccionables."
            );
          }

          // Establish the wallet lock first. The ledger repeats this lock
          // defensively during settlement and remains the value authority.
          const wallet = await getOrCreateUserWalletInTransaction(
            tx,
            rawInput.userId,
            now
          );
          const lockedWallets = await lockEterisWalletsInTransaction(tx, [
            SINK_WALLET_ID,
            wallet.id,
          ]);
          const lockedWallet = lockedWallets.find(
            ({ walletId }) => walletId === wallet.id
          );
          if (!lockedWallet || lockedWallet.status !== "active") {
            throw new OfficialCardShopError(
              "WALLET_BLOCKED",
              "Tu billetera no permite compras."
            );
          }
          if (lockedWallet.balance < 0n) {
            throw new OfficialCardShopError(
              "WALLET_BLOCKED",
              "No puedes comprar mientras tu billetera tenga deuda."
            );
          }

          const candidateOffer = await tx.query.officialCardShopOffer.findFirst(
            {
              where: eq(officialCardShopOffer.id, input.offerId),
            }
          );
          if (!candidateOffer) {
            throw new OfficialCardShopError(
              "OFFER_UNAVAILABLE",
              "La oferta no existe."
            );
          }
          await lockOfficialCardShopSupply(tx, candidateOffer.packTemplateId);

          const [offer] = await tx
            .select()
            .from(officialCardShopOffer)
            .where(eq(officialCardShopOffer.id, input.offerId))
            .for("update");
          if (!offer) {
            throw new OfficialCardShopError(
              "OFFER_UNAVAILABLE",
              "La oferta no existe."
            );
          }
          const lockedReplay =
            await tx.query.officialCardShopPurchase.findFirst({
              where: eq(
                officialCardShopPurchase.idempotencyKey,
                input.idempotencyKey
              ),
            });
          if (lockedReplay) {
            return resolvePurchaseReplay(
              tx,
              input,
              rawInput.userId,
              fingerprint,
              lockedReplay
            );
          }
          assertOfferWindow(offer, now);
          if (offer.version !== input.expectedOfferVersion) {
            throw new OfficialCardShopError(
              "STALE_VERSION",
              "La oferta cambió. Confirma nuevamente antes de comprar."
            );
          }
          if (offer.price !== input.expectedUnitPrice) {
            throw new OfficialCardShopError(
              "STALE_PRICE",
              "El precio cambió. Confirma nuevamente antes de comprar."
            );
          }
          if (
            offer.remainingSales !== null &&
            offer.remainingSales < input.quantity
          ) {
            throw new OfficialCardShopError(
              "QUOTA_EXHAUSTED",
              "No hay suficientes Packs disponibles en esta oferta."
            );
          }

          const [usage] = await tx
            .select()
            .from(officialCardShopOfferUsage)
            .where(
              and(
                eq(officialCardShopOfferUsage.offerId, offer.id),
                eq(officialCardShopOfferUsage.userId, rawInput.userId)
              )
            )
            .for("update");
          const purchasedQuantity = usage?.purchasedQuantity ?? 0;
          if (
            offer.perAccountLimit !== null &&
            purchasedQuantity + input.quantity > offer.perAccountLimit
          ) {
            throw new OfficialCardShopError(
              "LIMIT_REACHED",
              "La compra supera el límite permitido para tu cuenta."
            );
          }

          if (offer.price > ETERIS_MAX_AMOUNT / BigInt(input.quantity)) {
            throw new OfficialCardShopError(
              "OFFER_UNAVAILABLE",
              "El total de la compra excede el límite permitido."
            );
          }

          const issued: Awaited<ReturnType<typeof issuePackInTransaction>>[] =
            [];
          try {
            // A savepoint keeps a mid-quantity exhaustion from leaving partial
            // issuance behind while the exhausted marker commits on this
            // channel, exactly like gachapon activation.
            await runCollectibleIssuanceInTransaction(tx, async (nestedTx) => {
              for (let ordinal = 1; ordinal <= input.quantity; ordinal += 1) {
                issued.push(
                  await issuePackInTransaction(nestedTx, {
                    actorUserId: rawInput.actorUserId ?? rawInput.userId,
                    binding: offer.binding,
                    issueReference: `${input.idempotencyKey}:${ordinal}`,
                    issueSource: "official_shop",
                    metrics: rawInput.metrics,
                    now,
                    ownerUserId: rawInput.userId,
                    packTemplateId: offer.packTemplateId,
                    random: rawInput.random,
                  })
                );
              }
            });
          } catch (error) {
            throwPurchaseError(error);
          }

          const totalPrice = offer.price * BigInt(input.quantity);
          const settlement = await postEterisTransactionInTransaction(tx, {
            actorUserId: rawInput.actorUserId ?? rawInput.userId,
            idempotencyKey: `card-shop:${input.idempotencyKey}`,
            kind: "purchase",
            metadata: {
              cardShopOfferId: offer.id,
              quantity: input.quantity,
              unitPrice: offer.price.toString(),
            },
            postings: [
              { amount: -totalPrice, walletId: wallet.id },
              { amount: totalPrice, walletId: SINK_WALLET_ID },
            ],
            sourceModule: "commerce",
            sourceRef: `card-shop:${offer.id}`,
            spending: true,
          });
          if ("mismatched" in settlement) {
            throw new OfficialCardShopError(
              "PROJECTION_MISMATCH",
              "La billetera necesita revisión antes de comprar."
            );
          }
          if (settlement.replayed) {
            throw new OfficialCardShopError(
              "IDEMPOTENCY_CONFLICT",
              "La clave de compra ya fue usada para otra operación."
            );
          }

          const purchaseId = generateId();
          await tx.insert(officialCardShopPurchase).values({
            binding: offer.binding,
            buyerUserId: rawInput.userId,
            buyerWalletId: null,
            eterisTransactionId: settlement.id,
            fingerprint,
            id: purchaseId,
            idempotencyKey: input.idempotencyKey,
            offerId: offer.id,
            offerVersion: offer.version,
            packTemplateId: offer.packTemplateId,
            quantity: input.quantity,
            revisionId: issued[0]!.revisionId,
            totalPrice,
            unitPrice: offer.price,
          });
          await tx.insert(officialCardShopPurchaseItem).values(
            issued.map((item, index) => ({
              ordinal: index + 1,
              packInstanceId: item.packInstanceId,
              purchaseId,
              revisionId: item.revisionId,
            }))
          );
          // Branches intentionally execute different database write shapes.
          // oxlint-disable-next-line unicorn/prefer-ternary
          if (usage) {
            await tx
              .update(officialCardShopOfferUsage)
              .set({
                purchasedQuantity: purchasedQuantity + input.quantity,
                updatedAt: now,
              })
              .where(
                and(
                  eq(officialCardShopOfferUsage.offerId, offer.id),
                  eq(officialCardShopOfferUsage.userId, rawInput.userId)
                )
              );
          } else {
            await tx.insert(officialCardShopOfferUsage).values({
              offerId: offer.id,
              purchasedQuantity: input.quantity,
              updatedAt: now,
              userId: rawInput.userId,
            });
          }
          // Customer purchases never bump `version`: that counter is the
          // operator-edit confirmation token (`expectedOfferVersion`), and
          // unrelated buyers must not invalidate each other's in-flight
          // confirmations when price/pool are unchanged. Counter updates are
          // serialized by the offer row lock taken above.
          await tx
            .update(officialCardShopOffer)
            .set({
              remainingSales:
                offer.remainingSales === null
                  ? null
                  : offer.remainingSales - input.quantity,
              totalSold: sql`${officialCardShopOffer.totalSold} + ${input.quantity}`,
              updatedAt: now,
            })
            .where(
              and(
                eq(officialCardShopOffer.id, offer.id),
                eq(officialCardShopOffer.version, offer.version)
              )
            );
          const purchase = {
            ...offer,
            binding: offer.binding,
            buyerUserId: rawInput.userId,
            buyerWalletId: null,
            eterisTransactionId: settlement.id,
            fingerprint,
            id: purchaseId,
            idempotencyKey: input.idempotencyKey,
            offerId: offer.id,
            offerVersion: offer.version,
            packTemplateId: offer.packTemplateId,
            quantity: input.quantity,
            revisionId: issued[0]!.revisionId,
            totalPrice,
            unitPrice: offer.price,
          } as typeof officialCardShopPurchase.$inferSelect;
          return purchaseResult(
            purchase,
            issued.map(({ packInstanceId }) => packInstanceId),
            false
          );
        }),
      { metrics: rawInput.metrics, operation: "card-shop.purchase" }
    );
  } catch (error) {
    throwPurchaseError(error);
  }
  if (!result.replayed) {
    await deliverOfficialCardShopPurchaseNotification(db, result).catch(
      () => null
    );
  }
  return result;
}

export const purchaseCardShopOffer = purchaseOfficialCardShopOffer;
export const buyOfficialCardShopOffer = purchaseOfficialCardShopOffer;

export function deliverOfficialCardShopPurchaseNotification(
  db: Database,
  result: Pick<
    OfficialCardShopPurchaseResult,
    "purchaseId" | "quantity" | "offerId" | "transactionId" | "packInstanceIds"
  > & {
    userId?: string;
  }
) {
  const getBuyer = result.userId
    ? Promise.resolve({ buyerUserId: result.userId })
    : db.query.officialCardShopPurchase.findFirst({
        columns: { buyerUserId: true },
        where: eq(officialCardShopPurchase.id, result.purchaseId),
      });
  return getBuyer.then((purchase) => {
    if (!purchase) {
      return null;
    }
    if (!purchase.buyerUserId) {
      return null;
    }
    return createUserNotification(db, {
      dedupeKey: `card-shop-purchase:${result.purchaseId}`,
      description: `Recibiste ${result.quantity} Pack${result.quantity === 1 ? "" : "s"} coleccionable${result.quantity === 1 ? "" : "s"}.`,
      metadata: {
        category: "collectible_acquisition",
        offerId: result.offerId,
        purchaseId: result.purchaseId,
        quantity: result.quantity,
        transactionId: result.transactionId,
      },
      targetUserId: purchase.buyerUserId,
      title: "Compra de Packs confirmada",
    });
  });
}

export async function retryOfficialCardShopPurchaseNotification(
  db: Database,
  purchaseId: string
) {
  assertCollectiblesMutationAllowed();
  const purchase = await db.query.officialCardShopPurchase.findFirst({
    where: eq(officialCardShopPurchase.id, purchaseId),
  });
  if (!purchase) {
    throw new OfficialCardShopError(
      "OFFER_UNAVAILABLE",
      "La compra no existe."
    );
  }
  const items = await purchaseItems(db, purchase.id);
  return deliverOfficialCardShopPurchaseNotification(db, {
    offerId: purchase.offerId,
    packInstanceIds: items,
    purchaseId: purchase.id,
    quantity: purchase.quantity,
    transactionId: purchase.eterisTransactionId,
  });
}

export async function getOfficialCardShopPurchase(
  db: Pick<Database, "query" | "select">,
  input: { purchaseId?: string; userId: string; idempotencyKey?: string }
) {
  const purchase = await db.query.officialCardShopPurchase.findFirst({
    where: input.purchaseId
      ? and(
          eq(officialCardShopPurchase.id, input.purchaseId),
          eq(officialCardShopPurchase.buyerUserId, input.userId)
        )
      : input.idempotencyKey
        ? and(
            eq(officialCardShopPurchase.idempotencyKey, input.idempotencyKey),
            eq(officialCardShopPurchase.buyerUserId, input.userId)
          )
        : undefined,
  });
  if (!purchase) {
    return null;
  }
  return purchaseResult(purchase, await purchaseItems(db, purchase.id), false);
}

export function listOwnOfficialCardShopPurchases(
  db: Pick<Database, "select">,
  userId: string,
  limit = 50
) {
  return db
    .select({
      createdAt: officialCardShopPurchase.createdAt,
      id: officialCardShopPurchase.id,
      offerId: officialCardShopPurchase.offerId,
      quantity: officialCardShopPurchase.quantity,
      totalPrice: officialCardShopPurchase.totalPrice,
      transactionId: officialCardShopPurchase.eterisTransactionId,
      unitPrice: officialCardShopPurchase.unitPrice,
    })
    .from(officialCardShopPurchase)
    .where(eq(officialCardShopPurchase.buyerUserId, userId))
    .orderBy(desc(officialCardShopPurchase.createdAt))
    .limit(Math.max(1, Math.min(100, limit)))
    .then((rows) =>
      rows.map((purchase) => ({
        ...purchase,
        totalPrice: purchase.totalPrice.toString(),
        unitPrice: purchase.unitPrice.toString(),
      }))
    );
}

export const createCardShopOffer = createOfficialCardShopOffer;
export const updateCardShopOffer = updateOfficialCardShopOffer;
export const listCardShopOffers = listOfficialCardShopOffers;
export const purchaseCardShop = purchaseOfficialCardShopOffer;
