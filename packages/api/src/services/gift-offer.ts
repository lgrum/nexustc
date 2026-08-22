import { createHash } from "node:crypto";

import {
  and,
  asc,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  collectibleCustody,
  desc,
  eq,
  eterisWallet,
  giftOffer,
  giftOfferHistory,
  inArray,
  isNull,
  lte,
  lt,
  or,
  packInstance,
  packRevision,
  packTemplate,
  profileSettings,
  sql,
  user,
  userBlock,
} from "@repo/db";
import type { db as database } from "@repo/db";
import { generateId } from "@repo/db/utils";
import {
  giftOfferActionInputSchema,
  giftOfferListInputSchema,
  giftOfferSendInputSchema,
  normalizeCollectiblePayload,
  recordCollectibleMetric,
} from "@repo/shared/collectibles";
import type {
  CollectibleAssetReference,
  CollectibleMetricSink,
  GiftOfferActionInput,
  GiftOfferAsset,
  GiftOfferListInput,
  GiftOfferSendInput,
  GiftOfferState,
} from "@repo/shared/collectibles";

import { isUserBanActive } from "../utils/user-ban";
import {
  assertNoActiveCollectibleCustody,
  CollectibleCustodyError,
  createCollectibleCustody,
  findActiveCollectibleCustody,
  listGiftOfferCustody,
  lockActiveCollectibleCustody,
  releaseGiftCollectibleCustody,
  transferCollectibleAssetOwner,
} from "./collectible-custody";
import type { CollectibleTransaction } from "./collectible-issuance";
import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import { createUserNotification } from "./notification";

type Database = typeof database;
type Transaction = CollectibleTransaction;

const GIFT_EXPIRY_DAYS = 7;
export const GIFT_OFFER_EXPIRY_MS = GIFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type GiftOfferErrorCode =
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_INELIGIBLE"
  | "ACTIVE_CUSTODY"
  | "ASSET_NOT_FOUND"
  | "ASSET_UNAVAILABLE"
  | "BINDING_NOT_TRANSFERABLE"
  | "DUPLICATE_ASSET"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_TERMS"
  | "OFFER_EXPIRED"
  | "OFFER_NOT_FOUND"
  | "OFFER_TERMINAL"
  | "OWNERSHIP_CHANGED"
  | "PERMISSION_DENIED"
  | "PREFERENCE_DISABLED"
  | "SELF_GIFT"
  | "STALE_VERSION";

export class GiftOfferError extends Error {
  readonly code: GiftOfferErrorCode;

  constructor(code: GiftOfferErrorCode, message: string) {
    super(message);
    this.name = "GiftOfferError";
    this.code = code;
  }
}

function sentGiftParticipant(userId: string | null) {
  if (!userId) {
    throw new GiftOfferError(
      "OFFER_TERMINAL",
      "La cuenta participante ya fue cerrada."
    );
  }
  return userId;
}

export type GiftOfferResult = {
  expiresAt: Date;
  giftId: string;
  state: GiftOfferState;
  termsHash: string;
  transferredAssetIds?: string[];
  version: number;
};

export type GiftOfferCommandResult = GiftOfferResult & { replayed: boolean };

export type GiftOfferDetail = {
  assets: (GiftOfferAsset & { side: "recipient" | "sender" })[];
  expiresAt: Date;
  giftId: string;
  history: {
    action: string;
    actorUserId: string | null;
    createdAt: Date;
    fromState: GiftOfferState | null;
    id: string;
    toState: GiftOfferState;
    version: number;
  }[];
  recipientUserId: string;
  senderUserId: string;
  sentAt: Date;
  state: GiftOfferState;
  termsHash: string;
  version: number;
};

function nowDate(value?: Date) {
  return value ?? new Date();
}

function addGiftExpiry(sentAt: Date) {
  return new Date(sentAt.getTime() + GIFT_OFFER_EXPIRY_MS);
}

function canonicalAssets(assets: readonly GiftOfferAsset[]) {
  return [...assets].toSorted((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    return kindOrder || left.assetId.localeCompare(right.assetId);
  });
}

function assetKey(asset: CollectibleAssetReference) {
  return `${asset.kind}:${asset.assetId}`;
}

function ensureDistinctAssets(assets: readonly CollectibleAssetReference[]) {
  if (assets.length < 1 || assets.length > 50) {
    throw new GiftOfferError(
      "INVALID_TERMS",
      "Un regalo debe incluir entre uno y 50 coleccionables exactos."
    );
  }
  const keys = assets.map(({ assetId }) => assetId);
  if (new Set(keys).size !== keys.length) {
    throw new GiftOfferError(
      "DUPLICATE_ASSET",
      "Un regalo no puede repetir el mismo coleccionable."
    );
  }
}

function fingerprintForSend(senderUserId: string, input: GiftOfferSendInput) {
  return normalizeCollectiblePayload({
    assets: canonicalAssets(input.assets),
    recipientUserId: input.recipientUserId,
    senderUserId,
  });
}

function fingerprintForAction(
  actorUserId: string,
  action: string,
  input: GiftOfferActionInput
) {
  return normalizeCollectiblePayload({
    action,
    actorUserId,
    giftId: input.giftId,
  });
}

function termsHash(fingerprint: string) {
  return createHash("sha256").update(fingerprint).digest("hex");
}

function resultMetadata(result: GiftOfferResult) {
  return {
    result: {
      expiresAt: result.expiresAt.toISOString(),
      giftId: result.giftId,
      state: result.state,
      termsHash: result.termsHash,
      ...(result.transferredAssetIds
        ? { transferredAssetIds: result.transferredAssetIds }
        : {}),
      version: result.version,
    },
  } satisfies Record<string, unknown>;
}

function giftMetric(
  metrics: CollectibleMetricSink | undefined,
  name:
    | "custody_conflict"
    | "stale_ownership"
    | "idempotency_conflict"
    | "expiry_backlog"
    | "repeated_cancellation",
  operation: string
) {
  recordCollectibleMetric(metrics, { name, operation });
}

