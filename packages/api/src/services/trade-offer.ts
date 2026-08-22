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
  inArray,
  isNull,
  lt,
  lte,
  or,
  packInstance,
  packRevision,
  packTemplate,
  profileSettings,
  sql,
  tradeOffer,
  tradeOfferHistory,
  user,
  userBlock,
} from "@repo/db";
import type { db as database } from "@repo/db";
import { generateId } from "@repo/db/utils";
import {
  normalizeCollectiblePayload,
  recordCollectibleMetric,
  tradeOfferActionInputSchema,
  tradeOfferCounterInputSchema,
  tradeOfferListInputSchema,
  tradeOfferSendInputSchema,
} from "@repo/shared/collectibles";
import type {
  CollectibleAssetReference,
  CollectibleMetricSink,
  TradeOfferActionInput,
  TradeOfferAsset,
  TradeOfferCounterInput,
  TradeOfferListInput,
  TradeOfferSendInput,
} from "@repo/shared/collectibles";

import { isUserBanActive } from "../utils/user-ban";
import {
  assertNoActiveCollectibleCustody,
  createCollectibleCustody,
  findActiveCollectibleCustody,
  lockActiveCollectibleCustody,
  listTradeOfferCustody,
  releaseCollectibleCustody,
  transferCollectibleAssetOwner,
} from "./collectible-custody";
import type { CollectibleTransaction } from "./collectible-issuance";
import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import {
  closeGiftOffersForBlockInTransaction,
  notifyGiftOfferParticipants,
} from "./gift-offer";
import { createUserNotification } from "./notification";

type Database = typeof database;
type Transaction = CollectibleTransaction;

const TRADE_EXPIRY_DAYS = 7;
export const TRADE_OFFER_EXPIRY_MS = TRADE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type TradeOfferState =
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired"
  | "administratively-cancelled";

export type TradeOfferErrorCode =
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
  | "SELF_TRADE"
  | "STALE_VERSION";

export class TradeOfferError extends Error {
  readonly code: TradeOfferErrorCode;

  constructor(code: TradeOfferErrorCode, message: string) {
    super(message);
    this.name = "TradeOfferError";
    this.code = code;
  }
}

function sentTradeParticipant(userId: string | null) {
  if (!userId) {
    throw new TradeOfferError(
      "OFFER_TERMINAL",
      "La cuenta participante ya fue cerrada."
    );
  }
  return userId;
}

export type TradeOfferResult = {
  expiresAt: Date;
  offerId: string;
  state: TradeOfferState;
  termsHash: string;
  transferredAssetIds?: string[];
  version: number;
};

export type TradeOfferCommandResult = TradeOfferResult & { replayed: boolean };

export type TradeOfferDetail = {
  counterpartyUserId: string;
  expiresAt: Date;
  history: {
    action: string;
    actorUserId: string | null;
    createdAt: Date;
    fromState: TradeOfferState | null;
    id: string;
    toState: TradeOfferState;
    version: number;
  }[];
  offerId: string;
  proposerUserId: string;
  recipientUserId: string;
  sentAt: Date;
  state: TradeOfferState;
  termsHash: string;
  version: number;
  assets: (TradeOfferAsset & { side: "proposer" | "recipient" })[];
};

type TradeAssets = readonly TradeOfferAsset[];

function normalizeTradeAssets(
  assets: TradeOfferAsset[] | undefined,
  legacyAsset: TradeOfferAsset | undefined
): TradeOfferAsset[] {
  return assets ?? (legacyAsset ? [legacyAsset] : []);
}

function getTradeSideAssets(input: {
  proposerAsset?: TradeOfferAsset;
  proposerAssets?: TradeOfferAsset[];
  recipientAsset?: TradeOfferAsset;
  recipientAssets?: TradeOfferAsset[];
}) {
  return {
    proposerAssets: normalizeTradeAssets(
      input.proposerAssets,
      input.proposerAsset
    ),
    recipientAssets: normalizeTradeAssets(
      input.recipientAssets,
      input.recipientAsset
    ),
  };
}

function nowDate(value?: Date) {
  return value ?? new Date();
}

function addTradeExpiry(sentAt: Date) {
  return new Date(sentAt.getTime() + TRADE_OFFER_EXPIRY_MS);
}

function canonicalTradeAssets(assets: TradeAssets) {
  return [...assets].toSorted((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    return kindOrder || left.assetId.localeCompare(right.assetId);
  });
}

function fingerprintForSend(actorUserId: string, input: TradeOfferSendInput) {
  return normalizeCollectiblePayload({
    actorUserId,
    proposerAssets: canonicalTradeAssets(
      getTradeSideAssets(input).proposerAssets
    ),
    recipientAssets: canonicalTradeAssets(
      getTradeSideAssets(input).recipientAssets
    ),
    recipientUserId: input.recipientUserId,
  });
}

function fingerprintForAction(
  actorUserId: string,
  action: string,
  input: TradeOfferActionInput
) {
  return normalizeCollectiblePayload({
    action,
    actorUserId,
    offerId: input.offerId,
  });
}

function fingerprintForCounter(
  actorUserId: string,
  input: TradeOfferCounterInput,
  recipientUserId: string
) {
  return normalizeCollectiblePayload({
    action: "counteroffer",
    actorUserId,
    offerId: input.offerId,
    proposerAssets: canonicalTradeAssets(
      getTradeSideAssets(input).proposerAssets
    ),
    recipientAssets: canonicalTradeAssets(
      getTradeSideAssets(input).recipientAssets
    ),
    recipientUserId,
  });
}

function termsHash(fingerprint: string) {
  return createHash("sha256").update(fingerprint).digest("hex");
}

function closeIdempotencyKey(idempotencyKey: string) {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return `${idempotencyKey.slice(0, 160)}:${digest.slice(0, 32)}:close`;
}

function assetKey(asset: CollectibleAssetReference) {
  return `${asset.kind}:${asset.assetId}`;
}

function ensureDistinctAssets(assets: readonly CollectibleAssetReference[]) {
  if (assets.length < 2 || assets.length > 100) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "Una oferta debe incluir entre uno y 50 activos por lado."
    );
  }
  const keys = assets.map(({ assetId }) => assetId);
  if (new Set(keys).size !== keys.length) {
    // The ID is globally generated, so a repeated ID with a mismatched kind is
    // still ambiguous and must not reach the custody authority.
    throw new TradeOfferError(
      "DUPLICATE_ASSET",
      "Una oferta no puede repetir el mismo coleccionable."
    );
  }
}

function assertTradeBundleShape(
  proposerAssets: TradeAssets,
  recipientAssets: TradeAssets
) {
  if (
    proposerAssets.length < 1 ||
    proposerAssets.length > 50 ||
    recipientAssets.length < 1 ||
    recipientAssets.length > 50
  ) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "Cada lado debe incluir entre uno y 50 activos exactos."
    );
  }
  ensureDistinctAssets([...proposerAssets, ...recipientAssets]);
}

