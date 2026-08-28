import { createHash } from "node:crypto";

import {
  and,
  asc,
  blackMarketListing,
  blackMarketListingAudit,
  blackMarketRiskSignal,
  blackMarketSale,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  collectibleCustody,
  collectibleOwnershipEvent,
  desc,
  eq,
  gte,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  packInstance,
  packRevision,
  packTemplate,
  sql,
  user,
} from "@repo/db";
import type { db as database, SQL, SQLWrapper } from "@repo/db";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import {
  blackMarketAdminCancellationInputSchema,
  blackMarketListingActionInputSchema,
  blackMarketListingPublishInputSchema,
  blackMarketListingSearchInputSchema,
  blackMarketPurchaseInputSchema,
  blackMarketSaleHistoryInputSchema,
  calculateListingFee,
  normalizeCollectiblePayload,
} from "@repo/shared/collectibles";
import type {
  BlackMarketAdminCancellationInput,
  BlackMarketListingAsset,
  BlackMarketListingActionInput,
  BlackMarketListingPublishInput,
  BlackMarketListingSearchInput,
  BlackMarketListingState,
  BlackMarketPurchaseInput,
  BlackMarketSaleHistoryInput,
  CollectibleMetricSink,
  PublicCollectibleSale,
} from "@repo/shared/collectibles";

import { isUserBanActive } from "../utils/user-ban";
import { appendCollectibleAdminAction } from "./collectible-admin-action";
import {
  assertNoActiveCollectibleCustody,
  CollectibleCustodyError,
  createCollectibleCustody,
  findActiveCollectibleCustody,
  listBlackMarketListingCustody,
  lockActiveCollectibleCustody,
  lockCollectibleAssets,
  releaseBlackMarketCollectibleCustody,
  transferCollectibleAssetOwner,
} from "./collectible-custody";
import type { CollectibleTransaction } from "./collectible-issuance";
import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import {
  getOrCreateUserWalletInTransaction,
  postEterisTransactionInTransaction,
  reverseEterisTransactionInTransaction,
} from "./eteris";
import { createUserNotification } from "./notification";

type Database = typeof database;
type Transaction = CollectibleTransaction;

const BLACK_MARKET_EXPIRY_DAYS = 30;
export const BLACK_MARKET_LISTING_EXPIRY_MS =
  BLACK_MARKET_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const BLACK_MARKET_MIN_PRICE = 1n;
/** Hard ledger ceiling; every bigint column must stay representable. */
const BLACK_MARKET_LEDGER_MAX_PRICE = 9_223_372_036_854_775_807n;
/**
 * Owner-configured asking-price ceiling. The env contract validates the
 * literal; this clamp fails safe to the ledger ceiling when the variable is
 * absent (partial test doubles), so the bound can never silently widen.
 */
export const BLACK_MARKET_MAX_PRICE = (() => {
  const configured = env.BLACK_MARKET_MAX_PRICE;
  if (
    typeof configured === "bigint" &&
    configured >= BLACK_MARKET_MIN_PRICE &&
    configured <= BLACK_MARKET_LEDGER_MAX_PRICE
  ) {
    return configured;
  }
  return BLACK_MARKET_LEDGER_MAX_PRICE;
})();

export type BlackMarketErrorCode =
  | "ACCOUNT_INELIGIBLE"
  | "ACTIVE_CUSTODY"
  | "ASSET_NOT_FOUND"
  | "ASSET_UNAVAILABLE"
  | "BINDING_NOT_TRANSFERABLE"
  | "DUPLICATE_ASSET"
  | "FEE_INSUFFICIENT_FUNDS"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_PRICE"
  | "LISTING_CHANGED"
  | "LISTING_NOT_FOUND"
  | "LISTING_TERMINAL"
  | "OWNERSHIP_CHANGED"
  | "PERMISSION_DENIED"
  | "POLICY_BLOCKED"
  | "PROJECTION_MISMATCH"
  | "SELF_PURCHASE"
  | "STALE_PRICE"
  | "STALE_VERSION"
  | "WALLET_BLOCKED";

export class BlackMarketError extends Error {
  readonly code: BlackMarketErrorCode;

  constructor(code: BlackMarketErrorCode, message: string) {
    super(message);
    this.name = "BlackMarketError";
    this.code = code;
  }
}

export type BlackMarketListingResult = {
  askingPrice: string;
  expiresAt: Date;
  feeTransactionId: string;
  listingFee: string;
  listingId: string;
  replayed: boolean;
  state: BlackMarketListingState;
  termsHash: string;
  version: number;
};

export type BlackMarketPurchaseResult = {
  askingPrice: string;
  buyerUserId: string;
  listingId: string;
  replayed: boolean;
  saleId: string;
  sellerUserId: string;
  state: "sold";
  transactionId: string;
  transferredAssetIds: string[];
};

/** Fresh purchases carry extra context for post-commit risk review. */
type PurchaseInTransactionResult = BlackMarketPurchaseResult & {
  publishedAt?: Date;
  transferredAssets?: { assetId: string; kind: "card" | "pack" }[];
};

export type BlackMarketListingSummary = {
  askingPrice: string;
  assetCount: number;
  assetKinds: ("card" | "pack")[];
  expiresAt: Date;
  id: string;
  isBundle: boolean;
  publishedAt: Date;
  state: "active";
  version: number;
};

export type BlackMarketListingDetail = BlackMarketListingSummary & {
  assets: {
    assetId: string;
    characterName?: string;
    edition?: string | null;
    gameName?: string;
    kind: "card" | "pack";
    limited?: boolean;
    mintNumber?: number;
    normalizedGameName?: string;
    rarity?: string;
    seriesId?: string;
    seriesName?: string;
    templateId?: string;
    templateName?: string;
  }[];
  termsImmutable: true;
};

export type BlackMarketMetricName =
  | "custody_conflict"
  | "stale_ownership"
  | "idempotency_conflict"
  | "expiry_backlog"
  | "repeated_cancellation";

function nowDate(value?: Date) {
  return value ?? new Date();
}

function parsePrice(
  value: bigint | number | string,
  options: { max?: bigint } = {}
): bigint {
  const max = options.max ?? BLACK_MARKET_LEDGER_MAX_PRICE;
  let result: bigint;
  if (typeof value === "bigint") {
    result = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new BlackMarketError(
        "INVALID_PRICE",
        "El precio debe ser un entero seguro."
      );
    }
    result = BigInt(value);
  } else if (/^\d+$/.test(value.trim())) {
    result = BigInt(value.trim());
  } else {
    throw new BlackMarketError(
      "INVALID_PRICE",
      "El precio debe ser un entero positivo."
    );
  }
  if (result < BLACK_MARKET_MIN_PRICE || result > max) {
    throw new BlackMarketError(
      "INVALID_PRICE",
      "El precio está fuera del rango permitido."
    );
  }
  return result;
}

function addExpiry(publishedAt: Date) {
  return new Date(publishedAt.getTime() + BLACK_MARKET_LISTING_EXPIRY_MS);
}

function canonicalAssets(assets: readonly BlackMarketListingAsset[]) {
  return [...assets].toSorted((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    return kindOrder || left.assetId.localeCompare(right.assetId);
  });
}

function termsFingerprint(
  sellerUserId: string,
  input: { askingPrice: bigint; assets: readonly BlackMarketListingAsset[] }
) {
  return normalizeCollectiblePayload({
    askingPrice: input.askingPrice,
    assets: canonicalAssets(input.assets),
    sellerUserId,
  });
}

function actionFingerprint(
  actorUserId: string,
  action: string,
  listingId: string,
  extra: Record<string, unknown> = {}
) {
  return normalizeCollectiblePayload({
    action,
    actorUserId,
    listingId,
    ...extra,
  });
}

function termsHash(fingerprint: string) {
  return createHash("sha256").update(fingerprint).digest("hex");
}

function metric(
  sink: CollectibleMetricSink | undefined,
  name: BlackMarketMetricName,
  operation: string
) {
  if (!sink) {
    return;
  }
  try {
    sink({ name, operation });
  } catch {
    // Metrics are advisory and cannot change listing or sale authority.
  }
}

function resultMetadata(result: BlackMarketListingResult) {
  return {
    result: {
      askingPrice: result.askingPrice,
      expiresAt: result.expiresAt.toISOString(),
      feeTransactionId: result.feeTransactionId,
      listingFee: result.listingFee,
      listingId: result.listingId,
      state: result.state,
      termsHash: result.termsHash,
      version: result.version,
    },
  } satisfies Record<string, unknown>;
}

function purchaseMetadata(result: BlackMarketPurchaseResult) {
  return {
    result: {
      askingPrice: result.askingPrice,
      buyerUserId: result.buyerUserId,
      listingId: result.listingId,
      saleId: result.saleId,
      sellerUserId: result.sellerUserId,
      state: result.state,
      transactionId: result.transactionId,
      transferredAssetIds: result.transferredAssetIds,
    },
  } satisfies Record<string, unknown>;
}

function resultFromAudit(
  audit: typeof blackMarketListingAudit.$inferSelect,
  replayed = true
): BlackMarketListingResult {
  const result = audit.after?.result;
  if (!result || typeof result !== "object") {
    throw new BlackMarketError(
      "IDEMPOTENCY_CONFLICT",
      "El historial de la publicación no contiene un resultado recuperable."
    );
  }
  const value = result as Record<string, unknown>;
  if (
    typeof value.listingId !== "string" ||
    typeof value.askingPrice !== "string" ||
    typeof value.listingFee !== "string" ||
    typeof value.feeTransactionId !== "string" ||
    typeof value.expiresAt !== "string" ||
    typeof value.termsHash !== "string" ||
    typeof value.version !== "number" ||
    typeof value.state !== "string"
  ) {
    throw new BlackMarketError(
      "IDEMPOTENCY_CONFLICT",
      "El historial de la publicación no contiene un resultado válido."
    );
  }
  return {
    askingPrice: value.askingPrice,
    expiresAt: new Date(value.expiresAt),
    feeTransactionId: value.feeTransactionId,
    listingFee: value.listingFee,
    listingId: value.listingId,
    replayed,
    state: value.state as BlackMarketListingState,
    termsHash: value.termsHash,
    version: value.version,
  };
}

function listingResult(
  listing: typeof blackMarketListing.$inferSelect,
  replayed: boolean
): BlackMarketListingResult {
  return {
    askingPrice: listing.askingPrice.toString(),
    expiresAt: listing.expiresAt,
    feeTransactionId: listing.feeTransactionId,
    listingFee: listing.listingFee.toString(),
    listingId: listing.id,
    replayed,
    state: listing.state as BlackMarketListingState,
    termsHash: listing.termsHash,
    version: listing.version,
  };
}