function resultFromHistory(
  history: typeof giftOfferHistory.$inferSelect,
  replayed: boolean
): GiftOfferCommandResult {
  const { result } = history.metadata;
  if (!result || typeof result !== "object") {
    throw new GiftOfferError(
      "INVALID_TERMS",
      "El historial del regalo no contiene un resultado recuperable."
    );
  }
  const value = result as Record<string, unknown>;
  if (
    typeof value.giftId !== "string" ||
    typeof value.state !== "string" ||
    typeof value.termsHash !== "string" ||
    typeof value.version !== "number" ||
    typeof value.expiresAt !== "string"
  ) {
    throw new GiftOfferError(
      "INVALID_TERMS",
      "El historial del regalo no contiene un resultado válido."
    );
  }
  return {
    expiresAt: new Date(value.expiresAt),
    giftId: value.giftId,
    replayed,
    state: value.state as GiftOfferState,
    termsHash: value.termsHash,
    ...(Array.isArray(value.transferredAssetIds)
      ? {
          transferredAssetIds: value.transferredAssetIds.filter(
            (id): id is string => typeof id === "string"
          ),
        }
      : {}),
    version: value.version,
  };
}

async function assertEligibleAccounts(
  tx: Transaction,
  senderUserId: string,
  recipientUserId: string,
  now: Date,
  options: { checkInboundPreference?: boolean } = {}
) {
  const ids = [senderUserId, recipientUserId].toSorted((left, right) =>
    left.localeCompare(right)
  );
  const wallets = await tx
    .select({ status: eterisWallet.status, userId: eterisWallet.userId })
    .from(eterisWallet)
    .where(inArray(eterisWallet.userId, ids))
    .orderBy(asc(eterisWallet.userId))
    .for("update");
  if (
    wallets.length !== ids.length ||
    wallets.some((wallet) => wallet.status !== "active")
  ) {
    throw new GiftOfferError(
      "ACCOUNT_INELIGIBLE",
      "Una de las cuentas tiene su Wallet bloqueada."
    );
  }
  const accounts = await tx
    .select({
      banExpires: user.banExpires,
      banned: user.banned,
      emailVerified: user.emailVerified,
      id: user.id,
    })
    .from(user)
    .where(inArray(user.id, ids))
    .orderBy(asc(user.id))
    .for("update");
  if (
    accounts.length !== ids.length ||
    accounts.some(
      (account) =>
        !account.emailVerified ||
        isUserBanActive(
          { banExpires: account.banExpires, banned: account.banned },
          now
        )
    )
  ) {
    throw new GiftOfferError(
      "ACCOUNT_INELIGIBLE",
      "Una de las cuentas no puede participar en regalos."
    );
  }
  const blocks = await tx
    .select({ blockerUserId: userBlock.blockerUserId })
    .from(userBlock)
    .where(
      or(
        and(
          eq(userBlock.blockerUserId, senderUserId),
          eq(userBlock.blockedUserId, recipientUserId)
        ),
        and(
          eq(userBlock.blockerUserId, recipientUserId),
          eq(userBlock.blockedUserId, senderUserId)
        )
      )
    )
    .limit(1);
  if (blocks.length > 0) {
    throw new GiftOfferError(
      "ACCOUNT_BLOCKED",
      "No puedes enviar regalos a esta cuenta."
    );
  }
  if (options.checkInboundPreference !== false) {
    const settings = await tx
      .select({ inboundGiftsEnabled: profileSettings.inboundGiftsEnabled })
      .from(profileSettings)
      .where(eq(profileSettings.userId, recipientUserId))
      .limit(1);
    if (settings[0]?.inboundGiftsEnabled === false) {
      throw new GiftOfferError(
        "PREFERENCE_DISABLED",
        "Esta cuenta no acepta regalos entrantes."
      );
    }
  }
}