function resultMetadata(result: TradeOfferResult) {
  return {
    result: {
      expiresAt: result.expiresAt.toISOString(),
      offerId: result.offerId,
      state: result.state,
      termsHash: result.termsHash,
      ...(result.transferredAssetIds
        ? { transferredAssetIds: result.transferredAssetIds }
        : {}),
      version: result.version,
    },
  } satisfies Record<string, unknown>;
}

function tradeMetric(
  metrics: CollectibleMetricSink | undefined,
  name:
    | "custody_conflict"
    | "stale_ownership"
    | "idempotency_conflict"
    | "expiry_backlog"
    | "repeated_cancellation"
    | "rate_limit_decision",
  operation: string
) {
  recordCollectibleMetric(metrics, { name, operation });
}

function resultFromHistory(
  history: typeof tradeOfferHistory.$inferSelect,
  replayed: boolean
): TradeOfferCommandResult {
  const { result } = history.metadata;
  if (!result || typeof result !== "object") {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "El historial de la oferta no contiene un resultado recuperable."
    );
  }
  const value = result as Record<string, unknown>;
  if (
    typeof value.offerId !== "string" ||
    typeof value.state !== "string" ||
    typeof value.termsHash !== "string" ||
    typeof value.version !== "number" ||
    typeof value.expiresAt !== "string"
  ) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "El historial de la oferta no contiene un resultado válido."
    );
  }
  return {
    expiresAt: new Date(value.expiresAt),
    offerId: value.offerId,
    replayed,
    state: value.state as TradeOfferState,
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
  actorUserId: string,
  otherUserId: string,
  now: Date,
  options: { checkInboundPreference?: boolean } = {}
) {
  const ids = [actorUserId, otherUserId].toSorted((left, right) =>
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
    throw new TradeOfferError(
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
  if (accounts.length !== ids.length) {
    throw new TradeOfferError(
      "ACCOUNT_INELIGIBLE",
      "Una de las cuentas no puede participar en intercambios."
    );
  }
  if (
    accounts.some(
      (account) =>
        !account.emailVerified ||
        isUserBanActive(
          { banExpires: account.banExpires, banned: account.banned },
          now
        )
    )
  ) {
    throw new TradeOfferError(
      "ACCOUNT_INELIGIBLE",
      "Una de las cuentas no puede participar en intercambios."
    );
  }

  const blocks = await tx
    .select({ blockerUserId: userBlock.blockerUserId })
    .from(userBlock)
    .where(
      or(
        and(
          eq(userBlock.blockerUserId, actorUserId),
          eq(userBlock.blockedUserId, otherUserId)
        ),
        and(
          eq(userBlock.blockerUserId, otherUserId),
          eq(userBlock.blockedUserId, actorUserId)
        )
      )
    )
    .limit(1);
  if (blocks.length > 0) {
    throw new TradeOfferError(
      "ACCOUNT_BLOCKED",
      "No puedes intercambiar con esta cuenta."
    );
  }

  if (options.checkInboundPreference !== false) {
    const settings = await tx
      .select({ inboundTradesEnabled: profileSettings.inboundTradesEnabled })
      .from(profileSettings)
      .where(eq(profileSettings.userId, otherUserId))
      .limit(1);
    if (settings[0]?.inboundTradesEnabled === false) {
      throw new TradeOfferError(
        "PERMISSION_DENIED",
        "Esta cuenta no acepta ofertas de intercambio."
      );
    }
  }
}

async function lockAssets(
  tx: Transaction,
  assets: readonly CollectibleAssetReference[]
) {
  const cardIds = assets
    .filter(({ kind }) => kind === "card")
    .map(({ assetId }) => assetId)
    .toSorted();
  const packIds = assets
    .filter(({ kind }) => kind === "pack")
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
  asset: TradeOfferAsset,
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
      throw new TradeOfferError(
        "ASSET_NOT_FOUND",
        "La carta indicada no existe."
      );
    }
    if (row.ownerUserId !== ownerUserId) {
      throw new TradeOfferError(
        "OWNERSHIP_CHANGED",
        "Ya no eres propietario de la carta indicada."
      );
    }
    if (row.packInstanceId !== null) {
      throw new TradeOfferError(
        "ASSET_UNAVAILABLE",
        "Una carta dentro de un Pack no puede intercambiarse por separado."
      );
    }
    if (row.binding !== "transferable") {
      throw new TradeOfferError(
        "BINDING_NOT_TRANSFERABLE",
        "Las cartas vinculadas a una cuenta no pueden intercambiarse."
      );
    }
    if (
      row.availability !== "active" ||
      row.lifecycle !== "active" ||
      row.templateAvailability !== "active"
    ) {
      throw new TradeOfferError(
        "ASSET_UNAVAILABLE",
        "La carta no está disponible para intercambiarse."
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
      templateId: packInstance.templateId,
    })
    .from(packInstance)
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .where(eq(packInstance.id, asset.assetId))
    .limit(1);
  if (!row) {
    throw new TradeOfferError("ASSET_NOT_FOUND", "El Pack indicado no existe.");
  }
  if (row.ownerUserId !== ownerUserId) {
    throw new TradeOfferError(
      "OWNERSHIP_CHANGED",
      "Ya no eres propietario del Pack indicado."
    );
  }
  if (row.state !== "unopened") {
    throw new TradeOfferError(
      "ASSET_UNAVAILABLE",
      "Los Packs abiertos no pueden intercambiarse."
    );
  }
  if (row.binding !== "transferable") {
    throw new TradeOfferError(
      "BINDING_NOT_TRANSFERABLE",
      "Los Packs vinculados a una cuenta no pueden intercambiarse."
    );
  }
  if (row.availability !== "active" || row.templateLifecycle === "draft") {
    throw new TradeOfferError(
      "ASSET_UNAVAILABLE",
      "El Pack no está disponible para intercambiarse."
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
    throw new TradeOfferError(
      "ASSET_UNAVAILABLE",
      "La revisión histórica del Pack no está disponible para transferirse."
    );
  }
}

async function lockOffer(tx: Transaction, offerId: string) {
  const [offer] = await tx
    .select()
    .from(tradeOffer)
    .where(eq(tradeOffer.id, offerId))
    .for("update");
  if (!offer) {
    throw new TradeOfferError("OFFER_NOT_FOUND", "La oferta no existe.");
  }
  return offer;
}

async function existingHistory(
  tx: Transaction,
  idempotencyKey: string,
  fingerprint: string,
  metrics?: CollectibleMetricSink,
  operation = "trade.command"
) {
  const [history] = await tx
    .select()
    .from(tradeOfferHistory)
    .where(eq(tradeOfferHistory.idempotencyKey, idempotencyKey))
    .for("update");
  if (!history) {
    return null;
  }
  if (history.fingerprint !== fingerprint) {
    tradeMetric(metrics, "idempotency_conflict", operation);
    throw new TradeOfferError(
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
      | "counteroffer"
      | "expired"
      | "rejected"
      | "sent";
    actorUserId: string;
    fingerprint: string;
    fromState: TradeOfferState | null;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    offerId: string;
    source: string;
    termsHash: string;
    toState: TradeOfferState;
    version: number;
  }
) {
  await tx.insert(tradeOfferHistory).values({
    action: input.action,
    actorUserId: input.actorUserId,
    fingerprint: input.fingerprint,
    fromState: input.fromState,
    id: generateId(),
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
    offerId: input.offerId,
    source: input.source,
    termsHash: input.termsHash,
    toState: input.toState,
    version: input.version,
  });
}

async function sendTradeOfferInTransaction(
  tx: Transaction,
  proposerUserId: string,
  rawInput: TradeOfferSendInput,
  options: {
    historyFingerprint?: string;
    historySource?: string;
    metrics?: CollectibleMetricSink;
    now?: Date;
  } = {}
) {
  const input = tradeOfferSendInputSchema.parse(rawInput);
  const { proposerAssets, recipientAssets } = getTradeSideAssets(input);
  assertTradeBundleShape(proposerAssets, recipientAssets);
  const assets = [...proposerAssets, ...recipientAssets];
  const sentAt = nowDate(options.now);
  const fingerprint = fingerprintForSend(proposerUserId, input);
  const historyFingerprint = options.historyFingerprint ?? fingerprint;
  const historySource = options.historySource ?? "trades.send";
  const hash = termsHash(fingerprint);
  const existing = await tx
    .select()
    .from(tradeOffer)
    .where(eq(tradeOffer.idempotencyKey, input.idempotencyKey))
    .for("update");
  if (existing[0]) {
    if (existing[0].fingerprint !== fingerprint) {
      tradeMetric(options.metrics, "idempotency_conflict", "trade.send");
      throw new TradeOfferError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya fue usada con otros términos."
      );
    }
    const [sentHistory] = await tx
      .select()
      .from(tradeOfferHistory)
      .where(eq(tradeOfferHistory.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (sentHistory) {
      if (sentHistory.fingerprint !== historyFingerprint) {
        tradeMetric(options.metrics, "idempotency_conflict", "trade.send");
        throw new TradeOfferError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya fue usada con otros términos."
        );
      }
      return resultFromHistory(sentHistory, true);
    }
    return {
      expiresAt: existing[0].expiresAt,
      offerId: existing[0].id,
      replayed: true,
      state: existing[0].state as TradeOfferState,
      termsHash: existing[0].termsHash,
      version: existing[0].version,
    } satisfies TradeOfferCommandResult;
  }
  if (proposerUserId === input.recipientUserId) {
    throw new TradeOfferError(
      "SELF_TRADE",
      "No puedes crear una oferta contigo mismo."
    );
  }

  await assertEligibleAccounts(
    tx,
    proposerUserId,
    input.recipientUserId,
    sentAt,
    {
      checkInboundPreference: true,
    }
  );
  await lockAssets(tx, assets);
  for (const asset of proposerAssets) {
    await assertTransferableAsset(tx, asset, proposerUserId);
  }
  for (const asset of recipientAssets) {
    await assertTransferableAsset(tx, asset, input.recipientUserId);
  }
  try {
    await assertNoActiveCollectibleCustody(tx, assets);
  } catch (error) {
    tradeMetric(options.metrics, "custody_conflict", "trade.send");
    throw error;
  }

  const expiresAt = addTradeExpiry(sentAt);
  const offerId = generateId();
  await tx.insert(tradeOffer).values({
    actorUserId: proposerUserId,
    expiresAt,
    fingerprint,
    id: offerId,
    idempotencyKey: input.idempotencyKey,
    proposerConfirmedAt: sentAt,
    proposerUserId,
    recipientUserId: input.recipientUserId,
    sentAt,
    source: "trades.send",
    state: "sent",
    termsHash: hash,
    version: 1,
  });
  await createCollectibleCustody(tx, {
    acquiredAt: sentAt,
    assets: [
      ...canonicalTradeAssets(proposerAssets).map((asset) => ({
        asset,
        side: "proposer" as const,
      })),
      ...canonicalTradeAssets(recipientAssets).map((asset) => ({
        asset,
        side: "recipient" as const,
      })),
    ],
    tradeOfferId: offerId,
  });
  await appendHistory(tx, {
    action: "sent",
    actorUserId: proposerUserId,
    fingerprint: historyFingerprint,
    fromState: null,
    idempotencyKey: input.idempotencyKey,
    metadata: resultMetadata({
      expiresAt,
      offerId,
      state: "sent",
      termsHash: hash,
      version: 1,
    }),
    offerId,
    source: historySource,
    termsHash: hash,
    toState: "sent",
    version: 1,
  });

  return {
    expiresAt,
    offerId,
    replayed: false,
    state: "sent" as const,
    termsHash: hash,
    version: 1,
  } satisfies TradeOfferCommandResult;
}

/** Draft composition is browser-only; this command creates custody only when sent. */
export async function sendTradeOffer(
  db: Database,
  proposerUserId: string,
  rawInput: TradeOfferSendInput & {
    metrics?: CollectibleMetricSink;
    now?: Date;
    impersonated?: boolean;
  }
): Promise<TradeOfferCommandResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  const {
    impersonated: _impersonated,
    metrics: _metrics,
    now: _now,
    ...contractInput
  } = rawInput;
  const input = tradeOfferSendInputSchema.parse(contractInput);
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`collectible-trade-send:${input.idempotencyKey}`)
        );
        return sendTradeOfferInTransaction(tx, proposerUserId, input, {
          now: rawInput.now,
          metrics: rawInput.metrics,
        });
      }),
    { metrics: rawInput.metrics, operation: "trade.send" }
  );
  if (!result.replayed) {
    await deliverTradeNotification(db, {
      actorUserId: proposerUserId,
      kind: "sent",
      offerId: result.offerId,
      recipientUserId: input.recipientUserId,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export async function updateInboundTradePreference(
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
        const existingSettings = await tx
          .select({ userId: profileSettings.userId })
          .from(profileSettings)
          .where(eq(profileSettings.userId, userId))
          .limit(1);
        if (existingSettings.length === 0) {
          await tx.insert(profileSettings).values({ userId });
        }
        const [settings] = await tx
          .update(profileSettings)
          .set({ inboundTradesEnabled: enabled })
          .where(eq(profileSettings.userId, userId))
          .returning({
            inboundTradesEnabled: profileSettings.inboundTradesEnabled,
          });
        if (!settings) {
          throw new Error("No se pudo guardar la preferencia de intercambios.");
        }
        const closedOfferIds: string[] = [];
        if (!enabled) {
          const offers = await tx
            .select()
            .from(tradeOffer)
            .where(
              and(
                eq(tradeOffer.recipientUserId, userId),
                eq(tradeOffer.state, "sent")
              )
            )
            .orderBy(asc(tradeOffer.id))
            .for("update");
          for (const offer of offers) {
            const closed = await closeSentTradeOfferInTransaction(
              tx,
              offer,
              userId,
              "cancelled",
              "La cuenta destinataria desactivó las ofertas entrantes.",
              `trade-preference:${userId}:${offer.id}`,
              now,
              options.metrics
            );
            if (!closed.replayed) {
              closedOfferIds.push(offer.id);
            }
          }
        }
        return {
          closedOfferIds,
          inboundTradesEnabled: settings.inboundTradesEnabled,
        };
      }),
    { metrics: options.metrics, operation: "trade.preference" }
  );
  for (const offerId of result.closedOfferIds) {
    await deliverTradeNotification(db, {
      actorUserId: userId,
      kind: "cancelled",
      offerId,
      state: "cancelled",
    }).catch(() => null);
  }
  return {
    closedOfferIds: result.closedOfferIds,
    inboundTradesEnabled: result.inboundTradesEnabled,
  };
}