function saleResult(
  sale: typeof blackMarketSale.$inferSelect,
  transferredAssetIds: string[],
  replayed: boolean
): BlackMarketPurchaseResult {
  return {
    askingPrice: sale.askingPrice.toString(),
    buyerUserId: sale.buyerUserId ?? "closed-account",
    listingId: sale.listingId,
    replayed,
    saleId: sale.id,
    sellerUserId: sale.sellerUserId ?? "closed-account",
    state: "sold",
    transactionId: sale.eterisTransactionId,
    transferredAssetIds,
  };
}

function activeListingSeller(userId: string | null) {
  if (!userId) {
    throw new BlackMarketError(
      "LISTING_TERMINAL",
      "La cuenta vendedora ya fue cerrada."
    );
  }
  return userId;
}

async function assertEligibleSeller(
  tx: Transaction,
  sellerUserId: string,
  now: Date
) {
  const account = await tx.query.user.findFirst({
    columns: { banExpires: true, banned: true, emailVerified: true },
    where: eq(user.id, sellerUserId),
  });
  if (
    !account ||
    !account.emailVerified ||
    isUserBanActive(
      { banExpires: account.banExpires, banned: account.banned },
      now
    )
  ) {
    throw new BlackMarketError(
      "ACCOUNT_INELIGIBLE",
      "Tu cuenta no puede publicar coleccionables."
    );
  }
}

async function assertEligibleBuyer(
  tx: Transaction,
  buyerUserId: string,
  now: Date
) {
  const account = await tx.query.user.findFirst({
    columns: { banExpires: true, banned: true, emailVerified: true },
    where: eq(user.id, buyerUserId),
  });
  if (
    !account ||
    !account.emailVerified ||
    isUserBanActive(
      { banExpires: account.banExpires, banned: account.banned },
      now
    )
  ) {
    throw new BlackMarketError(
      "ACCOUNT_INELIGIBLE",
      "Tu cuenta no puede comprar coleccionables."
    );
  }
}

async function assertTransferableAsset(
  tx: Transaction,
  asset: BlackMarketListingAsset,
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
      throw new BlackMarketError(
        "ASSET_NOT_FOUND",
        "La carta indicada no existe."
      );
    }
    if (row.ownerUserId !== ownerUserId) {
      throw new BlackMarketError(
        "OWNERSHIP_CHANGED",
        "Ya no eres propietario de la carta indicada."
      );
    }
    if (row.packInstanceId !== null) {
      throw new BlackMarketError(
        "ASSET_UNAVAILABLE",
        "Una carta dentro de un Pack no puede publicarse por separado."
      );
    }
    if (row.binding !== "transferable") {
      throw new BlackMarketError(
        "BINDING_NOT_TRANSFERABLE",
        "Las cartas vinculadas a una cuenta no se pueden vender."
      );
    }
    if (
      row.availability !== "active" ||
      row.lifecycle !== "active" ||
      row.templateAvailability !== "active"
    ) {
      throw new BlackMarketError(
        "ASSET_UNAVAILABLE",
        "La carta no está disponible para publicarse."
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
    throw new BlackMarketError(
      "ASSET_NOT_FOUND",
      "El Pack indicado no existe."
    );
  }
  if (row.ownerUserId !== ownerUserId) {
    throw new BlackMarketError(
      "OWNERSHIP_CHANGED",
      "Ya no eres propietario del Pack indicado."
    );
  }
  if (row.state !== "unopened") {
    throw new BlackMarketError(
      "ASSET_UNAVAILABLE",
      "Los Packs abiertos no se pueden vender."
    );
  }
  if (row.binding !== "transferable") {
    throw new BlackMarketError(
      "BINDING_NOT_TRANSFERABLE",
      "Los Packs vinculados a una cuenta no se pueden vender."
    );
  }
  if (row.availability !== "active" || row.templateLifecycle !== "active") {
    throw new BlackMarketError(
      "ASSET_UNAVAILABLE",
      "El Pack no está disponible para publicarse."
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
    // Exhaustion only ends new issuance; packs already sold from this
    // revision stay listable. Disabling or freezing blocks them.
    (revision.availability !== "active" &&
      revision.availability !== "exhausted")
  ) {
    throw new BlackMarketError(
      "ASSET_UNAVAILABLE",
      "La revisión histórica del Pack no está disponible para venderse."
    );
  }
}

async function lockListing(tx: Transaction, listingId: string) {
  const [listing] = await tx
    .select()
    .from(blackMarketListing)
    .where(eq(blackMarketListing.id, listingId))
    .for("update");
  if (!listing) {
    throw new BlackMarketError(
      "LISTING_NOT_FOUND",
      "La publicación no existe."
    );
  }
  return listing;
}

async function findAuditByKey(tx: Transaction, idempotencyKey: string) {
  const [audit] = await tx
    .select()
    .from(blackMarketListingAudit)
    .where(eq(blackMarketListingAudit.idempotencyKey, idempotencyKey))
    .for("update");
  return audit ?? null;
}

async function appendAudit(
  tx: Transaction,
  input: {
    action:
      | "administratively-cancelled"
      | "cancelled"
      | "correction"
      | "expired"
      | "fee-reversed"
      | "published"
      | "sold";
    actorUserId: string | null;
    after?: Record<string, unknown>;
    before?: Record<string, unknown>;
    fingerprint: string;
    idempotencyKey: string;
    listingId: string;
    reason: string;
    source: string;
    version: number;
  }
) {
  await tx.insert(blackMarketListingAudit).values({
    action: input.action,
    actorUserId: input.actorUserId,
    after: input.after,
    before: input.before,
    fingerprint: input.fingerprint,
    id: generateId(),
    idempotencyKey: input.idempotencyKey,
    listingId: input.listingId,
    reason: input.reason,
    source: input.source,
    version: input.version,
  });
}

function sqlAdvisoryLock(key: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function assertBlackMarketEconomyEnabled() {
  if (!(env.XP_ECONOMY_ENABLED && env.ETERIS_SPENDING_ENABLED)) {
    throw new BlackMarketError(
      "POLICY_BLOCKED",
      "Las operaciones del mercado no están disponibles."
    );
  }
}

async function publishInTransaction(
  tx: Transaction,
  sellerUserId: string,
  rawInput: BlackMarketListingPublishInput,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  const input = blackMarketListingPublishInputSchema.parse(rawInput);
  // New listings honor the owner-configured ceiling; purchases of legacy
  // listings keep validating against the hard ledger bound instead.
  const askingPrice = parsePrice(input.askingPrice, {
    max: BLACK_MARKET_MAX_PRICE,
  });
  const assets = canonicalAssets(input.assets);
  const publishedAt = nowDate(options.now);
  const fingerprint = termsFingerprint(sellerUserId, {
    askingPrice,
    assets,
  });
  const hash = termsHash(fingerprint);
  const existing = await tx
    .select()
    .from(blackMarketListing)
    .where(eq(blackMarketListing.idempotencyKey, input.idempotencyKey))
    .for("update");
  if (existing[0]) {
    if (existing[0].fingerprint !== fingerprint) {
      metric(options.metrics, "idempotency_conflict", "black-market.publish");
      throw new BlackMarketError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de publicación ya fue usada con otros términos."
      );
    }
    return listingResult(existing[0], true);
  }

  await assertEligibleSeller(tx, sellerUserId, publishedAt);
  const wallet = await getOrCreateUserWalletInTransaction(
    tx,
    sellerUserId,
    publishedAt
  );
  if (wallet.status !== "active") {
    throw new BlackMarketError(
      "WALLET_BLOCKED",
      "Tu billetera no permite publicar coleccionables."
    );
  }
  if (wallet.balance < 0n) {
    throw new BlackMarketError(
      "FEE_INSUFFICIENT_FUNDS",
      "Necesitas saldo disponible para pagar la tarifa de publicación."
    );
  }
  const listingFee = calculateListingFee(askingPrice);
  if (
    input.expectedWalletBalance !== undefined &&
    wallet.balance !== input.expectedWalletBalance
  ) {
    throw new BlackMarketError(
      "STALE_VERSION",
      "El saldo de tu billetera cambió. Revisa la tarifa antes de publicar."
    );
  }
  if (wallet.balance < listingFee) {
    throw new BlackMarketError(
      "FEE_INSUFFICIENT_FUNDS",
      "No tienes Eteris suficientes para pagar la tarifa de publicación."
    );
  }
  await lockCollectibleAssets(tx, assets);
  for (const asset of assets) {
    await assertTransferableAsset(tx, asset, sellerUserId);
  }
  try {
    await assertNoActiveCollectibleCustody(tx, assets);
  } catch (error) {
    if (error instanceof CollectibleCustodyError) {
      metric(options.metrics, "custody_conflict", "black-market.publish");
      throw new BlackMarketError(
        "ACTIVE_CUSTODY",
        "Uno de los coleccionables ya está reservado por otra operación."
      );
    }
    throw error;
  }

  const listingId = generateId();
  const feeTransaction = await postEterisTransactionInTransaction(tx, {
    actorUserId: sellerUserId,
    createdAt: publishedAt,
    idempotencyKey: `black-market:listing-fee:${input.idempotencyKey}`,
    kind: "market_listing_fee",
    metadata: {
      askingPrice: askingPrice.toString(),
      fee: listingFee.toString(),
      listingId,
    },
    postings: [
      { amount: -listingFee, walletId: wallet.id },
      { amount: listingFee, walletId: "eteris-system-sink" },
    ],
    sourceModule: "commerce",
    sourceRef: `black-market:listing:${listingId}`,
    spending: true,
  });
  if ("mismatched" in feeTransaction) {
    throw new BlackMarketError(
      "PROJECTION_MISMATCH",
      "La billetera necesita revisión antes de publicar."
    );
  }
  const expiresAt = addExpiry(publishedAt);
  await tx.insert(blackMarketListing).values({
    askingPrice,
    expiresAt,
    feeTransactionId: feeTransaction.id,
    fingerprint,
    id: listingId,
    idempotencyKey: input.idempotencyKey,
    listingFee,
    publishedAt,
    sellerUserId,
    state: "active",
    termsHash: hash,
    version: 1,
  });
  await createCollectibleCustody(tx, {
    acquiredAt: publishedAt,
    assets: assets.map((asset) => ({ asset, side: "proposer" as const })),
    blackMarketListingId: listingId,
  });
  const result = {
    askingPrice: askingPrice.toString(),
    expiresAt,
    feeTransactionId: feeTransaction.id,
    listingFee: listingFee.toString(),
    listingId,
    replayed: false,
    state: "active" as const,
    termsHash: hash,
    version: 1,
  } satisfies BlackMarketListingResult;
  await appendAudit(tx, {
    action: "published",
    actorUserId: sellerUserId,
    after: resultMetadata(result),
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    listingId,
    reason: "Publicación fija de coleccionables.",
    source: "black-market.publish",
    version: 1,
  });
  return result;
}

export function publishBlackMarketListing(
  db: Database,
  sellerUserId: string,
  rawInput: BlackMarketListingPublishInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
): Promise<BlackMarketListingResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  assertBlackMarketEconomyEnabled();
  const {
    impersonated: _impersonated,
    metrics,
    now,
    ...contractInput
  } = rawInput;
  blackMarketListingPublishInputSchema.parse(contractInput);
  return withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(
            `black-market-publish:${contractInput.idempotencyKey}`
          )
        );
        return publishInTransaction(tx, sellerUserId, contractInput, {
          metrics,
          now,
        });
      }),
    { metrics, operation: "black-market.publish" }
  );
}