async function lockAssets(
  tx: Transaction,
  assets: readonly CollectibleAssetReference[]
) {
  const packIds = assets
    .filter(({ kind }) => kind === "pack")
    .map(({ assetId }) => assetId)
    .toSorted();
  const cardIds = assets
    .filter(({ kind }) => kind === "card")
    .map(({ assetId }) => assetId)
    .toSorted();
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

async function assertTransferableAsset(
  tx: Transaction,
  asset: GiftOfferAsset,
  ownerUserId: string
) {
  if (asset.kind === "card") {
    const [row] = await tx
      .select({
        availability: cardInstance.availability,
        binding: cardInstance.binding,
        id: cardInstance.id,
        lifecycle: cardTemplate.lifecycle,
        ownerUserId: cardInstance.ownerUserId,
        packInstanceId: cardInstance.packInstanceId,
        templateAvailability: cardTemplate.availability,
      })
      .from(cardInstance)
      .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
      .where(eq(cardInstance.id, asset.assetId))
      .limit(1);
    if (!row) {
      throw new GiftOfferError(
        "ASSET_NOT_FOUND",
        "La carta indicada no existe."
      );
    }
    if (row.ownerUserId !== ownerUserId) {
      throw new GiftOfferError(
        "OWNERSHIP_CHANGED",
        "Ya no eres propietario de la carta indicada."
      );
    }
    if (row.packInstanceId !== null) {
      throw new GiftOfferError(
        "ASSET_UNAVAILABLE",
        "Una carta dentro de un Pack no puede regalarse por separado."
      );
    }
    if (row.binding !== "transferable") {
      throw new GiftOfferError(
        "BINDING_NOT_TRANSFERABLE",
        "Las cartas vinculadas a una cuenta no pueden regalarse."
      );
    }
    if (
      row.availability !== "active" ||
      row.lifecycle !== "active" ||
      row.templateAvailability !== "active"
    ) {
      throw new GiftOfferError(
        "ASSET_UNAVAILABLE",
        "La carta no está disponible para regalarse."
      );
    }
    return;
  }

  const [row] = await tx
    .select({
      availability: packInstance.availability,
      binding: packInstance.binding,
      id: packInstance.id,
      ownerUserId: packInstance.ownerUserId,
      revisionId: packInstance.revisionId,
      state: packInstance.state,
      templateLifecycle: packTemplate.lifecycle,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .where(eq(packInstance.id, asset.assetId))
    .limit(1);
  if (!row) {
    throw new GiftOfferError("ASSET_NOT_FOUND", "El Pack indicado no existe.");
  }
  if (row.ownerUserId !== ownerUserId) {
    throw new GiftOfferError(
      "OWNERSHIP_CHANGED",
      "Ya no eres propietario del Pack indicado."
    );
  }
  if (row.state !== "unopened") {
    throw new GiftOfferError(
      "ASSET_UNAVAILABLE",
      "Los Packs abiertos no pueden regalarse."
    );
  }
  if (row.binding !== "transferable") {
    throw new GiftOfferError(
      "BINDING_NOT_TRANSFERABLE",
      "Los Packs vinculados a una cuenta no pueden regalarse."
    );
  }
  if (row.availability !== "active" || row.templateLifecycle === "draft") {
    throw new GiftOfferError(
      "ASSET_UNAVAILABLE",
      "El Pack no está disponible para regalarse."
    );
  }
  const [revision] = await tx
    .select({
      availability: packRevision.availability,
      lifecycle: packRevision.lifecycle,
    })
    .from(packRevision)
    .where(eq(packRevision.id, row.revisionId))
    .limit(1);
  if (
    !revision ||
    revision.lifecycle !== "published" ||
    revision.availability !== "active"
  ) {
    throw new GiftOfferError(
      "ASSET_UNAVAILABLE",
      "La revisión histórica del Pack no está disponible para regalarse."
    );
  }
}

async function lockOffer(tx: Transaction, giftId: string) {
  const [offer] = await tx
    .select()
    .from(giftOffer)
    .where(eq(giftOffer.id, giftId))
    .for("update");
  if (!offer) {
    throw new GiftOfferError("OFFER_NOT_FOUND", "El regalo no existe.");
  }
  return offer;
}

async function existingHistory(
  tx: Transaction,
  idempotencyKey: string,
  fingerprint: string,
  metrics?: CollectibleMetricSink,
  operation = "gift.command"
) {
  const [history] = await tx
    .select()
    .from(giftOfferHistory)
    .where(eq(giftOfferHistory.idempotencyKey, idempotencyKey))
    .for("update");
  if (!history) {
    return null;
  }
  if (history.fingerprint !== fingerprint) {
    giftMetric(metrics, "idempotency_conflict", operation);
    throw new GiftOfferError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya fue usada con otros términos."
    );
  }
  return resultFromHistory(history, true);
}

async function appendHistory(
  tx: Transaction,
  input: {
    action:
      | "administratively-cancelled"
      | "accepted"
      | "cancelled"
      | "expired"
      | "rejected"
      | "sent";
    actorUserId: string;
    fingerprint: string;
    fromState: GiftOfferState | null;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    giftId: string;
    source: string;
    termsHash: string;
    toState: GiftOfferState;
    version: number;
  }
) {
  await tx.insert(giftOfferHistory).values({
    action: input.action,
    actorUserId: input.actorUserId,
    fingerprint: input.fingerprint,
    fromState: input.fromState,
    giftOfferId: input.giftId,
    id: generateId(),
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
    source: input.source,
    termsHash: input.termsHash,
    toState: input.toState,
    version: input.version,
  });
}

async function sendGiftInTransaction(
  tx: Transaction,
  senderUserId: string,
  rawInput: GiftOfferSendInput,
  options: {
    historyFingerprint?: string;
    historySource?: string;
    metrics?: CollectibleMetricSink;
    now?: Date;
  } = {}
) {
  const input = giftOfferSendInputSchema.parse(rawInput);
  ensureDistinctAssets(input.assets);
  const sentAt = nowDate(options.now);
  const fingerprint = fingerprintForSend(senderUserId, input);
  const historyFingerprint = options.historyFingerprint ?? fingerprint;
  const historySource = options.historySource ?? "gifts.send";
  const hash = termsHash(fingerprint);
  const [existing] = await tx
    .select()
    .from(giftOffer)
    .where(eq(giftOffer.idempotencyKey, input.idempotencyKey))
    .for("update");
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      giftMetric(options.metrics, "idempotency_conflict", "gift.send");
      throw new GiftOfferError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya fue usada con otros términos."
      );
    }
    const [history] = await tx
      .select()
      .from(giftOfferHistory)
      .where(eq(giftOfferHistory.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (history) {
      if (history.fingerprint !== historyFingerprint) {
        giftMetric(options.metrics, "idempotency_conflict", "gift.send");
        throw new GiftOfferError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya fue usada con otros términos."
        );
      }
      return resultFromHistory(history, true);
    }
    return {
      expiresAt: existing.expiresAt,
      giftId: existing.id,
      replayed: true,
      state: existing.state as GiftOfferState,
      termsHash: existing.termsHash,
      version: existing.version,
    } satisfies GiftOfferCommandResult;
  }
  if (senderUserId === input.recipientUserId) {
    throw new GiftOfferError(
      "SELF_GIFT",
      "No puedes enviarte un regalo a ti mismo."
    );
  }
  await assertEligibleAccounts(
    tx,
    senderUserId,
    input.recipientUserId,
    sentAt,
    { checkInboundPreference: true }
  );
  await lockAssets(tx, input.assets);
  for (const asset of input.assets) {
    await assertTransferableAsset(tx, asset, senderUserId);
  }
  try {
    await assertNoActiveCollectibleCustody(tx, input.assets);
  } catch (error) {
    if (!(error instanceof CollectibleCustodyError)) {
      throw error;
    }
    giftMetric(options.metrics, "custody_conflict", "gift.send");
    throw new GiftOfferError(
      "ACTIVE_CUSTODY",
      "Uno de los activos ya está reservado por otra operación."
    );
  }
  const expiresAt = addGiftExpiry(sentAt);
  const giftId = generateId();
  await tx.insert(giftOffer).values({
    actorUserId: senderUserId,
    expiresAt,
    fingerprint,
    id: giftId,
    idempotencyKey: input.idempotencyKey,
    recipientUserId: input.recipientUserId,
    senderConfirmedAt: sentAt,
    senderUserId,
    sentAt,
    source: "gifts.send",
    state: "sent",
    termsHash: hash,
    version: 1,
  });
  await createCollectibleCustody(tx, {
    acquiredAt: sentAt,
    assets: canonicalAssets(input.assets).map((asset) => ({
      asset,
      // The retained custody side predates Gift Offers. `proposer` is the
      // sender side for gifts; the Gift Offer row remains the domain owner.
      side: "proposer" as const,
    })),
    giftOfferId: giftId,
  });
  await appendHistory(tx, {
    action: "sent",
    actorUserId: senderUserId,
    fingerprint: historyFingerprint,
    fromState: null,
    giftId,
    idempotencyKey: input.idempotencyKey,
    metadata: resultMetadata({
      expiresAt,
      giftId,
      state: "sent",
      termsHash: hash,
      version: 1,
    }),
    source: historySource,
    termsHash: hash,
    toState: "sent",
    version: 1,
  });
  return {
    expiresAt,
    giftId,
    replayed: false,
    state: "sent" as const,
    termsHash: hash,
    version: 1,
  } satisfies GiftOfferCommandResult;
}