export const setInboundTradePreference = updateInboundTradePreference;

export async function blockTradeUser(
  db: Database,
  blockerUserId: string,
  blockedUserId: string,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  if (blockerUserId === blockedUserId) {
    throw new TradeOfferError(
      "SELF_TRADE",
      "No puedes bloquear tu propia cuenta."
    );
  }
  const now = nowDate(options.now);
  const result = await db.transaction(async (tx) => {
    // Gift/trade sends lock these same participant rows before checking the
    // canonical block relation. Serializing the pair closes the race where a
    // send could otherwise commit between block creation and offer cleanup.
    const participantIds = [blockerUserId, blockedUserId].toSorted(
      (left, right) => left.localeCompare(right)
    );
    await tx
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, participantIds))
      .orderBy(asc(user.id))
      .for("update");
    const [existing] = await tx
      .select({ blockerUserId: userBlock.blockerUserId })
      .from(userBlock)
      .where(
        and(
          eq(userBlock.blockerUserId, blockerUserId),
          eq(userBlock.blockedUserId, blockedUserId)
        )
      )
      .limit(1);
    if (!existing) {
      await tx.insert(userBlock).values({
        blockedUserId,
        blockerUserId,
      });
    }
    const offers = await tx
      .select()
      .from(tradeOffer)
      .where(
        and(
          eq(tradeOffer.state, "sent"),
          or(
            and(
              eq(tradeOffer.proposerUserId, blockerUserId),
              eq(tradeOffer.recipientUserId, blockedUserId)
            ),
            and(
              eq(tradeOffer.proposerUserId, blockedUserId),
              eq(tradeOffer.recipientUserId, blockerUserId)
            )
          )
        )
      )
      .orderBy(asc(tradeOffer.id))
      .for("update");
    const closedOfferIds: string[] = [];
    for (const offer of offers) {
      const closed = await closeSentTradeOfferInTransaction(
        tx,
        offer,
        blockerUserId,
        "administratively-cancelled",
        "La oferta se cerró porque una de las cuentas bloqueó a la otra.",
        `trade-block:${blockerUserId}:${blockedUserId}:${offer.id}`,
        now,
        options.metrics
      );
      if (!closed.replayed) {
        closedOfferIds.push(offer.id);
      }
    }
    const closedGiftIds = await closeGiftOffersForBlockInTransaction(
      tx,
      blockerUserId,
      blockedUserId,
      now,
      options.metrics
    );
    return { closedGiftIds, closedOfferIds };
  });
  for (const offerId of result.closedOfferIds) {
    await deliverTradeNotification(db, {
      actorUserId: blockerUserId,
      kind: "administratively-cancelled",
      offerId,
      state: "administratively-cancelled",
    }).catch(() => null);
  }
  for (const giftId of result.closedGiftIds) {
    await notifyGiftOfferParticipants(db, {
      actorUserId: blockerUserId,
      giftId,
      kind: "administratively-cancelled",
      state: "administratively-cancelled",
    }).catch(() => null);
  }
  return { blocked: true, closedOfferIds: result.closedOfferIds };
}