export const createBlackMarketListing = publishBlackMarketListing;
export const createBlackMarketSaleListing = publishBlackMarketListing;

type TerminalAction = "cancel" | "expire" | "administratively-cancel";

async function finalizeListing(
  tx: Transaction,
  listing: typeof blackMarketListing.$inferSelect,
  actorUserId: string,
  action: TerminalAction,
  state: "cancelled" | "expired" | "administratively-cancelled",
  reason: string,
  fingerprint: string,
  idempotencyKey: string,
  now: Date,
  options: { metrics?: CollectibleMetricSink; reverseFee?: boolean } = {}
) {
  if (listing.state !== "active") {
    metric(options.metrics, "repeated_cancellation", `black-market.${action}`);
    throw new BlackMarketError(
      "LISTING_TERMINAL",
      "La publicación ya alcanzó un estado terminal."
    );
  }
  const custodyRows = await listBlackMarketListingCustody(tx, listing.id);
  const assets = custodyRows.map((row) =>
    row.cardInstanceId
      ? { assetId: row.cardInstanceId, kind: "card" as const }
      : { assetId: row.packInstanceId!, kind: "pack" as const }
  );
  await lockCollectibleAssets(tx, assets);
  await lockActiveCollectibleCustody(tx, assets);
  await releaseBlackMarketCollectibleCustody(tx, listing.id, state, now);
  let { feeReversalTransactionId } = listing;
  if (options.reverseFee && !feeReversalTransactionId) {
    const reversal = await reverseEterisTransactionInTransaction(tx, {
      actorUserId,
      idempotencyKey: `black-market:fee-reversal:${listing.id}`,
      reason:
        "Reversión de una tarifa de publicación cancelada por la plataforma.",
      transactionId: listing.feeTransactionId,
    });
    if ("mismatched" in reversal) {
      throw new BlackMarketError(
        "PROJECTION_MISMATCH",
        "La billetera necesita revisión antes de revertir la tarifa."
      );
    }
    feeReversalTransactionId = reversal.id;
  }
  const version = listing.version + 1;
  await tx
    .update(blackMarketListing)
    .set({
      feeReversalTransactionId,
      state,
      terminalAt: now,
      terminalReason: reason,
      updatedAt: now,
      version,
    })
    .where(
      and(
        eq(blackMarketListing.id, listing.id),
        eq(blackMarketListing.state, "active")
      )
    );
  const result = {
    ...listingResult(listing, false),
    replayed: false,
    state,
    version,
  } satisfies BlackMarketListingResult;
  await appendAudit(tx, {
    action:
      state === "administratively-cancelled"
        ? "administratively-cancelled"
        : state,
    actorUserId,
    after: resultMetadata(result),
    before: {
      state: listing.state,
      version: listing.version,
    },
    fingerprint,
    idempotencyKey,
    listingId: listing.id,
    reason,
    source: `black-market.${action}`,
    version,
  });
  if (feeReversalTransactionId && !listing.feeReversalTransactionId) {
    await appendAudit(tx, {
      action: "fee-reversed",
      actorUserId,
      after: { feeReversalTransactionId },
      fingerprint,
      idempotencyKey: `${idempotencyKey}:fee-reversed`,
      listingId: listing.id,
      reason:
        "La tarifa se revirtió una sola vez como corrección conforme a política.",
      source: "black-market.fee-reversal",
      version,
    });
  }
  return result;
}

async function transitionListing(
  tx: Transaction,
  actorUserId: string,
  action: TerminalAction,
  rawInput: {
    expectedVersion?: number;
    idempotencyKey: string;
    listingId: string;
    policyViolation?: boolean;
    compliant?: boolean;
    reason?: string;
  },
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
) {
  const { listingId } = rawInput;
  const reason =
    rawInput.reason ??
    (action === "expire"
      ? "La publicación expiró después de treinta días."
      : "La publicación fue cancelada.");
  const fingerprint = actionFingerprint(actorUserId, action, listingId, {
    compliant: rawInput.compliant,
    policyViolation: rawInput.policyViolation,
    // The auto-expiry settlement below stores its audit under the shared
    // black-market-expiry key with this exact short reason; computing the
    // replay-check fingerprint with the display reason instead would turn
    // every retry of the same expiry into IDEMPOTENCY_CONFLICT.
    reason: action === "expire" ? "expired" : reason,
  });
  const existingAudit = await findAuditByKey(tx, rawInput.idempotencyKey);
  if (existingAudit) {
    if (existingAudit.fingerprint !== fingerprint) {
      metric(options.metrics, "idempotency_conflict", `black-market.${action}`);
      throw new BlackMarketError(
        "IDEMPOTENCY_CONFLICT",
        "La clave ya fue usada con otros términos."
      );
    }
    const result = existingAudit.after?.result;
    if (result && typeof result === "object") {
      return resultFromAudit(existingAudit);
    }
  }
  const listing = await lockListing(tx, listingId);
  const replayAfterLock = await findAuditByKey(tx, rawInput.idempotencyKey);
  if (replayAfterLock) {
    if (replayAfterLock.fingerprint !== fingerprint) {
      throw new BlackMarketError(
        "IDEMPOTENCY_CONFLICT",
        "La clave ya fue usada con otros términos."
      );
    }
    return resultFromAudit(replayAfterLock);
  }
  if (
    action !== "expire" &&
    action !== "administratively-cancel" &&
    actorUserId !== listing.sellerUserId
  ) {
    throw new BlackMarketError(
      "PERMISSION_DENIED",
      "Solo la persona vendedora puede cancelar la publicación."
    );
  }
  if (
    action === "administratively-cancel" &&
    rawInput.expectedVersion !== undefined &&
    rawInput.expectedVersion !== listing.version
  ) {
    throw new BlackMarketError(
      "STALE_VERSION",
      "La publicación cambió. Recarga antes de continuar."
    );
  }
  const now = nowDate(options.now);
  if (listing.state === "active" && now >= listing.expiresAt) {
    return finalizeListing(
      tx,
      listing,
      actorUserId,
      "expire",
      "expired",
      "La publicación expiró después de treinta días.",
      fingerprint,
      `black-market-expiry:${listing.id}:${listing.expiresAt.toISOString()}`,
      now,
      options
    );
  }
  if (listing.state !== "active") {
    throw new BlackMarketError(
      "LISTING_TERMINAL",
      "La publicación ya alcanzó un estado terminal."
    );
  }
  return finalizeListing(
    tx,
    listing,
    actorUserId,
    action,
    action === "cancel"
      ? "cancelled"
      : action === "expire"
        ? "expired"
        : "administratively-cancelled",
    reason,
    fingerprint,
    rawInput.idempotencyKey,
    now,
    {
      metrics: options.metrics,
      reverseFee:
        action === "administratively-cancel" &&
        (rawInput.compliant ?? !rawInput.policyViolation),
    }
  );
}

async function runTransition(
  db: Database,
  actorUserId: string,
  rawInput: {
    expectedVersion?: number;
    idempotencyKey: string;
    listingId: string;
    policyViolation?: boolean;
    compliant?: boolean;
    reason?: string;
  },
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
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`black-market-${action}:${rawInput.idempotencyKey}`)
        );
        const transitionResult = await transitionListing(
          tx,
          actorUserId,
          action,
          rawInput,
          options
        );
        if (
          action === "administratively-cancel" &&
          rawInput.expectedVersion !== undefined &&
          !transitionResult.replayed
        ) {
          await appendCollectibleAdminAction(tx, {
            action: "cancel",
            actorUserId,
            after: {
              state: transitionResult.state,
              version: transitionResult.version,
            },
            before: { state: "active" },
            expectedVersion: rawInput.expectedVersion,
            // Namespaced so one caller key cannot collide across the
            // globally-unique admin-audit table and other domains.
            idempotencyKey: `market-admin-cancel:${rawInput.idempotencyKey}`,
            metrics: options.metrics,
            reason: rawInput.reason ?? "Cancelación administrativa.",
            targetId: transitionResult.listingId,
            targetKind: "market-listing",
            version: transitionResult.version,
          });
        }
        return transitionResult;
      }),
    { metrics: options.metrics, operation: `black-market.${action}` }
  );
  if (!result.replayed) {
    await notifyBlackMarketParticipants(db, {
      // Expiry is system-driven even when it runs lazily under the seller's
      // identity, so the seller keeps receiving the release notification.
      actorUserId: action === "expire" ? null : actorUserId,
      kind: result.state,
      listingId: result.listingId,
      state: result.state,
    }).catch(() => null);
  }
  return result;
}

export function cancelBlackMarketListing(
  db: Database,
  sellerUserId: string,
  input: BlackMarketListingActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  const { impersonated, metrics, now, ...rawContractInput } = input;
  const contractInput =
    blackMarketListingActionInputSchema.parse(rawContractInput);
  return runTransition(db, sellerUserId, contractInput, "cancel", {
    impersonated,
    metrics,
    now,
  });
}

export function expireBlackMarketListing(
  db: Database,
  actorUserId: string,
  input: BlackMarketListingActionInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
    skipGate?: boolean;
  }
) {
  const { impersonated, metrics, now, skipGate, ...rawContractInput } = input;
  const contractInput =
    blackMarketListingActionInputSchema.parse(rawContractInput);
  return runTransition(db, actorUserId, contractInput, "expire", {
    impersonated,
    metrics,
    now,
    skipGate,
  });
}

export function administrativelyCancelBlackMarketListing(
  db: Database,
  actorUserId: string,
  input: BlackMarketAdminCancellationInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  const { impersonated, metrics, now, ...rawContractInput } = input;
  const contractInput =
    blackMarketAdminCancellationInputSchema.parse(rawContractInput);
  return runTransition(
    db,
    actorUserId,
    contractInput,
    "administratively-cancel",
    { impersonated, metrics, now }
  );
}