function sqlAdvisoryLock(key: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function sendGiftOffer(
  db: Database,
  senderUserId: string,
  rawInput: GiftOfferSendInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
): Promise<GiftOfferCommandResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  const {
    impersonated: _impersonated,
    metrics: _metrics,
    now: _now,
    ...contractInput
  } = rawInput;
  const input = giftOfferSendInputSchema.parse(contractInput);
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`collectible-gift-send:${input.idempotencyKey}`)
        );
        return sendGiftInTransaction(tx, senderUserId, input, {
          metrics: rawInput.metrics,
          now: rawInput.now,
        });
      }),
    { metrics: rawInput.metrics, operation: "gift.send" }
  );
  if (!result.replayed) {
    await deliverGiftNotification(db, {
      actorUserId: senderUserId,
      giftId: result.giftId,
      kind: "sent",
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

type TerminalAction = "accept" | "cancel" | "expire" | "reject";

function custodyAsset(row: {
  cardInstanceId: string | null;
  packInstanceId: string | null;
}): GiftOfferAsset {
  return row.cardInstanceId
    ? { assetId: row.cardInstanceId, kind: "card" }
    : { assetId: row.packInstanceId!, kind: "pack" };
}

async function finalizeGiftOffer(
  tx: Transaction,
  offer: typeof giftOffer.$inferSelect,
  actorUserId: string,
  action: TerminalAction,
  state: GiftOfferState,
  reason: string,
  fingerprint: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  if (offer.state !== "sent") {
    giftMetric(metrics, "repeated_cancellation", `gift.${action}`);
    throw new GiftOfferError(
      "OFFER_TERMINAL",
      "El regalo ya alcanzó un estado terminal."
    );
  }
  const version = offer.version + 1;
  await releaseGiftCollectibleCustody(tx, offer.id, state, now);
  await tx
    .update(giftOffer)
    .set({
      state,
      terminalAt: now,
      terminalReason: reason,
      updatedAt: now,
      version,
    })
    .where(and(eq(giftOffer.id, offer.id), eq(giftOffer.state, "sent")));
  const result = {
    expiresAt: offer.expiresAt,
    giftId: offer.id,
    replayed: false,
    state,
    termsHash: offer.termsHash,
    version,
  } satisfies GiftOfferCommandResult;
  await appendHistory(tx, {
    action:
      state === "administratively-cancelled"
        ? "administratively-cancelled"
        : state === "cancelled"
          ? "cancelled"
          : state === "rejected"
            ? "rejected"
            : "expired",
    actorUserId,
    fingerprint,
    fromState: "sent",
    giftId: offer.id,
    idempotencyKey,
    metadata: resultMetadata(result),
    source: `gifts.${action}`,
    termsHash: offer.termsHash,
    toState: state,
    version,
  });
  return result;
}

async function acceptLockedGiftOffer(
  tx: Transaction,
  offer: typeof giftOffer.$inferSelect,
  custody: Awaited<ReturnType<typeof listGiftOfferCustody>>,
  actorUserId: string,
  fingerprint: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  const assets = custody.map(custodyAsset);
  const senderUserId = sentGiftParticipant(offer.senderUserId);
  const recipientUserId = sentGiftParticipant(offer.recipientUserId);
  ensureDistinctAssets(assets);
  try {
    for (const asset of assets) {
      await assertTransferableAsset(tx, asset, senderUserId);
    }
  } catch (error) {
    if (
      error instanceof GiftOfferError &&
      (error.code === "OWNERSHIP_CHANGED" || error.code === "ASSET_UNAVAILABLE")
    ) {
      giftMetric(metrics, "stale_ownership", "gift.accept");
    }
    throw error;
  }
  const transferredAssetIds: string[] = [];
  for (const asset of canonicalAssets(assets)) {
    try {
      await transferCollectibleAssetOwner(
        tx,
        asset,
        senderUserId,
        recipientUserId,
        now
      );
    } catch {
      giftMetric(metrics, "stale_ownership", "gift.accept");
      throw new GiftOfferError(
        "OWNERSHIP_CHANGED",
        "La propiedad del coleccionable cambió antes de aceptar el regalo."
      );
    }
    transferredAssetIds.push(asset.assetId);
    await appendCollectibleOwnershipEvent(tx, {
      actorUserId,
      cardInstanceId: asset.kind === "card" ? asset.assetId : undefined,
      fromUserId: senderUserId,
      kind: "gift",
      metadata: { giftId: offer.id },
      packInstanceId: asset.kind === "pack" ? asset.assetId : undefined,
      sourceReference: offer.id,
      sourceType: "gift.accept",
      toUserId: recipientUserId,
    });
  }
  await releaseGiftCollectibleCustody(tx, offer.id, "accepted", now);
  const version = offer.version + 1;
  await tx
    .update(giftOffer)
    .set({
      state: "accepted",
      terminalAt: now,
      terminalReason: "El regalo fue aceptado de forma irreversible.",
      updatedAt: now,
      version,
    })
    .where(and(eq(giftOffer.id, offer.id), eq(giftOffer.state, "sent")));
  const result = {
    expiresAt: offer.expiresAt,
    giftId: offer.id,
    replayed: false,
    state: "accepted" as const,
    termsHash: offer.termsHash,
    transferredAssetIds,
    version,
  } satisfies GiftOfferCommandResult;
  await appendHistory(tx, {
    action: "accepted",
    actorUserId,
    fingerprint,
    fromState: "sent",
    giftId: offer.id,
    idempotencyKey,
    metadata: resultMetadata(result),
    source: "gifts.accept",
    termsHash: offer.termsHash,
    toState: "accepted",
    version,
  });
  return result;
}

async function transitionGiftOfferInTransaction(
  tx: Transaction,
  actorUserId: string,
  rawInput: GiftOfferActionInput,
  action: TerminalAction,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<GiftOfferCommandResult> {
  const input = giftOfferActionInputSchema.parse(rawInput);
  const fingerprint = fingerprintForAction(actorUserId, action, input);
  const existing = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    options.metrics,
    `gift.${action}`
  );
  if (existing) {
    return existing;
  }
  const initialOffer = await lockOffer(tx, input.giftId);
  const replayAfterLock = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    options.metrics,
    `gift.${action}`
  );
  if (replayAfterLock) {
    return replayAfterLock;
  }
  if (
    action !== "expire" &&
    actorUserId !== initialOffer.senderUserId &&
    actorUserId !== initialOffer.recipientUserId
  ) {
    throw new GiftOfferError(
      "PERMISSION_DENIED",
      "No participas en este regalo."
    );
  }
  const custody = await listGiftOfferCustody(tx, input.giftId);
  const assets = custody.map(custodyAsset);
  ensureDistinctAssets(assets);
  const now = nowDate(options.now);
  if (action === "accept" && now < initialOffer.expiresAt) {
    const senderUserId = sentGiftParticipant(initialOffer.senderUserId);
    const recipientUserId = sentGiftParticipant(initialOffer.recipientUserId);
    await assertEligibleAccounts(tx, senderUserId, recipientUserId, now, {
      checkInboundPreference: false,
    });
  }
  await lockAssets(tx, assets);
  if (initialOffer.state !== "sent") {
    throw new GiftOfferError(
      "OFFER_TERMINAL",
      "El regalo ya alcanzó un estado terminal."
    );
  }
  const activeCustody = await findActiveCollectibleCustody(tx, assets);
  if (activeCustody.length !== assets.length) {
    giftMetric(options.metrics, "custody_conflict", `gift.${action}`);
    throw new GiftOfferError(
      "ACTIVE_CUSTODY",
      "Uno de los activos ya no está reservado por este regalo."
    );
  }
  await lockActiveCollectibleCustody(tx, assets);
  if (action === "accept" && actorUserId !== initialOffer.recipientUserId) {
    throw new GiftOfferError(
      "PERMISSION_DENIED",
      "Solo la persona destinataria puede aceptar el regalo."
    );
  }
  if (action === "reject" && actorUserId !== initialOffer.recipientUserId) {
    throw new GiftOfferError(
      "PERMISSION_DENIED",
      "Solo la persona destinataria puede rechazar el regalo."
    );
  }
  if (action === "cancel" && actorUserId !== initialOffer.senderUserId) {
    throw new GiftOfferError(
      "PERMISSION_DENIED",
      "Solo la persona remitente puede cancelar el regalo."
    );
  }
  if (now >= initialOffer.expiresAt) {
    return finalizeGiftOffer(
      tx,
      initialOffer,
      actorUserId,
      "expire",
      "expired",
      "El regalo expiró después de siete días.",
      fingerprint,
      input.idempotencyKey,
      now,
      options.metrics
    );
  }
  if (action === "accept") {
    return acceptLockedGiftOffer(
      tx,
      initialOffer,
      custody,
      actorUserId,
      fingerprint,
      input.idempotencyKey,
      now,
      options.metrics
    );
  }
  return finalizeGiftOffer(
    tx,
    initialOffer,
    actorUserId,
    action,
    action === "reject" ? "rejected" : "cancelled",
    action === "reject"
      ? "El regalo fue rechazado."
      : "El regalo fue cancelado.",
    fingerprint,
    input.idempotencyKey,
    now,
    options.metrics
  );
}

async function runGiftTransition(
  db: Database,
  actorUserId: string,
  input: GiftOfferActionInput,
  action: TerminalAction,
  options: {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
    skipGate?: boolean;
  } = {}
): Promise<GiftOfferCommandResult> {
  if (!options.skipGate) {
    assertCollectiblesMutationAllowed({ impersonated: options.impersonated });
  }
  const parsed = giftOfferActionInputSchema.parse({
    giftId: input.giftId,
    idempotencyKey: input.idempotencyKey,
  });
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction((tx) =>
        tx
          .execute(
            sqlAdvisoryLock(
              `collectible-gift-${action}:${parsed.idempotencyKey}`
            )
          )
          .then(() =>
            transitionGiftOfferInTransaction(tx, actorUserId, parsed, action, {
              metrics: options.metrics,
              now: options.now,
            })
          )
      ),
    { metrics: options.metrics, operation: `gift.${action}` }
  );
  if (!result.replayed) {
    await deliverGiftNotification(db, {
      actorUserId,
      giftId: result.giftId,
      kind: result.state,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export function acceptGiftOffer(
  db: Database,
  actorUserId: string,
  input: GiftOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runGiftTransition(db, actorUserId, input, "accept", input);
}

export function rejectGiftOffer(
  db: Database,
  actorUserId: string,
  input: GiftOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runGiftTransition(db, actorUserId, input, "reject", input);
}

export function cancelGiftOffer(
  db: Database,
  actorUserId: string,
  input: GiftOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runGiftTransition(db, actorUserId, input, "cancel", input);
}

export type AdministrativeGiftCancellationInput = {
  expectedVersion: number;
  giftId: string;
  idempotencyKey: string;
  impersonated?: boolean;
  metrics?: CollectibleMetricSink;
  now?: Date;
  reason: string;
};

/** Owner/moderation-only closure; it releases custody without transferring assets. */
export async function administrativelyCancelGiftOffer(
  db: Database,
  actorUserId: string,
  input: AdministrativeGiftCancellationInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new GiftOfferError(
      "INVALID_TERMS",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new GiftOfferError(
      "STALE_VERSION",
      "Confirma la versión actual antes de cerrar el regalo."
    );
  }
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`collectible-gift-admin:${input.idempotencyKey}`)
        );
        const offer = await lockOffer(tx, input.giftId);
        const fingerprint = normalizeCollectiblePayload({
          action: "administratively-cancelled",
          actorUserId,
          giftId: offer.id,
        });
        const replay = await existingHistory(
          tx,
          input.idempotencyKey,
          fingerprint,
          input.metrics,
          "gift.administrative-cancel"
        );
        if (replay) {
          return replay;
        }
        if (offer.version !== input.expectedVersion) {
          throw new GiftOfferError(
            "STALE_VERSION",
            "El regalo cambió. Recarga antes de continuar."
          );
        }
        return closeSentGiftOfferInTransaction(
          tx,
          offer,
          actorUserId,
          "administratively-cancelled",
          reason,
          input.idempotencyKey,
          input.now ?? new Date(),
          input.metrics
        );
      }),
    { metrics: input.metrics, operation: "gift.administrative-cancel" }
  );
  if (!result.replayed) {
    await deliverGiftNotification(db, {
      actorUserId,
      giftId: result.giftId,
      kind: result.state,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export function expireGiftOffer(
  db: Database,
  actorUserId: string,
  input: GiftOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
    skipGate?: boolean;
  }
) {
  return runGiftTransition(db, actorUserId, input, "expire", input);
}

export async function updateInboundGiftPreference(
  db: Database,
  userId: string,
  enabled: boolean,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  assertCollectiblesMutationAllowed();
  const now = nowDate(options.now);
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        const existing = await tx
          .select({ userId: profileSettings.userId })
          .from(profileSettings)
          .where(eq(profileSettings.userId, userId))
          .limit(1);
        if (existing.length === 0) {
          await tx.insert(profileSettings).values({ userId });
        }
        const [settings] = await tx
          .update(profileSettings)
          .set({ inboundGiftsEnabled: enabled })
          .where(eq(profileSettings.userId, userId))
          .returning({
            inboundGiftsEnabled: profileSettings.inboundGiftsEnabled,
          });
        if (!settings) {
          throw new Error("No se pudo guardar la preferencia de regalos.");
        }
        const closedGiftIds: string[] = [];
        if (!enabled) {
          const offers = await tx
            .select()
            .from(giftOffer)
            .where(
              and(
                eq(giftOffer.recipientUserId, userId),
                eq(giftOffer.state, "sent")
              )
            )
            .orderBy(asc(giftOffer.id))
            .for("update");
          for (const offer of offers) {
            const closed = await closeSentGiftOfferInTransaction(
              tx,
              offer,
              userId,
              "cancelled",
              "La cuenta destinataria desactivó los regalos entrantes.",
              `gift-preference:${userId}:${offer.id}`,
              now,
              options.metrics
            );
            if (!closed.replayed) {
              closedGiftIds.push(offer.id);
            }
          }
        }
        return {
          closedGiftIds,
          inboundGiftsEnabled: settings.inboundGiftsEnabled,
        };
      }),
    { metrics: options.metrics, operation: "gift.preference" }
  );
  for (const giftId of result.closedGiftIds) {
    await deliverGiftNotification(db, {
      actorUserId: userId,
      giftId,
      kind: "cancelled",
      state: "cancelled",
    }).catch(() => null);
  }
  return result;
}