export async function unblockTradeUser(
  db: Database,
  blockerUserId: string,
  blockedUserId: string
) {
  await db
    .delete(userBlock)
    .where(
      and(
        eq(userBlock.blockerUserId, blockerUserId),
        eq(userBlock.blockedUserId, blockedUserId)
      )
    );
  return { blocked: false };
}

export function listTradeUserBlocks(db: Database, blockerUserId: string) {
  return db
    .select({
      blockedUserId: userBlock.blockedUserId,
      createdAt: userBlock.createdAt,
    })
    .from(userBlock)
    .where(eq(userBlock.blockerUserId, blockerUserId))
    .orderBy(asc(userBlock.createdAt), asc(userBlock.blockedUserId));
}

export const blockUser = blockTradeUser;
export const unblockUser = unblockTradeUser;

function sqlAdvisoryLock(key: string) {
  // Kept as a tiny adapter so every trade command serializes matching retries
  // before touching its first authoritative row.
  return sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

type TerminalAction = "accept" | "cancel" | "reject" | "expire";

async function transitionTradeOfferInTransaction(
  tx: Transaction,
  actorUserId: string,
  rawInput: TradeOfferActionInput,
  action: TerminalAction,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  const input = tradeOfferActionInputSchema.parse(rawInput);
  const fingerprint = fingerprintForAction(actorUserId, action, input);
  const existing = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    options.metrics,
    `trade.${action}`
  );
  if (existing) {
    return existing;
  }

  const initialOffer = await lockOffer(tx, input.offerId);
  const replayAfterLock = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    options.metrics,
    `trade.${action}`
  );
  if (replayAfterLock) {
    return replayAfterLock;
  }
  if (
    action !== "expire" &&
    actorUserId !== initialOffer.proposerUserId &&
    actorUserId !== initialOffer.recipientUserId
  ) {
    throw new TradeOfferError(
      "PERMISSION_DENIED",
      "No participas en esta oferta."
    );
  }
  const custody = await listTradeOfferCustody(tx, input.offerId);
  const assets: CollectibleAssetReference[] = custody.map((row) =>
    row.cardInstanceId
      ? { assetId: row.cardInstanceId, kind: "card" as const }
      : { assetId: row.packInstanceId!, kind: "pack" as const }
  );
  ensureDistinctAssets(assets);
  const proposerAssets = custody
    .filter(({ side }) => side === "proposer")
    .map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    );
  const recipientAssets = custody
    .filter(({ side }) => side === "recipient")
    .map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    );
  if (proposerAssets.length === 0 || recipientAssets.length === 0) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "La oferta debe contener al menos un activo por lado."
    );
  }
  if (proposerAssets.length > 50 || recipientAssets.length > 50) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "Cada lado puede incluir como máximo 50 activos."
    );
  }

  const now = nowDate(options.now);
  if (action === "accept" && now < initialOffer.expiresAt) {
    const proposerUserId = sentTradeParticipant(initialOffer.proposerUserId);
    const recipientUserId = sentTradeParticipant(initialOffer.recipientUserId);
    await assertEligibleAccounts(tx, proposerUserId, recipientUserId, now, {
      checkInboundPreference: false,
    });
  }
  await lockAssets(tx, assets);
  const offer = initialOffer;
  if (offer.state !== "sent") {
    throw new TradeOfferError(
      "OFFER_TERMINAL",
      "La oferta ya alcanzó un estado terminal."
    );
  }
  const activeCustody = await findActiveCollectibleCustody(tx, assets);
  if (activeCustody.length !== assets.length) {
    tradeMetric(options.metrics, "custody_conflict", `trade.${action}`);
    throw new TradeOfferError(
      "ACTIVE_CUSTODY",
      "Uno de los activos está reservado por otra operación."
    );
  }
  await lockActiveCollectibleCustody(tx, assets);
  if (action === "accept" && actorUserId !== offer.recipientUserId) {
    throw new TradeOfferError(
      "PERMISSION_DENIED",
      "Solo la persona destinataria puede aceptar la oferta."
    );
  }
  if (action === "reject" && actorUserId !== offer.recipientUserId) {
    throw new TradeOfferError(
      "PERMISSION_DENIED",
      "Solo la persona destinataria puede rechazar la oferta."
    );
  }
  if (action === "cancel" && actorUserId !== offer.proposerUserId) {
    throw new TradeOfferError(
      "PERMISSION_DENIED",
      "Solo la persona proponente puede cancelar la oferta."
    );
  }

  if (now >= offer.expiresAt && action !== "expire") {
    const expiredResult = await finalizeTradeOffer(
      tx,
      offer,
      actorUserId,
      "expire",
      "expired",
      "La oferta expiró después de siete días.",
      fingerprint,
      input.idempotencyKey,
      now,
      options.metrics
    );
    return expiredResult;
  }
  if (action === "expire" || now >= offer.expiresAt) {
    return finalizeTradeOffer(
      tx,
      offer,
      actorUserId,
      "expire",
      "expired",
      "La oferta expiró después de siete días.",
      fingerprint,
      input.idempotencyKey,
      now,
      options.metrics
    );
  }

  if (action === "accept") {
    return acceptLockedTradeOffer(
      tx,
      offer,
      custody,
      actorUserId,
      fingerprint,
      input.idempotencyKey,
      now,
      options.metrics
    );
  }
  return finalizeTradeOffer(
    tx,
    offer,
    actorUserId,
    action,
    action === "reject" ? "rejected" : "cancelled",
    action === "reject"
      ? "La oferta fue rechazada."
      : "La oferta fue cancelada.",
    fingerprint,
    input.idempotencyKey,
    now,
    options.metrics
  );
}