/** Internal moderation seam used when an asset freeze releases listing custody. */
export async function administrativelyCancelBlackMarketListingInTransaction(
  tx: Transaction,
  actorUserId: string,
  listingId: string,
  reason: string,
  idempotencyKey: string,
  now = new Date(),
  metrics?: CollectibleMetricSink,
  reverseFee = false
) {
  const listing = await lockListing(tx, listingId);
  if (listing.state !== "active") {
    return listingResult(listing, true);
  }
  return finalizeListing(
    tx,
    listing,
    actorUserId,
    "administratively-cancel",
    "administratively-cancelled",
    reason,
    actionFingerprint(actorUserId, "administratively-cancel", listing.id, {
      reason,
    }),
    idempotencyKey,
    now,
    { metrics, reverseFee }
  );
}

export const administrativeCancelBlackMarketListing =
  administrativelyCancelBlackMarketListing;
export const adminCancelBlackMarketListing =
  administrativelyCancelBlackMarketListing;

/** Failure-only recovery entry point. It is idempotent and never changes a
 * listing back to active; a second call observes the original reversal. */
export async function correctBlackMarketListingFeeReversal(
  db: Database,
  actorUserId: string,
  input: BlackMarketAdminCancellationInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
) {
  assertCollectiblesMutationAllowed({ impersonated: input.impersonated });
  const { impersonated: _impersonated, metrics, now, ...contractInput } = input;
  const parsed = blackMarketAdminCancellationInputSchema.parse({
    ...contractInput,
    compliant: true,
    policyViolation: undefined,
  });
  const fingerprint = actionFingerprint(
    actorUserId,
    "correction",
    parsed.listingId,
    {
      reason: parsed.reason,
    }
  );
  const result = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(`black-market-correction:${parsed.idempotencyKey}`)
        );
        const existing = await findAuditByKey(tx, parsed.idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            throw new BlackMarketError(
              "IDEMPOTENCY_CONFLICT",
              "La clave ya fue usada con otros términos."
            );
          }
          return {
            ...resultFromAudit(existing),
            corrected: true as const,
            replayed: true,
          };
        }
        const listing = await lockListing(tx, parsed.listingId);
        if (listing.state !== "administratively-cancelled") {
          throw new BlackMarketError(
            "LISTING_TERMINAL",
            "Solo se puede corregir una cancelación administrativa."
          );
        }
        if (listing.feeReversalTransactionId) {
          return { ...listingResult(listing, true), corrected: false as const };
        }
        const reversal = await reverseEterisTransactionInTransaction(tx, {
          actorUserId,
          idempotencyKey: `black-market:fee-reversal:${listing.id}`,
          reason: parsed.reason,
          transactionId: listing.feeTransactionId,
        });
        if ("mismatched" in reversal) {
          throw new BlackMarketError(
            "PROJECTION_MISMATCH",
            "La billetera necesita revisión antes de corregir la tarifa."
          );
        }
        await tx
          .update(blackMarketListing)
          .set({
            feeReversalTransactionId: reversal.id,
            updatedAt: nowDate(now),
          })
          .where(eq(blackMarketListing.id, listing.id));
        const corrected = {
          ...listingResult(
            { ...listing, feeReversalTransactionId: reversal.id },
            false
          ),
          corrected: true as const,
        };
        await appendAudit(tx, {
          action: "correction",
          actorUserId,
          after: {
            ...resultMetadata(corrected),
            feeReversalTransactionId: reversal.id,
          },
          before: { feeReversalTransactionId: null },
          fingerprint,
          idempotencyKey: parsed.idempotencyKey,
          listingId: listing.id,
          reason: parsed.reason,
          source: "black-market.correction",
          version: listing.version,
        });
        if (parsed.expectedVersion !== undefined) {
          await appendCollectibleAdminAction(tx, {
            action: "correct",
            actorUserId,
            after: { feeReversalTransactionId: reversal.id },
            before: { feeReversalTransactionId: null },
            expectedVersion: parsed.expectedVersion,
            idempotencyKey: parsed.idempotencyKey,
            linkedEterisTransactionId: listing.feeTransactionId,
            metrics,
            reason: parsed.reason,
            targetId: listing.id,
            targetKind: "market-listing",
            version: listing.version,
          });
        }
        return corrected;
      }),
    { metrics, operation: "black-market.correction" }
  );
  return result;
}

async function purchaseInTransaction(
  tx: Transaction,
  buyerUserId: string,
  rawInput: BlackMarketPurchaseInput,
  options: { metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<PurchaseInTransactionResult> {
  const input = blackMarketPurchaseInputSchema.parse(rawInput);
  const expectedPrice = parsePrice(input.expectedPrice);
  const fingerprint = actionFingerprint(
    buyerUserId,
    "purchase",
    input.listingId,
    {
      expectedPrice,
      expectedVersion: input.expectedVersion,
    }
  );
  const replay = await tx
    .select()
    .from(blackMarketSale)
    .where(eq(blackMarketSale.idempotencyKey, input.idempotencyKey))
    .for("update");
  if (replay[0]) {
    if (replay[0].fingerprint !== fingerprint) {
      metric(options.metrics, "idempotency_conflict", "black-market.purchase");
      throw new BlackMarketError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de compra ya fue usada con otros términos."
      );
    }
    const custody = await listBlackMarketListingCustody(
      tx,
      replay[0].listingId
    );
    return saleResult(
      replay[0],
      custody.map((row) => row.cardInstanceId ?? row.packInstanceId!),
      true
    );
  }
  const listing = await lockListing(tx, input.listingId);
  if (buyerUserId === listing.sellerUserId) {
    throw new BlackMarketError(
      "SELF_PURCHASE",
      "No puedes comprar tu propia publicación."
    );
  }
  if (listing.state !== "active") {
    throw new BlackMarketError(
      "LISTING_TERMINAL",
      "La publicación ya no está disponible."
    );
  }
  const now = nowDate(options.now);
  if (now >= listing.expiresAt) {
    throw new BlackMarketError(
      "LISTING_TERMINAL",
      "La publicación expiró y ya no está disponible."
    );
  }
  if (listing.version !== input.expectedVersion) {
    throw new BlackMarketError(
      "STALE_VERSION",
      "La publicación cambió. Confirma la versión actual antes de comprar."
    );
  }
  if (listing.askingPrice !== expectedPrice) {
    throw new BlackMarketError(
      "STALE_PRICE",
      "El precio cambió. Confirma el precio actual antes de comprar."
    );
  }
  const sellerUserId = activeListingSeller(listing.sellerUserId);
  await assertEligibleSeller(tx, sellerUserId, now);
  await assertEligibleBuyer(tx, buyerUserId, now);

  const custody = await listBlackMarketListingCustody(tx, listing.id);
  const assets = custody.map((row) =>
    row.cardInstanceId
      ? { assetId: row.cardInstanceId, kind: "card" as const }
      : { assetId: row.packInstanceId!, kind: "pack" as const }
  );
  if (assets.length < 1 || assets.length > 50) {
    throw new BlackMarketError(
      "LISTING_CHANGED",
      "La composición de la publicación ya no es válida."
    );
  }
  await lockCollectibleAssets(tx, assets);
  const activeCustody = await findActiveCollectibleCustody(tx, assets);
  if (activeCustody.length !== assets.length) {
    metric(options.metrics, "custody_conflict", "black-market.purchase");
    throw new BlackMarketError(
      "ACTIVE_CUSTODY",
      "La custodia exclusiva de la publicación cambió."
    );
  }
  await lockActiveCollectibleCustody(tx, assets);
  for (const asset of assets) {
    try {
      await assertTransferableAsset(tx, asset, sellerUserId);
    } catch (error) {
      if (
        error instanceof BlackMarketError &&
        (error.code === "OWNERSHIP_CHANGED" ||
          error.code === "ASSET_UNAVAILABLE")
      ) {
        metric(options.metrics, "stale_ownership", "black-market.purchase");
      }
      throw error;
    }
  }

  const participantIds = [buyerUserId, sellerUserId].toSorted();
  const wallets = [] as Awaited<
    ReturnType<typeof getOrCreateUserWalletInTransaction>
  >[];
  for (const participantId of participantIds) {
    wallets.push(
      await getOrCreateUserWalletInTransaction(tx, participantId, now)
    );
  }
  const buyerWallet = wallets.find((wallet) => wallet.userId === buyerUserId);
  const sellerWallet = wallets.find((wallet) => wallet.userId === sellerUserId);
  if (!buyerWallet || !sellerWallet) {
    throw new BlackMarketError(
      "WALLET_BLOCKED",
      "No se pudieron bloquear las billeteras participantes."
    );
  }
  if (buyerWallet.status !== "active" || sellerWallet.status !== "active") {
    throw new BlackMarketError(
      "WALLET_BLOCKED",
      "Una billetera participante no permite compras."
    );
  }
  if (buyerWallet.balance < 0n || buyerWallet.balance < expectedPrice) {
    throw new BlackMarketError(
      "INSUFFICIENT_FUNDS",
      "No tienes Eteris suficientes para esta compra."
    );
  }
  const transaction = await postEterisTransactionInTransaction(tx, {
    actorUserId: buyerUserId,
    createdAt: now,
    idempotencyKey: `market-sale:${input.idempotencyKey}`,
    kind: "market_sale",
    metadata: {
      askingPrice: expectedPrice.toString(),
      listingId: listing.id,
      sellerUserId: listing.sellerUserId,
    },
    postings: [
      { amount: -expectedPrice, walletId: buyerWallet.id },
      { amount: expectedPrice, walletId: sellerWallet.id },
    ],
    sourceModule: "commerce",
    sourceRef: `black-market:sale:${listing.id}`,
    spending: true,
  });
  if ("mismatched" in transaction) {
    throw new BlackMarketError(
      "PROJECTION_MISMATCH",
      "La billetera necesita revisión antes de comprar."
    );
  }
  const saleId = generateId();
  await tx.insert(blackMarketSale).values({
    askingPrice: expectedPrice,
    buyerUserId,
    eterisTransactionId: transaction.id,
    fingerprint,
    id: saleId,
    idempotencyKey: input.idempotencyKey,
    listingId: listing.id,
    sellerUserId,
  });
  const transferredAssetIds: string[] = [];
  for (const asset of canonicalAssets(assets)) {
    try {
      await transferCollectibleAssetOwner(
        tx,
        asset,
        sellerUserId,
        buyerUserId,
        now
      );
    } catch {
      metric(options.metrics, "stale_ownership", "black-market.purchase");
      throw new BlackMarketError(
        "OWNERSHIP_CHANGED",
        "La propiedad cambió antes de completar la compra."
      );
    }
    transferredAssetIds.push(asset.assetId);
    await appendCollectibleOwnershipEvent(tx, {
      actorUserId: buyerUserId,
      cardInstanceId: asset.kind === "card" ? asset.assetId : undefined,
      fromUserId: sellerUserId,
      kind: "sale",
      metadata: {
        listingId: listing.id,
        saleId,
      },
      packInstanceId: asset.kind === "pack" ? asset.assetId : undefined,
      sourceReference: saleId,
      sourceType: "black-market.sale",
      toUserId: buyerUserId,
    });
  }
  await releaseBlackMarketCollectibleCustody(tx, listing.id, "sold", now);
  const version = listing.version + 1;
  await tx
    .update(blackMarketListing)
    .set({
      state: "sold",
      terminalAt: now,
      terminalReason: "La publicación se vendió como un único lote.",
      updatedAt: now,
      version,
    })
    .where(
      and(
        eq(blackMarketListing.id, listing.id),
        eq(blackMarketListing.state, "active")
      )
    );
  const result = {
    askingPrice: expectedPrice.toString(),
    buyerUserId,
    listingId: listing.id,
    publishedAt: listing.publishedAt,
    replayed: false,
    saleId,
    sellerUserId,
    state: "sold" as const,
    transactionId: transaction.id,
    transferredAssetIds,
    transferredAssets: assets,
  } satisfies PurchaseInTransactionResult;
  await appendAudit(tx, {
    action: "sold",
    actorUserId: buyerUserId,
    after: purchaseMetadata(result),
    before: { state: listing.state, version: listing.version },
    fingerprint,
    idempotencyKey: `black-market:sale-audit:${input.idempotencyKey}`,
    listingId: listing.id,
    reason: "Venta fija liquidada de forma atómica.",
    source: "black-market.purchase",
    version,
  });
  return result;
}

async function expireDueBlackMarketListing(
  db: Database,
  listingId: string,
  now: Date
) {
  const [listing] = await db
    .select({
      expiresAt: blackMarketListing.expiresAt,
      sellerUserId: blackMarketListing.sellerUserId,
      state: blackMarketListing.state,
    })
    .from(blackMarketListing)
    .where(eq(blackMarketListing.id, listingId))
    .limit(1);
  if (!listing || listing.state !== "active" || now < listing.expiresAt) {
    return null;
  }
  try {
    return await expireBlackMarketListing(
      db,
      activeListingSeller(listing.sellerUserId),
      {
        idempotencyKey: `black-market-expiry:${listingId}:${listing.expiresAt.toISOString()}`,
        listingId,
        now,
        skipGate: true,
      }
    );
  } catch (error) {
    if (
      error instanceof BlackMarketError &&
      error.code === "LISTING_TERMINAL"
    ) {
      return null;
    }
    throw error;
  }
}

export async function purchaseBlackMarketListing(
  db: Database,
  buyerUserId: string,
  rawInput: BlackMarketPurchaseInput & {
    impersonated?: boolean;
    metrics?: CollectibleMetricSink;
    now?: Date;
  }
): Promise<BlackMarketPurchaseResult> {
  assertCollectiblesMutationAllowed({ impersonated: rawInput.impersonated });
  assertBlackMarketEconomyEnabled();
  const {
    impersonated: _impersonated,
    metrics,
    now,
    ...contractInput
  } = rawInput;
  blackMarketPurchaseInputSchema.parse(contractInput);
  const outcome = await withCollectibleDeadlockRetry(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sqlAdvisoryLock(
            `black-market-purchase:${contractInput.idempotencyKey}`
          )
        );
        return purchaseInTransaction(tx, buyerUserId, contractInput, {
          metrics,
          now,
        });
      }),
    { metrics, operation: "black-market.purchase" }
  ).catch(async (error: unknown) => {
    if (
      error instanceof BlackMarketError &&
      error.code === "LISTING_TERMINAL"
    ) {
      await expireDueBlackMarketListing(
        db,
        contractInput.listingId,
        nowDate(now)
      );
    }
    throw error;
  });
  if (!outcome.replayed && outcome.publishedAt && outcome.transferredAssets) {
    await notifyBlackMarketParticipants(db, {
      actorUserId: buyerUserId,
      kind: "sold",
      listingId: outcome.listingId,
      saleId: outcome.saleId,
      state: "sold",
    }).catch(() => null);
    try {
      const signals = await detectBlackMarketSaleRiskSignals(db, {
        askingPrice: BigInt(outcome.askingPrice),
        buyerUserId: outcome.buyerUserId,
        publishedAt: outcome.publishedAt,
        sellerUserId: outcome.sellerUserId,
        transferredAssets: outcome.transferredAssets,
      });
      await recordBlackMarketRiskSignals(db, {
        listingId: outcome.listingId,
        saleId: outcome.saleId,
        signals,
        subjectUserId: outcome.sellerUserId,
      });
    } catch {
      // Risk review is advisory; a detection failure must never fail the sale.
    }
  }
  const {
    publishedAt: _publishedAt,
    transferredAssets: _transferredAssets,
    ...result
  } = outcome;
  return result;
}