export async function closeSentGiftOfferInTransaction(
  tx: Transaction,
  offer: typeof giftOffer.$inferSelect,
  actorUserId: string,
  state: "administratively-cancelled" | "cancelled",
  reason: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  const fingerprint = normalizeCollectiblePayload({
    action: state,
    actorUserId,
    giftId: offer.id,
  });
  const replay = await existingHistory(
    tx,
    idempotencyKey,
    fingerprint,
    metrics,
    `gift.${state}`
  );
  if (replay) {
    return replay;
  }
  if (offer.state !== "sent") {
    giftMetric(metrics, "repeated_cancellation", `gift.${state}`);
    return {
      expiresAt: offer.expiresAt,
      giftId: offer.id,
      replayed: true,
      state: offer.state as GiftOfferState,
      termsHash: offer.termsHash,
      version: offer.version,
    } satisfies GiftOfferCommandResult;
  }
  const custody = await listGiftOfferCustody(tx, offer.id);
  const assets = custody.map(custodyAsset);
  if (assets.length > 0) {
    await lockAssets(tx, assets);
    await lockActiveCollectibleCustody(tx, assets);
  }
  return finalizeGiftOffer(
    tx,
    offer,
    actorUserId,
    "cancel",
    state,
    reason,
    fingerprint,
    idempotencyKey,
    now,
    metrics
  );
}