async function finalizeTradeOffer(
  tx: Transaction,
  offer: typeof tradeOffer.$inferSelect,
  actorUserId: string,
  action: TerminalAction,
  state: TradeOfferState,
  reason: string,
  fingerprint: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  if (offer.state !== "sent") {
    tradeMetric(metrics, "repeated_cancellation", `trade.${action}`);
    throw new TradeOfferError(
      "OFFER_TERMINAL",
      "La oferta ya alcanzó un estado terminal."
    );
  }
  const version = offer.version + 1;
  await releaseCollectibleCustody(tx, offer.id, state);
  await tx
    .update(tradeOffer)
    .set({
      state,
      terminalAt: now,
      terminalReason: reason,
      updatedAt: now,
      version,
    })
    .where(and(eq(tradeOffer.id, offer.id), eq(tradeOffer.state, "sent")));
  const result = {
    expiresAt: offer.expiresAt,
    offerId: offer.id,
    replayed: false,
    state,
    termsHash: offer.termsHash,
    version,
  } satisfies TradeOfferCommandResult;
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
    idempotencyKey,
    metadata: resultMetadata(result),
    offerId: offer.id,
    source: `trades.${action}`,
    termsHash: offer.termsHash,
    toState: state,
    version,
  });
  return result;
}

export async function closeSentTradeOfferInTransaction(
  tx: Transaction,
  offer: typeof tradeOffer.$inferSelect,
  actorUserId: string,
  state: "cancelled" | "administratively-cancelled",
  reason: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  const fingerprint = normalizeCollectiblePayload({
    action: state,
    actorUserId,
    offerId: offer.id,
  });
  const replay = await existingHistory(
    tx,
    idempotencyKey,
    fingerprint,
    metrics,
    `trade.${state}`
  );
  if (replay) {
    return replay;
  }
  if (offer.state !== "sent") {
    tradeMetric(metrics, "repeated_cancellation", `trade.${state}`);
    return {
      expiresAt: offer.expiresAt,
      offerId: offer.id,
      replayed: true,
      state: offer.state as TradeOfferState,
      termsHash: offer.termsHash,
      version: offer.version,
    } satisfies TradeOfferCommandResult;
  }
  const custody = await listTradeOfferCustody(tx, offer.id);
  const assets = custody.map((row) =>
    row.cardInstanceId
      ? { assetId: row.cardInstanceId, kind: "card" as const }
      : { assetId: row.packInstanceId!, kind: "pack" as const }
  );
  if (assets.length > 0) {
    await lockAssets(tx, assets);
    await lockActiveCollectibleCustody(tx, assets);
  }
  return finalizeTradeOffer(
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

async function acceptLockedTradeOffer(
  tx: Transaction,
  offer: typeof tradeOffer.$inferSelect,
  custody: Awaited<ReturnType<typeof listTradeOfferCustody>>,
  actorUserId: string,
  fingerprint: string,
  idempotencyKey: string,
  now: Date,
  metrics?: CollectibleMetricSink
) {
  const proposerUserId = sentTradeParticipant(offer.proposerUserId);
  const recipientUserId = sentTradeParticipant(offer.recipientUserId);
  const proposerRows = custody.filter(({ side }) => side === "proposer");
  const recipientRows = custody.filter(({ side }) => side === "recipient");
  if (proposerRows.length === 0 || recipientRows.length === 0) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "La oferta debe contener al menos un activo por lado."
    );
  }
  if (proposerRows.length > 50 || recipientRows.length > 50) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "Cada lado puede incluir como máximo 50 activos."
    );
  }
  try {
    for (const asset of proposerRows.map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    )) {
      await assertTransferableAsset(tx, asset, proposerUserId);
    }
    for (const asset of recipientRows.map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    )) {
      await assertTransferableAsset(tx, asset, recipientUserId);
    }
  } catch (error) {
    if (
      error instanceof TradeOfferError &&
      (error.code === "OWNERSHIP_CHANGED" || error.code === "ASSET_UNAVAILABLE")
    ) {
      tradeMetric(metrics, "stale_ownership", "trade.accept");
    }
    throw error;
  }

  const transferredAssetIds: string[] = [];
  for (const [sideRows, fromUserId, toUserId, side] of [
    [proposerRows, proposerUserId, recipientUserId, "proposer"],
    [recipientRows, recipientUserId, proposerUserId, "recipient"],
  ] as const) {
    for (const row of sideRows) {
      const asset = row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const };
      try {
        await transferCollectibleAssetOwner(
          tx,
          asset,
          fromUserId,
          toUserId,
          now
        );
      } catch (error) {
        tradeMetric(metrics, "stale_ownership", "trade.accept");
        throw error;
      }
      transferredAssetIds.push(asset.assetId);
      await appendCollectibleOwnershipEvent(tx, {
        actorUserId,
        cardInstanceId: asset.kind === "card" ? asset.assetId : undefined,
        fromUserId,
        kind: "trade",
        metadata: {
          offerId: offer.id,
          side,
        },
        packInstanceId: asset.kind === "pack" ? asset.assetId : undefined,
        sourceReference: offer.id,
        sourceType: "trade.accept",
        toUserId,
      });
    }
  }
  await releaseCollectibleCustody(tx, offer.id, "accepted", now);
  const version = offer.version + 1;
  await tx
    .update(tradeOffer)
    .set({
      state: "accepted",
      terminalAt: now,
      terminalReason: "La oferta fue aceptada.",
      updatedAt: now,
      version,
    })
    .where(and(eq(tradeOffer.id, offer.id), eq(tradeOffer.state, "sent")));
  const result = {
    expiresAt: offer.expiresAt,
    offerId: offer.id,
    replayed: false,
    state: "accepted" as const,
    termsHash: offer.termsHash,
    transferredAssetIds,
    version,
  } satisfies TradeOfferCommandResult;
  await appendHistory(tx, {
    action: "accepted",
    actorUserId,
    fingerprint,
    fromState: "sent",
    idempotencyKey,
    metadata: resultMetadata(result),
    offerId: offer.id,
    source: "trades.accept",
    termsHash: offer.termsHash,
    toState: "accepted",
    version,
  });
  return result;
}