export const buyBlackMarketListing = purchaseBlackMarketListing;
export const purchaseListing = purchaseBlackMarketListing;

export type BlackMarketExpiryBatchResult = {
  checked: number;
  expired: number;
  listingIds: string[];
  participantUserIds: string[];
};

/**
 * The gate is deliberately skipped inside expiry transitions: releasing
 * expired custody must proceed even while collectible mutations are disabled
 * or impersonated, or the affected assets would stay locked with no
 * interactive way to free them.
 */
export async function expireBlackMarketListingsBatch(
  db: Database,
  options: { limit?: number; metrics?: CollectibleMetricSink; now?: Date } = {}
): Promise<BlackMarketExpiryBatchResult> {
  const now = nowDate(options.now);
  const limit = Math.max(1, Math.min(200, options.limit ?? 100));
  const candidates = await db
    .select({
      expiresAt: blackMarketListing.expiresAt,
      id: blackMarketListing.id,
      sellerUserId: blackMarketListing.sellerUserId,
    })
    .from(blackMarketListing)
    .where(
      and(
        eq(blackMarketListing.state, "active"),
        lte(blackMarketListing.expiresAt, now)
      )
    )
    .orderBy(asc(blackMarketListing.expiresAt), asc(blackMarketListing.id))
    .limit(limit);
  if (candidates.length === limit) {
    metric(options.metrics, "expiry_backlog", "black-market.expiry.batch");
  }
  const listingIds: string[] = [];
  const participantUserIds = new Set<string>();
  for (const candidate of candidates) {
    const sellerUserId = activeListingSeller(candidate.sellerUserId);
    const result = await expireBlackMarketListing(db, sellerUserId, {
      idempotencyKey: `black-market-expiry:${candidate.id}:${candidate.expiresAt.toISOString()}`,
      listingId: candidate.id,
      now,
      skipGate: true,
    });
    if (!result.replayed && result.state === "expired") {
      listingIds.push(candidate.id);
      participantUserIds.add(sellerUserId);
    }
  }
  return {
    checked: candidates.length,
    expired: listingIds.length,
    listingIds,
    participantUserIds: [...participantUserIds].toSorted(),
  };
}

export const expireBlackMarketListings = expireBlackMarketListingsBatch;
export const expireListingsBatch = expireBlackMarketListingsBatch;

type BlackMarketAssetDetails = BlackMarketListingDetail["assets"][number];

type SearchCursor = {
  id: string;
  sort: BlackMarketListingSearchInput["sort"];
  value: string;
};

function encodeSearchCursor(cursor: SearchCursor) {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodeSearchCursor(value: string | undefined): SearchCursor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const cursor = parsed as Record<string, unknown>;
    if (
      typeof cursor.id !== "string" ||
      typeof cursor.sort !== "string" ||
      typeof cursor.value !== "string" ||
      !["newest", "price", "rarity", "mint"].includes(cursor.sort)
    ) {
      return null;
    }
    return cursor as unknown as SearchCursor;
  } catch {
    return null;
  }
}

type SearchSortValue = Date | bigint | number;

const blackMarketListingSearchColumns = {
  askingPrice: blackMarketListing.askingPrice,
  createdAt: blackMarketListing.createdAt,
  expiresAt: blackMarketListing.expiresAt,
  feeReversalTransactionId: blackMarketListing.feeReversalTransactionId,
  feeTransactionId: blackMarketListing.feeTransactionId,
  fingerprint: blackMarketListing.fingerprint,
  id: blackMarketListing.id,
  idempotencyKey: blackMarketListing.idempotencyKey,
  listingFee: blackMarketListing.listingFee,
  publishedAt: blackMarketListing.publishedAt,
  sellerUserId: blackMarketListing.sellerUserId,
  state: blackMarketListing.state,
  termsHash: blackMarketListing.termsHash,
  terminalAt: blackMarketListing.terminalAt,
  terminalReason: blackMarketListing.terminalReason,
  updatedAt: blackMarketListing.updatedAt,
  version: blackMarketListing.version,
};

function activeListingCustodyPredicate(): SQL<unknown> {
  return and(
    eq(collectibleCustody.blackMarketListingId, blackMarketListing.id),
    isNull(collectibleCustody.releasedAt)
  )!;
}

function activeListingAssetCount() {
  return sql<number>`(
    SELECT count(*)::int
    FROM ${collectibleCustody}
    WHERE ${activeListingCustodyPredicate()}
  )`;
}

function activeListingHasKind(kind: "card" | "pack") {
  const column =
    kind === "card"
      ? collectibleCustody.cardInstanceId
      : collectibleCustody.packInstanceId;
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${collectibleCustody}
    WHERE ${activeListingCustodyPredicate()}
      AND ${column} IS NOT NULL
  )`;
}

function cardListingMatch(predicates: SQLWrapper[]) {
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${collectibleCustody}
    INNER JOIN ${cardInstance}
      ON ${cardInstance.id} = ${collectibleCustody.cardInstanceId}
    INNER JOIN ${cardTemplate}
      ON ${cardTemplate.id} = ${cardInstance.templateId}
    INNER JOIN ${cardCharacter}
      ON ${cardCharacter.id} = ${cardTemplate.characterId}
    INNER JOIN ${cardSeries}
      ON ${cardSeries.id} = ${cardTemplate.seriesId}
    WHERE ${activeListingCustodyPredicate()}
      AND ${sql.join(predicates, sql` AND `)}
  )`;
}