/** Close pending gifts from the same transaction that creates a canonical block. */
export async function closeGiftOffersForBlockInTransaction(
  tx: Transaction,
  blockerUserId: string,
  blockedUserId: string,
  now = new Date(),
  metrics?: CollectibleMetricSink
) {
  const offers = await tx
    .select()
    .from(giftOffer)
    .where(
      and(
        eq(giftOffer.state, "sent"),
        or(
          and(
            eq(giftOffer.senderUserId, blockerUserId),
            eq(giftOffer.recipientUserId, blockedUserId)
          ),
          and(
            eq(giftOffer.senderUserId, blockedUserId),
            eq(giftOffer.recipientUserId, blockerUserId)
          )
        )
      )
    )
    .orderBy(asc(giftOffer.id))
    .for("update");
  const closedGiftIds: string[] = [];
  for (const offer of offers) {
    const closed = await closeSentGiftOfferInTransaction(
      tx,
      offer,
      blockerUserId,
      "administratively-cancelled",
      "El regalo se cerró porque una de las cuentas bloqueó a la otra.",
      `gift-block:${blockerUserId}:${blockedUserId}:${offer.id}`,
      now,
      metrics
    );
    if (!closed.replayed) {
      closedGiftIds.push(offer.id);
    }
  }
  return closedGiftIds;
}