async function runTradeTransition(
  db: Database,
  actorUserId: string,
  input: TradeOfferActionInput,
  action: TerminalAction,
  options: {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
    skipGate?: boolean;
  } = {}
) {
  if (!options.skipGate) {
    assertCollectiblesMutationAllowed({ impersonated: options.impersonated });
  }
  const parsed = tradeOfferActionInputSchema.parse({
    idempotencyKey: input.idempotencyKey,
    offerId: input.offerId,
  });
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction((tx) =>
        tx
          .execute(
            sqlAdvisoryLock(
              `collectible-trade-${action}:${parsed.idempotencyKey}`
            )
          )
          .then(() =>
            transitionTradeOfferInTransaction(tx, actorUserId, parsed, action, {
              metrics: options.metrics,
              now: options.now,
            })
          )
      ),
    { metrics: options.metrics, operation: `trade.${action}` }
  );
  if (!result.replayed) {
    await deliverTradeNotification(db, {
      actorUserId,
      kind: result.state,
      offerId: result.offerId,
      recipientUserId: undefined,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export function acceptTradeOffer(
  db: Database,
  actorUserId: string,
  input: TradeOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runTradeTransition(db, actorUserId, input, "accept", input);
}

export function rejectTradeOffer(
  db: Database,
  actorUserId: string,
  input: TradeOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runTradeTransition(db, actorUserId, input, "reject", input);
}

export function cancelTradeOffer(
  db: Database,
  actorUserId: string,
  input: TradeOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  return runTradeTransition(db, actorUserId, input, "cancel", input);
}

export type AdministrativeTradeCancellationInput = {
  expectedVersion: number;
  idempotencyKey: string;
  impersonated?: boolean;
  metrics?: CollectibleMetricSink;
  now?: Date;
  offerId: string;
  reason: string;
};

/** Owner/moderation-only closure; it never transfers ownership or posts Eteris. */
export async function administrativelyCancelTradeOffer(
  db: Database,
  actorUserId: string,
  input: AdministrativeTradeCancellationInput
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new TradeOfferError(
      "STALE_VERSION",
      "Confirma la versión actual antes de cerrar la oferta."
    );
  }
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`collectible-trade-admin:${input.idempotencyKey}`)
        );
        const offer = await lockOffer(tx, input.offerId);
        const fingerprint = normalizeCollectiblePayload({
          action: "administratively-cancelled",
          actorUserId,
          offerId: offer.id,
        });
        const replay = await existingHistory(
          tx,
          input.idempotencyKey,
          fingerprint,
          input.metrics,
          "trade.administrative-cancel"
        );
        if (replay) {
          return replay;
        }
        if (offer.version !== input.expectedVersion) {
          throw new TradeOfferError(
            "STALE_VERSION",
            "La oferta cambió. Recarga antes de continuar."
          );
        }
        return closeSentTradeOfferInTransaction(
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
    { metrics: input.metrics, operation: "trade.administrative-cancel" }
  );
  if (!result.replayed) {
    await deliverTradeNotification(db, {
      actorUserId,
      kind: result.state,
      offerId: result.offerId,
      recipientUserId: undefined,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export function expireTradeOffer(
  db: Database,
  actorUserId: string,
  input: TradeOfferActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
    skipGate?: boolean;
  }
) {
  return runTradeTransition(db, actorUserId, input, "expire", input);
}

export type TradeExpiryBatchResult = {
  checked: number;
  expired: number;
  offerIds: string[];
  participantUserIds: string[];
};

/**
 * Scheduled and lazy reads both enter expiry through expireTradeOffer. The
 * batch only discovers bounded IDs; custody release and terminal history stay
 * in the same idempotent transition as an interactive command.
 */
export async function expireCollectibleTradeOffersBatch(
  db: Database,
  options: {
    limit?: number;
    metrics?: CollectibleMetricSink;
    now?: Date;
  } = {}
): Promise<TradeExpiryBatchResult> {
  const now = nowDate(options.now);
  const limit = Math.max(1, Math.min(200, options.limit ?? 100));
  const candidates = await db
    .select({
      expiresAt: tradeOffer.expiresAt,
      id: tradeOffer.id,
      proposerUserId: tradeOffer.proposerUserId,
      recipientUserId: tradeOffer.recipientUserId,
    })
    .from(tradeOffer)
    .where(and(eq(tradeOffer.state, "sent"), lte(tradeOffer.expiresAt, now)))
    .orderBy(asc(tradeOffer.expiresAt), asc(tradeOffer.id))
    .limit(limit);
  if (candidates.length === limit) {
    tradeMetric(options.metrics, "expiry_backlog", "trade.expiry.batch");
  }
  const expiredOfferIds: string[] = [];
  const participantUserIds = new Set<string>();
  for (const candidate of candidates) {
    const proposerUserId = sentTradeParticipant(candidate.proposerUserId);
    const recipientUserId = sentTradeParticipant(candidate.recipientUserId);
    const result = await expireTradeOffer(db, proposerUserId, {
      idempotencyKey: `trade-expiry:${candidate.id}:${candidate.expiresAt.toISOString()}`,
      metrics: options.metrics,
      now,
      offerId: candidate.id,
      skipGate: true,
    });
    if (!result.replayed && result.state === "expired") {
      expiredOfferIds.push(candidate.id);
      participantUserIds.add(proposerUserId);
      participantUserIds.add(recipientUserId);
    }
  }
  return {
    checked: candidates.length,
    expired: expiredOfferIds.length,
    offerIds: expiredOfferIds,
    participantUserIds: [...participantUserIds].toSorted(),
  };
}

export const expireTradeOffersBatch = expireCollectibleTradeOffersBatch;

type CounterOfferCommandResult = TradeOfferCommandResult & {
  previousOfferId: string;
  previousState: "cancelled" | "rejected";
};

/** A counteroffer is always a fresh proposer confirmation and fresh custody. */
async function counterOfferInTransaction(
  tx: Transaction,
  actorUserId: string,
  input: TradeOfferCounterInput,
  now: Date,
  metrics?: CollectibleMetricSink
): Promise<CounterOfferCommandResult> {
  const initialOffer = await lockOffer(tx, input.offerId);
  if (
    actorUserId !== initialOffer.proposerUserId &&
    actorUserId !== initialOffer.recipientUserId
  ) {
    throw new TradeOfferError(
      "PERMISSION_DENIED",
      "No participas en esta oferta."
    );
  }
  const recipientUserId =
    actorUserId === initialOffer.recipientUserId
      ? initialOffer.proposerUserId
      : initialOffer.recipientUserId;
  const openRecipientUserId = sentTradeParticipant(recipientUserId);
  const previousState =
    actorUserId === initialOffer.recipientUserId ? "rejected" : "cancelled";
  const fingerprint = fingerprintForCounter(
    actorUserId,
    input,
    openRecipientUserId
  );
  const existing = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    metrics,
    "trade.counter"
  );
  if (existing) {
    return {
      ...existing,
      previousOfferId: input.offerId,
      previousState,
    };
  }

  const previousCustody = await listTradeOfferCustody(tx, input.offerId);
  const previousAssets = previousCustody.map((row) =>
    row.cardInstanceId
      ? { assetId: row.cardInstanceId, kind: "card" as const }
      : { assetId: row.packInstanceId!, kind: "pack" as const }
  );
  ensureDistinctAssets(previousAssets);
  const previousProposerAssets = previousCustody
    .filter(({ side }) => side === "proposer")
    .map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    );
  const previousRecipientAssets = previousCustody
    .filter(({ side }) => side === "recipient")
    .map((row) =>
      row.cardInstanceId
        ? { assetId: row.cardInstanceId, kind: "card" as const }
        : { assetId: row.packInstanceId!, kind: "pack" as const }
    );
  if (
    previousProposerAssets.length === 0 ||
    previousRecipientAssets.length === 0 ||
    previousProposerAssets.length > 50 ||
    previousRecipientAssets.length > 50
  ) {
    throw new TradeOfferError(
      "INVALID_TERMS",
      "La oferta anterior no contiene una cantidad válida de activos por lado."
    );
  }

  await assertEligibleAccounts(tx, actorUserId, openRecipientUserId, now, {
    checkInboundPreference: true,
  });
  const { proposerAssets, recipientAssets } = getTradeSideAssets(input);
  assertTradeBundleShape(proposerAssets, recipientAssets);
  await lockAssets(tx, [
    ...previousAssets,
    ...proposerAssets,
    ...recipientAssets,
  ]);
  const offer = initialOffer;
  const replayAfterLocks = await existingHistory(
    tx,
    input.idempotencyKey,
    fingerprint,
    metrics,
    "trade.counter"
  );
  if (replayAfterLocks) {
    return {
      ...replayAfterLocks,
      previousOfferId: input.offerId,
      previousState,
    };
  }
  if (offer.state !== "sent") {
    throw new TradeOfferError(
      "OFFER_TERMINAL",
      "La oferta ya alcanzó un estado terminal."
    );
  }
  const activeCustody = await findActiveCollectibleCustody(tx, previousAssets);
  if (activeCustody.length !== previousAssets.length) {
    throw new TradeOfferError(
      "ACTIVE_CUSTODY",
      "Uno de los activos de la oferta anterior ya no está reservado."
    );
  }
  await lockActiveCollectibleCustody(tx, previousAssets);

  const closeKey = closeIdempotencyKey(input.idempotencyKey);
  const closeFingerprint = fingerprintForAction(
    actorUserId,
    previousState === "rejected" ? "reject" : "cancel",
    {
      idempotencyKey: closeKey,
      offerId: input.offerId,
    }
  );
  await finalizeTradeOffer(
    tx,
    offer,
    actorUserId,
    previousState === "rejected" ? "reject" : "cancel",
    previousState,
    previousState === "rejected"
      ? "La oferta fue reemplazada por una contraoferta."
      : "La oferta fue reemplazada por una contraoferta.",
    closeFingerprint,
    closeKey,
    now,
    metrics
  );

  const next = await sendTradeOfferInTransaction(
    tx,
    actorUserId,
    {
      idempotencyKey: input.idempotencyKey,
      proposerAssets,
      recipientAssets,
      recipientUserId: openRecipientUserId,
    },
    {
      historyFingerprint: fingerprint,
      historySource: "trades.counteroffer",
      metrics,
      now,
    }
  );
  return { ...next, previousOfferId: input.offerId, previousState };
}

export async function counterOfferTradeOffer(
  db: Database,
  actorUserId: string,
  rawInput: TradeOfferCounterInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  const {
    impersonated: _impersonated,
    metrics: _metrics,
    now: _now,
    ...contractInput
  } = rawInput;
  const input = tradeOfferCounterInputSchema.parse(contractInput);
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`collectible-trade-counter:${input.idempotencyKey}`)
        );
        return counterOfferInTransaction(
          tx,
          actorUserId,
          input,
          nowDate(rawInput.now),
          rawInput.metrics
        );
      }),
    { metrics: rawInput.metrics, operation: "trade.counteroffer" }
  );
  if (!result.replayed) {
    await deliverTradeNotification(db, {
      actorUserId,
      kind: result.previousState,
      offerId: result.previousOfferId,
      state: result.previousState,
    }).catch(() => null);
    await deliverTradeNotification(db, {
      actorUserId,
      kind: "sent",
      offerId: result.offerId,
      state: result.state,
    }).catch(() => null);
  }
  const { previousState: _previousState, ...publicResult } = result;
  return publicResult;
}