function packListingMatch(search: string) {
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${collectibleCustody}
    INNER JOIN ${packInstance}
      ON ${packInstance.id} = ${collectibleCustody.packInstanceId}
    INNER JOIN ${packTemplate}
      ON ${packTemplate.id} = ${packInstance.templateId}
    WHERE ${activeListingCustodyPredicate()}
      AND ${ilike(packTemplate.name, `%${search}%`)}
  )`;
}

function listingSortExpression(
  sort: BlackMarketListingSearchInput["sort"]
): SQL<unknown> {
  if (sort === "newest") {
    return sql`${blackMarketListing.publishedAt}`;
  }
  if (sort === "price") {
    return sql`${blackMarketListing.askingPrice}`;
  }
  const assetValue =
    sort === "rarity"
      ? sql<number>`CASE ${cardTemplate.rarity}
          WHEN 'common' THEN 0
          WHEN 'uncommon' THEN 1
          WHEN 'rare' THEN 2
          WHEN 'epic' THEN 3
          WHEN 'legendary' THEN 4
          ELSE 99
        END`
      : sql<number>`COALESCE(${cardInstance.mintNumber}, 2147483647)`;
  return sql<number>`(
    SELECT min(${assetValue})
    FROM ${collectibleCustody}
    LEFT JOIN ${cardInstance}
      ON ${cardInstance.id} = ${collectibleCustody.cardInstanceId}
    LEFT JOIN ${cardTemplate}
      ON ${cardTemplate.id} = ${cardInstance.templateId}
    WHERE ${activeListingCustodyPredicate()}
  )`;
}

function listingCursorCondition(
  cursor: SearchCursor | null,
  sort: BlackMarketListingSearchInput["sort"],
  sortExpression: SQL<unknown>
) {
  if (!cursor || cursor.sort !== sort) {
    return;
  }
  if (sort === "newest") {
    const timestamp = Number(cursor.value);
    if (!Number.isFinite(timestamp)) {
      return;
    }
    const value = new Date(timestamp);
    return or(
      sql`${sortExpression} < ${value}`,
      sql`(${sortExpression} = ${value} AND ${blackMarketListing.id} < ${cursor.id})`
    );
  }
  if (sort === "price") {
    let value: bigint;
    try {
      value = BigInt(cursor.value);
    } catch {
      return;
    }
    return or(
      sql`${sortExpression} > ${value}`,
      sql`(${sortExpression} = ${value} AND ${blackMarketListing.id} > ${cursor.id})`
    );
  }
  const value = Number(cursor.value);
  if (!Number.isFinite(value)) {
    return;
  }
  return or(
    sql`${sortExpression} > ${value}`,
    sql`(${sortExpression} = ${value} AND ${blackMarketListing.id} > ${cursor.id})`
  );
}

function listingSearchConditions(
  input: BlackMarketListingSearchInput,
  cursor: SearchCursor | null,
  sortExpression: SQL<unknown>,
  now: Date
) {
  const conditions = [
    eq(blackMarketListing.state, "active"),
    gt(blackMarketListing.expiresAt, now),
    gte(activeListingAssetCount(), 1),
    lte(activeListingAssetCount(), 50),
    input.minPrice === undefined
      ? undefined
      : gte(blackMarketListing.askingPrice, input.minPrice),
    input.maxPrice === undefined
      ? undefined
      : lte(blackMarketListing.askingPrice, input.maxPrice),
    input.bundleStatus === "bundle"
      ? gte(activeListingAssetCount(), 2)
      : input.bundleStatus === "single"
        ? eq(activeListingAssetCount(), 1)
        : undefined,
    input.assetKind ? activeListingHasKind(input.assetKind) : undefined,
    listingCursorCondition(cursor, input.sort, sortExpression),
  ];

  const cardPredicates: SQLWrapper[] = [activeListingCustodyPredicate()];
  if (input.character) {
    cardPredicates.push(
      ilike(cardCharacter.characterName, `%${input.character}%`)
    );
  }
  if (input.edition) {
    cardPredicates.push(ilike(cardTemplate.edition, `%${input.edition}%`));
  }
  if (input.gameName) {
    cardPredicates.push(
      ilike(cardCharacter.normalizedGameName, `%${input.gameName}%`)
    );
  }
  if (input.rarity) {
    cardPredicates.push(eq(cardTemplate.rarity, input.rarity));
  }
  if (input.limited !== undefined) {
    cardPredicates.push(
      input.limited
        ? sql`${cardTemplate.lifetimeSupplyCeiling} IS NOT NULL`
        : isNull(cardTemplate.lifetimeSupplyCeiling)
    );
  }
  if (input.mintNumber !== undefined) {
    cardPredicates.push(eq(cardInstance.mintNumber, input.mintNumber));
  }
  if (input.series) {
    cardPredicates.push(ilike(cardSeries.name, `%${input.series}%`));
  }
  if (input.seriesId) {
    cardPredicates.push(eq(cardSeries.id, input.seriesId));
  }
  const cardSearchPredicate = input.search
    ? or(
        ilike(cardCharacter.characterName, `%${input.search}%`),
        ilike(cardCharacter.gameName, `%${input.search}%`),
        ilike(cardCharacter.normalizedGameName, `%${input.search}%`),
        ilike(cardTemplate.edition, `%${input.search}%`),
        ilike(cardSeries.name, `%${input.search}%`)
      )!
    : undefined;
  const cardFilterPredicates = cardSearchPredicate
    ? [...cardPredicates, cardSearchPredicate]
    : cardPredicates;
  const cardMetadataRequested = cardPredicates.length > 1;
  const cardFilterRequested = cardFilterPredicates.length > 1;
  const cardMatch = cardFilterRequested
    ? cardListingMatch(cardFilterPredicates)
    : undefined;
  const packMatch = input.search ? packListingMatch(input.search) : undefined;
  if (input.assetKind === "pack") {
    if (cardMetadataRequested) {
      conditions.push(sql<boolean>`FALSE`);
    } else if (packMatch) {
      conditions.push(packMatch);
    }
  } else if (input.assetKind === "card") {
    if (cardMatch) {
      conditions.push(cardMatch);
    }
  } else if (cardMatch && packMatch && !cardMetadataRequested) {
    // Card-only metadata filters (rarity, mint, series...) cannot be satisfied
    // by a Pack's name; letting packNameMatch into the OR would return packs
    // that ignore those filters.
    conditions.push(or(cardMatch, packMatch)!);
  } else if (cardMatch) {
    conditions.push(cardMatch);
  } else if (packMatch) {
    conditions.push(packMatch);
  }
  return conditions.filter(
    (condition): condition is SQL<unknown> => condition !== undefined
  );
}

async function loadListingAssets(
  db: Pick<Database, "select">,
  listingId: string
): Promise<BlackMarketAssetDetails[]> {
  const custody = await db
    .select({
      cardInstanceId: collectibleCustody.cardInstanceId,
      packInstanceId: collectibleCustody.packInstanceId,
    })
    .from(collectibleCustody)
    .where(
      and(
        eq(collectibleCustody.blackMarketListingId, listingId),
        isNull(collectibleCustody.releasedAt)
      )
    );
  const assets: BlackMarketAssetDetails[] = [];
  for (const row of custody) {
    if (row.cardInstanceId) {
      const [card] = await db
        .select({
          characterName: cardCharacter.characterName,
          edition: cardTemplate.edition,
          gameName: cardCharacter.gameName,
          id: cardInstance.id,
          limited: sql<boolean>`${cardTemplate.lifetimeSupplyCeiling} IS NOT NULL`,
          mintNumber: cardInstance.mintNumber,
          normalizedGameName: cardCharacter.normalizedGameName,
          rarity: cardTemplate.rarity,
          seriesId: cardSeries.id,
          seriesName: cardSeries.name,
          templateId: cardTemplate.id,
        })
        .from(cardInstance)
        .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
        .innerJoin(
          cardCharacter,
          eq(cardCharacter.id, cardTemplate.characterId)
        )
        .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
        .where(eq(cardInstance.id, row.cardInstanceId))
        .limit(1);
      if (card) {
        assets.push({
          assetId: card.id,
          characterName: card.characterName,
          edition: card.edition,
          gameName: card.gameName,
          kind: "card",
          limited: card.limited,
          mintNumber: card.mintNumber,
          normalizedGameName: card.normalizedGameName,
          rarity: card.rarity,
          seriesId: card.seriesId,
          seriesName: card.seriesName,
          templateId: card.templateId,
        });
      }
      continue;
    }
    if (row.packInstanceId) {
      const [pack] = await db
        .select({
          id: packInstance.id,
          templateId: packTemplate.id,
          templateName: packTemplate.name,
        })
        .from(packInstance)
        .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
        .where(eq(packInstance.id, row.packInstanceId))
        .limit(1);
      if (pack) {
        assets.push({
          assetId: pack.id,
          kind: "pack",
          templateId: pack.templateId,
          templateName: pack.templateName,
        });
      }
    }
  }
  return assets;
}

function listingSummary(
  listing: typeof blackMarketListing.$inferSelect,
  assets: readonly BlackMarketAssetDetails[]
): BlackMarketListingSummary {
  return {
    askingPrice: listing.askingPrice.toString(),
    assetCount: assets.length,
    assetKinds: [...new Set(assets.map(({ kind }) => kind))].toSorted(),
    expiresAt: listing.expiresAt,
    id: listing.id,
    isBundle: assets.length > 1,
    publishedAt: listing.publishedAt,
    state: "active",
    version: listing.version,
  };
}

function listingSummaryFromQueryRow(
  row: typeof blackMarketListing.$inferSelect & {
    assetCount: number;
    hasCard: boolean;
    hasPack: boolean;
  }
): BlackMarketListingSummary {
  const assetKinds: ("card" | "pack")[] = [];
  if (row.hasCard) {
    assetKinds.push("card");
  }
  if (row.hasPack) {
    assetKinds.push("pack");
  }
  return {
    askingPrice: row.askingPrice.toString(),
    assetCount: row.assetCount,
    assetKinds,
    expiresAt: row.expiresAt,
    id: row.id,
    isBundle: row.assetCount > 1,
    publishedAt: row.publishedAt,
    state: "active",
    version: row.version,
  };
}

function cursorValue(value: SearchSortValue) {
  return String(value instanceof Date ? value.getTime() : value);
}

export async function searchBlackMarketListings(
  db: Database,
  rawInput: unknown = {}
) {
  const input = blackMarketListingSearchInputSchema.parse(rawInput);
  // Reads never run the global expiry sweep: bulk expiration belongs to the
  // shared cron, and search already excludes past-due listings via its
  // `expiresAt > now` predicate, so nothing it returns needs a transition.
  const cursor = decodeSearchCursor(input.cursor);
  const now = new Date();
  const sortExpression = listingSortExpression(input.sort);
  const conditions = listingSearchConditions(
    input,
    cursor,
    sortExpression,
    now
  );
  const rows = await db
    .select({
      ...blackMarketListingSearchColumns,
      assetCount: activeListingAssetCount(),
      hasCard: activeListingHasKind("card"),
      hasPack: activeListingHasKind("pack"),
      sortValue: sortExpression,
    })
    .from(blackMarketListing)
    .where(and(...conditions))
    .orderBy(
      input.sort === "newest" ? desc(sortExpression) : asc(sortExpression),
      input.sort === "newest"
        ? desc(blackMarketListing.id)
        : asc(blackMarketListing.id)
    )
    .limit(input.limit + 1);
  const visible = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  return {
    items: visible.map((row) =>
      listingSummaryFromQueryRow(
        row as unknown as typeof blackMarketListing.$inferSelect & {
          assetCount: number;
          hasCard: boolean;
          hasPack: boolean;
        }
      )
    ),
    nextCursor:
      hasMore && visible.at(-1)
        ? encodeSearchCursor({
            id: visible.at(-1)!.id,
            sort: input.sort,
            value: cursorValue(visible.at(-1)!.sortValue as SearchSortValue),
          })
        : null,
  };
}

export const listBlackMarketListings = searchBlackMarketListings;
export const searchListings = searchBlackMarketListings;

export async function getBlackMarketListingDetail(
  db: Database,
  listingId: string
): Promise<BlackMarketListingDetail | null> {
  try {
    await expireDueBlackMarketListing(db, listingId, new Date());
  } catch {
    // Detail reads never reveal stale active data, even if lazy expiry is
    // temporarily unavailable.
  }
  const [listing] = await db
    .select()
    .from(blackMarketListing)
    .where(eq(blackMarketListing.id, listingId))
    .limit(1);
  if (
    !listing ||
    listing.state !== "active" ||
    listing.expiresAt <= new Date()
  ) {
    return null;
  }
  const assets = await loadListingAssets(db, listing.id);
  return {
    ...listingSummary(listing, assets),
    assets,
    termsImmutable: true,
  };
}

export const getBlackMarketListing = getBlackMarketListingDetail;

export async function resolveActiveBlackMarketSales(
  db: Pick<Database, "select">,
  input: {
    assetIds: readonly string[];
    assetKind: "card" | "pack";
    profileUserId?: string;
  }
) {
  if (input.assetIds.length === 0) {
    return new Map<string, PublicCollectibleSale>();
  }
  const assetColumn =
    input.assetKind === "card"
      ? collectibleCustody.cardInstanceId
      : collectibleCustody.packInstanceId;
  const rows = await db
    .select({
      assetId: assetColumn,
      expiresAt: blackMarketListing.expiresAt,
      listingId: blackMarketListing.id,
    })
    .from(collectibleCustody)
    .innerJoin(
      blackMarketListing,
      eq(blackMarketListing.id, collectibleCustody.blackMarketListingId)
    )
    .where(
      and(
        inArray(assetColumn, [...input.assetIds]),
        isNull(collectibleCustody.releasedAt),
        eq(blackMarketListing.state, "active"),
        gt(blackMarketListing.expiresAt, new Date())
      )
    );
  const listingIds = [...new Set(rows.map(({ listingId }) => listingId))];
  const allCustody = listingIds.length
    ? await db
        .select({ listingId: collectibleCustody.blackMarketListingId })
        .from(collectibleCustody)
        .where(
          and(
            inArray(collectibleCustody.blackMarketListingId, listingIds),
            isNull(collectibleCustody.releasedAt)
          )
        )
    : [];
  const listingCounts = new Map<string, number>();
  for (const row of allCustody) {
    if (!row.listingId) {
      continue;
    }
    listingCounts.set(
      row.listingId,
      (listingCounts.get(row.listingId) ?? 0) + 1
    );
  }
  return new Map(
    rows.flatMap((row) =>
      row.assetId
        ? [
            [
              row.assetId,
              {
                isBundle: (listingCounts.get(row.listingId) ?? 0) > 1,
                listingId: row.listingId,
                listingUrl: `/cards/black-market/${row.listingId}`,
              } satisfies PublicCollectibleSale,
            ] as const,
          ]
        : []
    )
  );
}

export const resolveActiveSales = resolveActiveBlackMarketSales;

export async function listEligibleBlackMarketAssets(
  db: Database,
  userId: string
) {
  const [cards, packs] = await Promise.all([
    db
      .select({
        binding: cardInstance.binding,
        characterName: cardCharacter.characterName,
        id: cardInstance.id,
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
          eq(cardTemplate.availability, "active"),
          eq(cardTemplate.lifecycle, "active")
        )
      ),
    db
      .select({
        binding: packInstance.binding,
        id: packInstance.id,
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
          eq(packTemplate.lifecycle, "active"),
          eq(packRevision.lifecycle, "published"),
          // Exhausted revisions keep their issued packs listable.
          inArray(packRevision.availability, ["active", "exhausted"])
        )
      ),
  ]);
  const ids = [...cards.map(({ id }) => id), ...packs.map(({ id }) => id)];
  const custody = ids.length
    ? await db
        .select({
          cardId: collectibleCustody.cardInstanceId,
          packId: collectibleCustody.packInstanceId,
        })
        .from(collectibleCustody)
        .where(
          and(
            isNull(collectibleCustody.releasedAt),
            or(
              inArray(
                collectibleCustody.cardInstanceId,
                cards.map(({ id }) => id)
              ),
              inArray(
                collectibleCustody.packInstanceId,
                packs.map(({ id }) => id)
              )
            )
          )
        )
    : [];
  const reserved = new Set(
    custody.flatMap(({ cardId, packId }) => [cardId, packId].filter(Boolean))
  );
  return {
    cards: cards.filter(({ id }) => !reserved.has(id)),
    packs: packs.filter(({ id }) => !reserved.has(id)),
  };
}

export const listEligibleSaleAssets = listEligibleBlackMarketAssets;

export type BlackMarketSaleHistoryEntry = {
  price: string;
  soldAt: Date;
};

type BlackMarketSaleHistoryCursor = {
  key: string;
  soldAt: string;
};

const blackMarketSaleHistoryCursorKey = sql<string>`md5(${blackMarketSale.id})`;

export function encodeBlackMarketSaleHistoryCursor(
  cursor: BlackMarketSaleHistoryCursor
) {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeBlackMarketSaleHistoryCursor(
  value: string | undefined
): BlackMarketSaleHistoryCursor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as BlackMarketSaleHistoryCursor).soldAt !== "string" ||
      !/^[a-f0-9]{32}$/.test(
        (parsed as BlackMarketSaleHistoryCursor).key ?? ""
      ) ||
      !Number.isFinite(
        new Date((parsed as BlackMarketSaleHistoryCursor).soldAt).getTime()
      )
    ) {
      return null;
    }
    return parsed as BlackMarketSaleHistoryCursor;
  } catch {
    return null;
  }
}

export async function getBlackMarketSaleHistory(
  db: Database,
  rawInput: BlackMarketSaleHistoryInput
) {
  const input = blackMarketSaleHistoryInputSchema.parse(rawInput);
  const cursor = decodeBlackMarketSaleHistoryCursor(input.cursor);
  const rows = await db
    .selectDistinct({
      askingPrice: blackMarketSale.askingPrice,
      createdAt: blackMarketSale.createdAt,
      cursorKey: blackMarketSaleHistoryCursorKey,
    })
    .from(blackMarketSale)
    .innerJoin(
      collectibleCustody,
      eq(collectibleCustody.blackMarketListingId, blackMarketSale.listingId)
    )
    .innerJoin(
      cardInstance,
      eq(cardInstance.id, collectibleCustody.cardInstanceId)
    )
    .where(
      and(
        eq(cardInstance.templateId, input.cardTemplateId),
        cursor
          ? or(
              sql`${blackMarketSale.createdAt} < ${new Date(cursor.soldAt)}`,
              and(
                eq(blackMarketSale.createdAt, new Date(cursor.soldAt)),
                sql`${blackMarketSaleHistoryCursorKey} < ${cursor.key}`
              )
            )
          : undefined
      )
    )
    .orderBy(
      desc(blackMarketSale.createdAt),
      desc(blackMarketSaleHistoryCursorKey)
    )
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const items = pageRows.map(
    ({ askingPrice, createdAt }) =>
      ({
        price: askingPrice.toString(),
        soldAt: createdAt,
      }) satisfies BlackMarketSaleHistoryEntry
  );
  const last = pageRows.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeBlackMarketSaleHistoryCursor({
            key: last.cursorKey,
            soldAt: last.createdAt.toISOString(),
          })
        : null,
  };
}

export const listBlackMarketSaleHistory = getBlackMarketSaleHistory;

export type BlackMarketRiskSignalCandidate = {
  metadata?: Record<string, unknown>;
  severity?: "low" | "medium" | "high";
  signal:
    | "reciprocal-activity"
    | "related-accounts"
    | "extreme-price"
    | "repeated-transfers"
    | "rapid-relisting"
    | "repeated-cancellation";
};

const RISK_SIGNAL_RECIPROCAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RISK_SIGNAL_TRANSFER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Ownership events (the fresh sale included) that flag churn. */
const RISK_SIGNAL_REPEATED_TRANSFERS = 3;
const RISK_SIGNAL_RAPID_RELISTING_MS = 24 * 60 * 60 * 1000;
/**
 * "Extreme" is defined relative to the owner-configured ceiling: a sale at or
 * above one fifth of it gets reviewed, at or above the full ceiling flagged
 * high. This stays deterministic and needs no extra query.
 */
const RISK_SIGNAL_EXTREME_PRICE_MEDIUM_SHARE = 5n;

async function detectRepeatedTransfers(
  db: Database,
  input: {
    cardInstanceIds: string[];
    packInstanceIds: string[];
    windowStart: Date;
  }
): Promise<string[]> {
  const flaggedAssetIds: string[] = [];
  if (input.cardInstanceIds.length > 0) {
    const rows = await db
      .select({
        assetId: collectibleOwnershipEvent.cardInstanceId,
        total: sql<number>`count(*)::int`,
      })
      .from(collectibleOwnershipEvent)
      .where(
        and(
          inArray(
            collectibleOwnershipEvent.cardInstanceId,
            input.cardInstanceIds
          ),
          gte(collectibleOwnershipEvent.occurredAt, input.windowStart)
        )
      )
      .groupBy(collectibleOwnershipEvent.cardInstanceId)
      .having(sql`count(*) >= ${RISK_SIGNAL_REPEATED_TRANSFERS}`);
    for (const row of rows) {
      if (row.assetId) {
        flaggedAssetIds.push(row.assetId);
      }
    }
  }
  if (input.packInstanceIds.length > 0) {
    const rows = await db
      .select({
        assetId: collectibleOwnershipEvent.packInstanceId,
        total: sql<number>`count(*)::int`,
      })
      .from(collectibleOwnershipEvent)
      .where(
        and(
          inArray(
            collectibleOwnershipEvent.packInstanceId,
            input.packInstanceIds
          ),
          gte(collectibleOwnershipEvent.occurredAt, input.windowStart)
        )
      )
      .groupBy(collectibleOwnershipEvent.packInstanceId)
      .having(sql`count(*) >= ${RISK_SIGNAL_REPEATED_TRANSFERS}`);
    for (const row of rows) {
      if (row.assetId) {
        flaggedAssetIds.push(row.assetId);
      }
    }
  }
  return flaggedAssetIds;
}

async function detectRapidRelisting(
  db: Database,
  input: {
    acquiredAfter: Date;
    cardInstanceIds: string[];
    packInstanceIds: string[];
    publishedAt: Date;
    sellerUserId: string;
  }
): Promise<boolean> {
  const window = and(
    eq(collectibleOwnershipEvent.toUserId, input.sellerUserId),
    gte(collectibleOwnershipEvent.occurredAt, input.acquiredAfter),
    lte(collectibleOwnershipEvent.occurredAt, input.publishedAt)
  );
  if (input.cardInstanceIds.length > 0) {
    const [card] = await db
      .select({ id: collectibleOwnershipEvent.id })
      .from(collectibleOwnershipEvent)
      .where(
        and(
          window,
          inArray(
            collectibleOwnershipEvent.cardInstanceId,
            input.cardInstanceIds
          )
        )
      )
      .limit(1);
    if (card) {
      return true;
    }
  }
  if (input.packInstanceIds.length > 0) {
    const [pack] = await db
      .select({ id: collectibleOwnershipEvent.id })
      .from(collectibleOwnershipEvent)
      .where(
        and(
          window,
          inArray(
            collectibleOwnershipEvent.packInstanceId,
            input.packInstanceIds
          )
        )
      )
      .limit(1);
    if (pack) {
      return true;
    }
  }
  return false;
}

/**
 * Best-effort post-commit review heuristics for a settled sale. Related
 * accounts are deliberately not detected here: the platform does not retain
 * the device or network telemetry such a heuristic would require.
 */
export async function detectBlackMarketSaleRiskSignals(
  db: Database,
  input: {
    askingPrice: bigint;
    buyerUserId: string;
    publishedAt: Date;
    sellerUserId: string;
    transferredAssets: readonly { assetId: string; kind: "card" | "pack" }[];
  }
): Promise<BlackMarketRiskSignalCandidate[]> {
  const signals: BlackMarketRiskSignalCandidate[] = [];
  const now = new Date();

  if (input.askingPrice >= BLACK_MARKET_MAX_PRICE) {
    signals.push({ severity: "high", signal: "extreme-price" });
  } else if (
    input.askingPrice * RISK_SIGNAL_EXTREME_PRICE_MEDIUM_SHARE >=
    BLACK_MARKET_MAX_PRICE
  ) {
    signals.push({ severity: "medium", signal: "extreme-price" });
  }

  const [reciprocal] = await db
    .select({ id: blackMarketSale.id })
    .from(blackMarketSale)
    .innerJoin(
      blackMarketListing,
      eq(blackMarketListing.id, blackMarketSale.listingId)
    )
    .where(
      and(
        // The current seller previously bought from the current buyer.
        eq(blackMarketSale.buyerUserId, input.sellerUserId),
        eq(blackMarketListing.sellerUserId, input.buyerUserId),
        gte(
          blackMarketSale.createdAt,
          new Date(now.getTime() - RISK_SIGNAL_RECIPROCAL_WINDOW_MS)
        )
      )
    )
    .limit(1);
  if (reciprocal) {
    signals.push({
      metadata: { counterpartUserId: input.buyerUserId },
      severity: "medium",
      signal: "reciprocal-activity",
    });
  }

  const cardInstanceIds = input.transferredAssets
    .filter(({ kind }) => kind === "card")
    .map(({ assetId }) => assetId);
  const packInstanceIds = input.transferredAssets
    .filter(({ kind }) => kind === "pack")
    .map(({ assetId }) => assetId);

  const repeatedAssetIds = await detectRepeatedTransfers(db, {
    cardInstanceIds,
    packInstanceIds,
    windowStart: new Date(now.getTime() - RISK_SIGNAL_TRANSFER_WINDOW_MS),
  });
  if (repeatedAssetIds.length > 0) {
    signals.push({
      metadata: { assetIds: repeatedAssetIds.slice(0, 50) },
      severity: "low",
      signal: "repeated-transfers",
    });
  }

  if (
    await detectRapidRelisting(db, {
      acquiredAfter: new Date(
        input.publishedAt.getTime() - RISK_SIGNAL_RAPID_RELISTING_MS
      ),
      cardInstanceIds,
      packInstanceIds,
      publishedAt: input.publishedAt,
      sellerUserId: input.sellerUserId,
    })
  ) {
    signals.push({ severity: "low", signal: "rapid-relisting" });
  }

  return signals;
}

export async function recordBlackMarketRiskSignals(
  db: Database,
  input: {
    listingId?: string;
    saleId?: string;
    subjectUserId?: string;
    signals: readonly BlackMarketRiskSignalCandidate[];
  }
) {
  if (input.signals.length === 0) {
    return [];
  }
  const inserted = [] as string[];
  for (const signal of input.signals) {
    const id = generateId();
    await db.insert(blackMarketRiskSignal).values({
      id,
      listingId: input.listingId,
      metadata: signal.metadata ?? {},
      saleId: input.saleId,
      severity: signal.severity ?? "low",
      signal: signal.signal,
      subjectUserId: input.subjectUserId,
    });
    inserted.push(id);
  }
  return inserted;
}

export async function notifyBlackMarketParticipants(
  db: Database,
  input: {
    actorUserId?: string | null;
    kind: string;
    listingId: string;
    saleId?: string;
    state: string;
  }
) {
  const [listing] = await db
    .select({ sellerUserId: blackMarketListing.sellerUserId })
    .from(blackMarketListing)
    .where(eq(blackMarketListing.id, input.listingId))
    .limit(1);
  if (!listing) {
    return [];
  }
  const sale = input.saleId
    ? await db
        .select({ buyerUserId: blackMarketSale.buyerUserId })
        .from(blackMarketSale)
        .where(eq(blackMarketSale.id, input.saleId))
        .limit(1)
    : [];
  const { sellerUserId } = listing;
  const buyerUserId = sale[0]?.buyerUserId ?? null;

  // Affected parties are explicit targets regardless of who performed the
  // action: a completed purchase notifies buyer AND seller, and system-driven
  // expiry (actor null) still reaches the seller. Only the actor's own
  // self-initiated transition stays silent.
  const messages: {
    description: string;
    targetUserId: string;
    title: string;
  }[] = [];
  const isSelfAction = (userId: string | null) =>
    Boolean(userId) && userId === input.actorUserId && input.state !== "sold";

  switch (input.state) {
    case "sold": {
      if (buyerUserId) {
        messages.push({
          description:
            "Tu compra del Mercado Negro se completó y los coleccionables ya son tuyos.",
          targetUserId: buyerUserId,
          title: "Compra del Mercado Negro completada",
        });
      }
      if (sellerUserId && !isSelfAction(sellerUserId)) {
        messages.push({
          description:
            "Una publicación del Mercado Negro se vendió y la operación quedó liquidada.",
          targetUserId: sellerUserId,
          title: "Venta del Mercado Negro completada",
        });
      }
      break;
    }
    case "expired": {
      if (sellerUserId && !isSelfAction(sellerUserId)) {
        messages.push({
          description:
            "Una publicación del Mercado Negro expiró y tus coleccionables fueron liberados.",
          targetUserId: sellerUserId,
          title: "Publicación del Mercado Negro expirada",
        });
      }
      break;
    }
    case "administratively-cancelled": {
      if (sellerUserId && !isSelfAction(sellerUserId)) {
        messages.push({
          description:
            "El equipo de moderación canceló una publicación tuya del Mercado Negro.",
          targetUserId: sellerUserId,
          title: "Actualización del Mercado Negro",
        });
      }
      break;
    }
    default: {
      if (sellerUserId && !isSelfAction(sellerUserId)) {
        messages.push({
          description: "Una publicación del Mercado Negro cambió de estado.",
          targetUserId: sellerUserId,
          title: "Actualización del Mercado Negro",
        });
      }
    }
  }

  await Promise.all(
    messages.map((message) =>
      createUserNotification(db, {
        dedupeKey: `black-market:${input.listingId}:${input.state}:${message.targetUserId}`,
        description: message.description,
        metadata: {
          category: "black_market",
          linkPath: `/cards/black-market/${input.listingId}`,
          listingId: input.listingId,
          state: input.state,
        },
        sourceUserId: input.actorUserId ?? undefined,
        targetUserId: message.targetUserId,
        title: message.title,
      })
    )
  );
  return messages.map(({ targetUserId }) => targetUserId);
}

/**
 * Retryable post-commit delivery boundary. Dedupe keys keep redeliveries
 * single, so this is safe to call repeatedly after a swallowed failure.
 */
export async function retryBlackMarketListingNotification(
  db: Database,
  requesterUserId: string,
  listingId: string
) {
  const [listing] = await db
    .select({
      id: blackMarketListing.id,
      sellerUserId: blackMarketListing.sellerUserId,
      state: blackMarketListing.state,
    })
    .from(blackMarketListing)
    .where(eq(blackMarketListing.id, listingId))
    .limit(1);
  if (!listing) {
    throw new BlackMarketError(
      "LISTING_NOT_FOUND",
      "La publicación no existe."
    );
  }
  const [sale] = await db
    .select({
      buyerUserId: blackMarketSale.buyerUserId,
      id: blackMarketSale.id,
    })
    .from(blackMarketSale)
    .where(eq(blackMarketSale.listingId, listing.id))
    .limit(1);
  const participates =
    listing.sellerUserId === requesterUserId ||
    (sale?.buyerUserId !== null && sale?.buyerUserId === requesterUserId);
  if (!participates) {
    throw new BlackMarketError(
      "PERMISSION_DENIED",
      "No participas en esta publicación."
    );
  }
  return notifyBlackMarketParticipants(db, {
    actorUserId: null,
    kind: listing.state,
    listingId: listing.id,
    saleId: sale?.id,
    state: listing.state,
  });
}