export async function closeGiftOffersForBlock(
  db: Database,
  blockerUserId: string,
  blockedUserId: string,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  const closedGiftIds = await db.transaction((tx) =>
    closeGiftOffersForBlockInTransaction(
      tx,
      blockerUserId,
      blockedUserId,
      nowDate(options.now),
      options.metrics
    )
  );
  for (const giftId of closedGiftIds) {
    await deliverGiftNotification(db, {
      actorUserId: blockerUserId,
      giftId,
      kind: "administratively-cancelled",
      state: "administratively-cancelled",
    }).catch(() => null);
  }
  return { closedGiftIds };
}

export type GiftExpiryBatchResult = {
  checked: number;
  expired: number;
  giftIds: string[];
  participantUserIds: string[];
};

export async function expireCollectibleGiftOffersBatch(
  db: Database,
  options: { limit?: number; metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<GiftExpiryBatchResult> {
  const now = nowDate(options.now);
  const limit = Math.max(1, Math.min(200, options.limit ?? 100));
  const candidates = await db
    .select({
      expiresAt: giftOffer.expiresAt,
      id: giftOffer.id,
      recipientUserId: giftOffer.recipientUserId,
      senderUserId: giftOffer.senderUserId,
    })
    .from(giftOffer)
    .where(and(eq(giftOffer.state, "sent"), lte(giftOffer.expiresAt, now)))
    .orderBy(asc(giftOffer.expiresAt), asc(giftOffer.id))
    .limit(limit);
  if (candidates.length === limit) {
    giftMetric(options.metrics, "expiry_backlog", "gift.expiry.batch");
  }
  const giftIds: string[] = [];
  const participantUserIds = new Set<string>();
  for (const candidate of candidates) {
    const senderUserId = sentGiftParticipant(candidate.senderUserId);
    const recipientUserId = sentGiftParticipant(candidate.recipientUserId);
    const result = await expireGiftOffer(db, senderUserId, {
      giftId: candidate.id,
      idempotencyKey: `gift-expiry:${candidate.id}:${candidate.expiresAt.toISOString()}`,
      metrics: options.metrics,
      now,
      skipGate: true,
    });
    if (!result.replayed && result.state === "expired") {
      giftIds.push(candidate.id);
      participantUserIds.add(senderUserId);
      participantUserIds.add(recipientUserId);
    }
  }
  return {
    checked: candidates.length,
    expired: giftIds.length,
    giftIds,
    participantUserIds: [...participantUserIds].toSorted(),
  };
}

export async function getGiftOffer(
  db: Database,
  viewerUserId: string,
  giftId: string,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<GiftOfferDetail | null> {
  let [offer] = await db
    .select()
    .from(giftOffer)
    .where(
      and(
        eq(giftOffer.id, giftId),
        or(
          eq(giftOffer.senderUserId, viewerUserId),
          eq(giftOffer.recipientUserId, viewerUserId)
        )
      )
    )
    .limit(1);
  if (!offer) {
    return null;
  }
  const now = nowDate(options.now);
  if (offer.state === "sent" && now >= offer.expiresAt) {
    await expireGiftOffer(db, sentGiftParticipant(offer.senderUserId), {
      giftId: offer.id,
      idempotencyKey: `gift-expiry:${offer.id}:${offer.expiresAt.toISOString()}`,
      metrics: options.metrics,
      now,
      skipGate: true,
    });
    [offer] = await db
      .select()
      .from(giftOffer)
      .where(
        and(
          eq(giftOffer.id, giftId),
          or(
            eq(giftOffer.senderUserId, viewerUserId),
            eq(giftOffer.recipientUserId, viewerUserId)
          )
        )
      )
      .limit(1);
    if (!offer) {
      return null;
    }
  }
  const [custody, history] = await Promise.all([
    listGiftOfferCustody(db, offer.id),
    db
      .select()
      .from(giftOfferHistory)
      .where(eq(giftOfferHistory.giftOfferId, offer.id))
      .orderBy(asc(giftOfferHistory.createdAt), asc(giftOfferHistory.id)),
  ]);
  return {
    assets: custody.map((row) => ({
      assetId: row.cardInstanceId ?? row.packInstanceId!,
      kind: row.cardInstanceId ? ("card" as const) : ("pack" as const),
      side: "sender" as const,
    })),
    expiresAt: offer.expiresAt,
    giftId: offer.id,
    history: history.map((row) => ({
      action: row.action,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      fromState: row.fromState as GiftOfferState | null,
      id: row.id,
      toState: row.toState as GiftOfferState,
      version: row.version,
    })),
    recipientUserId: offer.recipientUserId ?? "closed-account",
    senderUserId: offer.senderUserId ?? "closed-account",
    sentAt: offer.sentAt,
    state: offer.state as GiftOfferState,
    termsHash: offer.termsHash,
    version: offer.version,
  };
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) {
    return null;
  }
  const separator = cursor.lastIndexOf("|");
  if (separator <= 0) {
    return null;
  }
  const sentAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  return Number.isNaN(sentAt.getTime()) || !id ? null : { id, sentAt };
}

export async function listGiftOffers(
  db: Database,
  viewerUserId: string,
  rawInput: Omit<GiftOfferListInput, "limit"> & { limit?: number } = {},
  role: "all" | "inbox" | "sent" = "all"
) {
  const input = giftOfferListInputSchema.parse(rawInput);
  await expireCollectibleGiftOffersBatch(db);
  const cursor = decodeCursor(input.cursor);
  const participantCondition =
    role === "inbox"
      ? eq(giftOffer.recipientUserId, viewerUserId)
      : role === "sent"
        ? eq(giftOffer.senderUserId, viewerUserId)
        : or(
            eq(giftOffer.senderUserId, viewerUserId),
            eq(giftOffer.recipientUserId, viewerUserId)
          );
  const rows = await db
    .select({
      expiresAt: giftOffer.expiresAt,
      id: giftOffer.id,
      recipientUserId: giftOffer.recipientUserId,
      senderUserId: giftOffer.senderUserId,
      sentAt: giftOffer.sentAt,
      state: giftOffer.state,
      version: giftOffer.version,
    })
    .from(giftOffer)
    .where(
      and(
        participantCondition,
        input.state ? eq(giftOffer.state, input.state) : undefined,
        cursor
          ? or(
              lt(giftOffer.sentAt, cursor.sentAt),
              and(
                eq(giftOffer.sentAt, cursor.sentAt),
                lt(giftOffer.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(giftOffer.sentAt), desc(giftOffer.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const counts = new Map<string, number>();
  if (page.length > 0) {
    const custodyCounts = await db
      .select({
        count: sql<number>`count(*)::integer`,
        giftId: collectibleCustody.giftOfferId,
      })
      .from(collectibleCustody)
      .where(
        inArray(
          collectibleCustody.giftOfferId,
          page.map(({ id }) => id)
        )
      )
      .groupBy(collectibleCustody.giftOfferId);
    for (const row of custodyCounts) {
      if (row.giftId) {
        counts.set(row.giftId, row.count);
      }
    }
  }
  const items = page.map((item) => ({
    ...item,
    assetCount: counts.get(item.id) ?? 0,
  }));
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? `${last.sentAt.toISOString()}|${last.id}`
        : null,
  };
}

export async function listEligibleGiftAssets(db: Database, userId: string) {
  const [cards, packs] = await Promise.all([
    db
      .select({
        assetId: cardInstance.id,
        binding: cardInstance.binding,
        characterName: cardCharacter.characterName,
        edition: cardTemplate.edition,
        gameName: cardCharacter.gameName,
        kind: sql<"card">`'card'`,
        mintNumber: cardInstance.mintNumber,
        rarity: cardTemplate.rarity,
        seriesName: cardSeries.name,
      })
      .from(cardInstance)
      .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
      .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
      .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
      .where(
        and(
          eq(cardInstance.ownerUserId, userId),
          isNull(cardInstance.packInstanceId),
          eq(cardInstance.availability, "active"),
          eq(cardInstance.binding, "transferable"),
          eq(cardTemplate.lifecycle, "active"),
          eq(cardTemplate.availability, "active")
        )
      )
      .orderBy(asc(cardInstance.id)),
    db
      .select({
        assetId: packInstance.id,
        binding: packInstance.binding,
        kind: sql<"pack">`'pack'`,
        mintNumber: sql<number | null>`null`,
        templateName: packTemplate.name,
      })
      .from(packInstance)
      .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
      .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
      .where(
        and(
          eq(packInstance.ownerUserId, userId),
          eq(packInstance.state, "unopened"),
          eq(packInstance.availability, "active"),
          eq(packInstance.binding, "transferable"),
          eq(packRevision.lifecycle, "published"),
          eq(packRevision.availability, "active")
        )
      )
      .orderBy(asc(packInstance.id)),
  ]);
  const assets = [...cards, ...packs];
  const active = await findActiveCollectibleCustody(
    db,
    assets.map(({ assetId, kind }) => ({ assetId, kind }))
  );
  const activeKeys = new Set(active.map(assetKey));
  return assets.filter(
    ({ assetId, kind }) => !activeKeys.has(`${kind}:${assetId}`)
  );
}

async function deliverGiftNotification(
  db: Database,
  input: {
    actorUserId: string;
    giftId: string;
    kind: string;
    state: string;
  }
) {
  const [offer] = await db
    .select({
      recipientUserId: giftOffer.recipientUserId,
      senderUserId: giftOffer.senderUserId,
    })
    .from(giftOffer)
    .where(eq(giftOffer.id, input.giftId))
    .limit(1);
  if (!offer) {
    return;
  }
  const targets =
    input.kind === "sent"
      ? [offer.recipientUserId]
      : [offer.senderUserId, offer.recipientUserId];
  await Promise.all(
    [...new Set(targets)]
      .filter((targetUserId): targetUserId is string => Boolean(targetUserId))
      .filter((target) => target !== input.actorUserId)
      .map((targetUserId) =>
        createUserNotification(db, {
          dedupeKey: `collectible-gift:${input.giftId}:${input.state}:${targetUserId}`,
          description:
            input.kind === "sent"
              ? "Tienes un regalo de coleccionables pendiente de aceptar."
              : `El regalo de coleccionables terminó como «${input.state}».`,
          metadata: {
            category: "collectible_gift",
            giftId: input.giftId,
            linkPath: `/cards/gifts/${input.giftId}`,
            state: input.state,
          },
          sourceUserId: input.actorUserId,
          targetUserId,
          title:
            input.kind === "sent"
              ? "Nuevo regalo de coleccionables"
              : "Actualización de tu regalo",
        })
      )
  );
}

export function notifyGiftOfferParticipants(
  db: Database,
  input: {
    actorUserId: string;
    giftId: string;
    kind: string;
    state: string;
  }
) {
  return deliverGiftNotification(db, input);
}

export const createGiftOffer = sendGiftOffer;
export const sendGift = sendGiftOffer;
export const sendCollectibleGift = sendGiftOffer;
export const acceptGift = acceptGiftOffer;
export const acceptCollectibleGift = acceptGiftOffer;
export const rejectGift = rejectGiftOffer;
export const rejectCollectibleGift = rejectGiftOffer;
export const cancelGift = cancelGiftOffer;
export const cancelCollectibleGift = cancelGiftOffer;
export const expireGiftsBatch = expireCollectibleGiftOffersBatch;
export const expireGiftOffersBatch = expireCollectibleGiftOffersBatch;
export const listGifts = listGiftOffers;