export async function getTradeOffer(
  db: Database,
  viewerUserId: string,
  offerId: string,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<TradeOfferDetail | null> {
  let [offer] = await db
    .select()
    .from(tradeOffer)
    .where(
      and(
        eq(tradeOffer.id, offerId),
        or(
          eq(tradeOffer.proposerUserId, viewerUserId),
          eq(tradeOffer.recipientUserId, viewerUserId)
        )
      )
    )
    .limit(1);
  if (!offer) {
    return null;
  }
  const now = nowDate(options.now);
  if (offer.state === "sent" && now >= offer.expiresAt) {
    await expireTradeOffer(db, sentTradeParticipant(offer.proposerUserId), {
      idempotencyKey: `trade-expiry:${offer.id}:${offer.expiresAt.toISOString()}`,
      metrics: options.metrics,
      now,
      offerId: offer.id,
      skipGate: true,
    });
    [offer] = await db
      .select()
      .from(tradeOffer)
      .where(
        and(
          eq(tradeOffer.id, offerId),
          or(
            eq(tradeOffer.proposerUserId, viewerUserId),
            eq(tradeOffer.recipientUserId, viewerUserId)
          )
        )
      )
      .limit(1);
    if (!offer) {
      return null;
    }
  }
  const [custody, history] = await Promise.all([
    listTradeOfferCustody(db, offer.id),
    db
      .select()
      .from(tradeOfferHistory)
      .where(eq(tradeOfferHistory.offerId, offer.id))
      .orderBy(asc(tradeOfferHistory.createdAt), asc(tradeOfferHistory.id)),
  ]);
  return {
    assets: custody.map((row) => ({
      assetId: row.cardInstanceId ?? row.packInstanceId!,
      kind: row.cardInstanceId ? ("card" as const) : ("pack" as const),
      side: row.side,
    })),
    expiresAt: offer.expiresAt,
    counterpartyUserId:
      offer.proposerUserId === viewerUserId
        ? (offer.recipientUserId ?? "closed-account")
        : (offer.proposerUserId ?? "closed-account"),
    history: history.map((row) => ({
      action: row.action,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      fromState: row.fromState as TradeOfferState | null,
      id: row.id,
      toState: row.toState as TradeOfferState,
      version: row.version,
    })),
    offerId: offer.id,
    proposerUserId: offer.proposerUserId ?? "closed-account",
    recipientUserId: offer.recipientUserId ?? "closed-account",
    sentAt: offer.sentAt,
    state: offer.state as TradeOfferState,
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

export async function listTradeOffers(
  db: Database,
  viewerUserId: string,
  rawInput: Omit<TradeOfferListInput, "limit"> & { limit?: number } = {},
  role: "inbox" | "sent" | "all" = "all"
) {
  const input = tradeOfferListInputSchema.parse(rawInput);
  await expireCollectibleTradeOffersBatch(db);
  const cursor = decodeCursor(input.cursor);
  const participantCondition =
    role === "inbox"
      ? eq(tradeOffer.recipientUserId, viewerUserId)
      : role === "sent"
        ? eq(tradeOffer.proposerUserId, viewerUserId)
        : or(
            eq(tradeOffer.proposerUserId, viewerUserId),
            eq(tradeOffer.recipientUserId, viewerUserId)
          );
  const rows = await db
    .select({
      expiresAt: tradeOffer.expiresAt,
      id: tradeOffer.id,
      proposerUserId: tradeOffer.proposerUserId,
      recipientUserId: tradeOffer.recipientUserId,
      sentAt: tradeOffer.sentAt,
      state: tradeOffer.state,
      version: tradeOffer.version,
    })
    .from(tradeOffer)
    .where(
      and(
        participantCondition,
        input.state ? eq(tradeOffer.state, input.state) : undefined,
        cursor
          ? or(
              lt(tradeOffer.sentAt, cursor.sentAt),
              and(
                eq(tradeOffer.sentAt, cursor.sentAt),
                lt(tradeOffer.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(tradeOffer.sentAt), desc(tradeOffer.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const counts = new Map<string, { proposer: number; recipient: number }>();
  if (page.length > 0) {
    const custodyCounts = await db
      .select({
        count: sql<number>`count(*)::integer`,
        offerId: collectibleCustody.tradeOfferId,
        side: collectibleCustody.side,
      })
      .from(collectibleCustody)
      .where(
        inArray(
          collectibleCustody.tradeOfferId,
          page.map(({ id }) => id)
        )
      )
      .groupBy(collectibleCustody.tradeOfferId, collectibleCustody.side);
    for (const row of custodyCounts) {
      if (!row.offerId) {
        continue;
      }
      const current = counts.get(row.offerId) ?? { proposer: 0, recipient: 0 };
      if (row.side === "proposer") {
        current.proposer = row.count;
      } else {
        current.recipient = row.count;
      }
      counts.set(row.offerId, current);
    }
  }
  const items = page.map((item) => {
    const count = counts.get(item.id) ?? { proposer: 0, recipient: 0 };
    return {
      ...item,
      assetCount: count.proposer + count.recipient,
      proposerAssetCount: count.proposer,
      recipientAssetCount: count.recipient,
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? `${last.sentAt.toISOString()}|${last.id}`
        : null,
  };
}

export async function listEligibleTradeAssets(db: Database, userId: string) {
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
  const assets = [...cards, ...packs].filter(Boolean);
  const active = await findActiveCollectibleCustody(
    db,
    assets.map(({ assetId, kind }) => ({ assetId, kind }))
  );
  const activeKeys = new Set(active.map(assetKey));
  return assets.filter(
    ({ assetId, kind }) => !activeKeys.has(`${kind}:${assetId}`)
  );
}

async function deliverTradeNotification(
  db: Database,
  input: {
    actorUserId: string;
    kind: string;
    offerId: string;
    recipientUserId?: string;
    state: string;
  }
) {
  const [offer] = await db
    .select({
      proposerUserId: tradeOffer.proposerUserId,
      recipientUserId: tradeOffer.recipientUserId,
    })
    .from(tradeOffer)
    .where(eq(tradeOffer.id, input.offerId))
    .limit(1);
  if (!offer) {
    return;
  }
  const targets =
    input.kind === "sent"
      ? [offer.recipientUserId]
      : [offer.proposerUserId, offer.recipientUserId];
  await Promise.all(
    [...new Set(targets)]
      .filter((targetUserId): targetUserId is string => Boolean(targetUserId))
      .filter((target) => target !== input.actorUserId)
      .map((targetUserId) =>
        createUserNotification(db, {
          dedupeKey: `collectible-trade:${input.offerId}:${input.state}:${targetUserId}`,
          description:
            input.kind === "sent"
              ? "Tienes una nueva oferta de intercambio de coleccionables."
              : `La oferta de intercambio terminó como «${input.state}».`,
          metadata: {
            category: "collectible_trade",
            linkPath: `/cards/trades/${input.offerId}`,
            offerId: input.offerId,
            state: input.state,
          },
          sourceUserId: input.actorUserId,
          targetUserId,
          title:
            input.kind === "sent"
              ? "Nueva oferta de intercambio"
              : "Actualización de tu intercambio",
        })
      )
  );
}

export const createTradeOffer = sendTradeOffer;
export const sendTrade = sendTradeOffer;
export const acceptTrade = acceptTradeOffer;
export const rejectTrade = rejectTradeOffer;
export const cancelTrade = cancelTradeOffer;
export const counterOffer = counterOfferTradeOffer;
export const listTrades = listTradeOffers;

// The authenticated collectible-expiry route imports this compatibility
// surface so trade and gift sweeps share one cron invocation.
export { expireCollectibleGiftOffersBatch } from "./gift-offer";
