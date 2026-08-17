import { z } from "zod";

import { ETERIS_MAX_AMOUNT } from "./eteris";

/**
 * Collectible rarity is intentionally code-owned. The order is part of the
 * domain contract and must not be inferred from labels or database rows.
 */
export const COLLECTIBLE_RARITY_KEYS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export type CollectibleRarity = (typeof COLLECTIBLE_RARITY_KEYS)[number];

export const COLLECTIBLE_RARITY_CATALOG = [
  { code: "common", label: "Común", order: 0 },
  { code: "uncommon", label: "Poco común", order: 1 },
  { code: "rare", label: "Raro", order: 2 },
  { code: "epic", label: "Épico", order: 3 },
  { code: "legendary", label: "Legendario", order: 4 },
] as const satisfies readonly {
  code: CollectibleRarity;
  label: string;
  order: number;
}[];

// These aliases make the catalog convenient for callers without creating a
// second source of truth.
export const COLLECTIBLE_RARITIES = COLLECTIBLE_RARITY_KEYS;
export const COLLECTIBLE_RARITY_VALUES = COLLECTIBLE_RARITY_KEYS;
export const COLLECTIBLE_RARITY_LABELS = {
  common: "Común",
  uncommon: "Poco común",
  rare: "Raro",
  epic: "Épico",
  legendary: "Legendario",
} as const satisfies Record<CollectibleRarity, string>;
export const RARITY_CATALOG = COLLECTIBLE_RARITY_CATALOG;
export const RARITY_ORDER = COLLECTIBLE_RARITY_KEYS;

export const COLLECTIBLE_BINDINGS = ["transferable", "account-bound"] as const;
export type CollectibleBinding = (typeof COLLECTIBLE_BINDINGS)[number];

export const COLLECTIBLE_ASSET_KINDS = ["card", "pack"] as const;
export type CollectibleAssetKind = (typeof COLLECTIBLE_ASSET_KINDS)[number];

export const COLLECTIBLE_LIFECYCLES = ["draft", "active", "retired"] as const;
export type CollectibleLifecycle = (typeof COLLECTIBLE_LIFECYCLES)[number];

export const COLLECTIBLE_AVAILABILITIES = [
  "active",
  "disabled",
  "frozen",
  "exhausted",
] as const;
export type CollectibleAvailability =
  (typeof COLLECTIBLE_AVAILABILITIES)[number];

export const COLLECTIBLE_INSTANCE_STATES = ["unopened", "opened"] as const;
export type CollectibleInstanceState =
  (typeof COLLECTIBLE_INSTANCE_STATES)[number];

/**
 * Card presentation is deliberately a closed catalog. Adding a capability
 * means shipping and reviewing code, rather than accepting a CSS/HTML/JS
 * payload from an administrator or a browser client.
 */
export const CARD_EFFECT_KEYS = [
  "none",
  "holographic-shimmer",
  "starlight-drift",
  "ember-pulse",
] as const;
export type CardEffectKey = (typeof CARD_EFFECT_KEYS)[number];

export const CARD_FRAME_KEYS = ["default", "cosmic", "disabled"] as const;
export type CardFrameKey = (typeof CARD_FRAME_KEYS)[number];
export const CARD_WATERMARK_TEXT = "NeXusTC" as const;

export const CARD_EFFECT_CATALOG = [
  {
    key: "none",
    label: "Sin efecto",
    motion: false,
    reducedMotionKey: "none",
    staticKey: "none",
  },
  {
    key: "holographic-shimmer",
    label: "Brillo holográfico",
    motion: true,
    reducedMotionKey: "holographic-shimmer-static",
    staticKey: "holographic-shimmer-static",
  },
  {
    key: "starlight-drift",
    label: "Estrellas suaves",
    motion: true,
    reducedMotionKey: "starlight-drift-static",
    staticKey: "starlight-drift-static",
  },
  {
    key: "ember-pulse",
    label: "Pulso de brasas",
    motion: true,
    reducedMotionKey: "ember-pulse-static",
    staticKey: "ember-pulse-static",
  },
] as const;

export const CARD_RENDER_VARIANTS = [
  "standard",
  "thumbnail",
  "static",
  "reduced-motion",
] as const;
export type CardRenderVariant = (typeof CARD_RENDER_VARIANTS)[number];

export const CARD_LIFECYCLE_VALUES = ["draft", "active", "retired"] as const;
export type CardLifecycle = (typeof CARD_LIFECYCLE_VALUES)[number];

export const CARD_TEMPLATE_AVAILABILITY_VALUES = [
  "active",
  "disabled",
] as const;
export type CardTemplateAvailability =
  (typeof CARD_TEMPLATE_AVAILABILITY_VALUES)[number];

export const CARD_CORRECTION_KINDS = [
  "wording",
  "artwork",
  "presentation",
  "effect",
] as const;
export type CardCorrectionKind = (typeof CARD_CORRECTION_KINDS)[number];

/** Stable error identifiers shared by browser and server boundaries. */
export const COLLECTIBLE_ERROR_CODES = [
  "GATE_DISABLED",
  "SPENDING_DISABLED",
  "ACCOUNT_INELIGIBLE",
  "WALLET_BLOCKED",
  "INSUFFICIENT_FUNDS",
  "STALE_VERSION",
  "UNAVAILABLE",
  "EXHAUSTED_SUPPLY",
  "IMPOSSIBLE_GUARANTEE",
  "ALREADY_OPENED",
  "ACTIVE_CUSTODY",
  "OWNERSHIP_CHANGED",
  "OFFER_EXPIRED",
  "LISTING_CHANGED",
  "POLICY_BLOCKED",
  "IDEMPOTENCY_CONFLICT",
  "CORRECTIVE_AUTHORITY_REQUIRED",
  "DUPLICATE_ASSET",
  "OFFER_NOT_FOUND",
  "OFFER_TERMINAL",
  "SELF_TRADE",
  "ACCOUNT_BLOCKED",
] as const;
export type CollectibleErrorCode = (typeof COLLECTIBLE_ERROR_CODES)[number];

/**
 * Safe operational events for the issuance boundary.  These deliberately
 * have no outcome, rarity, random-byte, wallet, or account payload fields.
 */
export const COLLECTIBLE_METRIC_NAMES = [
  "custody_conflict",
  "stale_ownership",
  "supply_exhaustion",
  "impossible_guarantee",
  "projection_mismatch",
  "idempotency_conflict",
  "deadlock_retry",
  "expiry_backlog",
  "repeated_cancellation",
  "rate_limit_decision",
  "freeze",
  "restore",
  "correction",
  "exceptional_grant",
  "exceptional_transfer",
  "fee_reversal",
  "revision_disabled",
  "revision_exhaustion",
  "quota_drift",
  "custody_age",
  "failed_settlement",
  "render_failure",
  "notification_backlog",
] as const;
export type CollectibleMetricName = (typeof COLLECTIBLE_METRIC_NAMES)[number];
export type CollectibleMetricEvent = {
  name: CollectibleMetricName;
  occurredAt?: Date;
  operation?: string;
  revisionId?: string;
  templateId?: string;
  retry?: number;
};
export type CollectibleMetricSink = (
  event: CollectibleMetricEvent
) => void | Promise<void>;

/** Metric sinks are observability boundaries and must never affect settlement. */
export function recordCollectibleMetric(
  sink: CollectibleMetricSink | undefined,
  event: CollectibleMetricEvent
) {
  if (!sink) {
    return;
  }
  const safeEvent: CollectibleMetricEvent = {
    name: event.name,
    ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
    ...(event.operation ? { operation: event.operation } : {}),
    ...(event.revisionId ? { revisionId: event.revisionId } : {}),
    ...(event.templateId ? { templateId: event.templateId } : {}),
    ...(event.retry === undefined ? {} : { retry: event.retry }),
  };
  try {
    const result = sink({
      ...safeEvent,
      occurredAt: safeEvent.occurredAt ?? new Date(),
    });
    if (result !== undefined) {
      // Metric delivery is deliberately best-effort and cannot block commands.
      // oxlint-disable-next-line promise/prefer-await-to-then
      void Promise.resolve(result).catch(() => null);
    }
  } catch {
    // Metrics are advisory; issuance and ownership remain authoritative.
  }
}

const idSchema = z.string().trim().min(1).max(200);

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Usa un color hexadecimal válido.");

export const cardRaritySchema = z.enum(COLLECTIBLE_RARITY_KEYS);
export const cardLifecycleSchema = z.enum(CARD_LIFECYCLE_VALUES);
export const cardTemplateAvailabilitySchema = z.enum(
  CARD_TEMPLATE_AVAILABILITY_VALUES
);
export const cardEffectKeySchema = z.enum(CARD_EFFECT_KEYS);
export const cardFrameKeySchema = z.enum(CARD_FRAME_KEYS);
export const cardRenderVariantSchema = z.enum(CARD_RENDER_VARIANTS);

export const cardEffectConfigSchema = z
  .object({
    effect: cardEffectKeySchema,
    intensity: z.enum(["low", "medium", "high"]).default("low"),
  })
  .strict();
export type CardEffectConfig = z.infer<typeof cardEffectConfigSchema>;

export const cardManagedMediaReferenceSchema = z
  .object({ mediaId: idSchema })
  .strict();
export type CardManagedMediaReference = z.infer<
  typeof cardManagedMediaReferenceSchema
>;

export const cardPresentationMetadataSchema = z
  .object({
    accentColor: hexColorSchema,
    frameKey: cardFrameKeySchema,
    watermarkText: z.literal(CARD_WATERMARK_TEXT),
  })
  .strict();
export type CardPresentationMetadata = z.infer<
  typeof cardPresentationMetadataSchema
>;

export const cardRenderedVariantSchema = z
  .object({
    contentHash: z.string().regex(/^[a-f0-9]{16,128}$/),
    height: z.number().int().positive().max(10_000),
    objectKey: z
      .string()
      .regex(/^cards\/rendered\/[a-zA-Z0-9_-]+\/[a-f0-9]+\/[a-z-]+\.webp$/),
    variant: cardRenderVariantSchema,
    width: z.number().int().positive().max(10_000),
  })
  .strict();
export type CardRenderedVariant = z.infer<typeof cardRenderedVariantSchema>;

export const cardCharacterDraftSchema = z
  .object({
    characterName: z.string().trim().min(1).max(160),
    gameName: z.string().trim().min(1).max(160),
    id: idSchema.optional(),
  })
  .strict();
export type CardCharacterDraft = z.infer<typeof cardCharacterDraftSchema>;

export const cardSeriesDraftSchema = z
  .object({
    description: z.string().trim().max(2000),
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(160),
  })
  .strict();
export type CardSeriesDraft = z.infer<typeof cardSeriesDraftSchema>;

export const cardTemplateDraftSchema = z
  .object({
    characterId: idSchema,
    description: z.string().trim().max(2000).default(""),
    edition: z.string().trim().max(120).nullable().default(null),
    effect: cardEffectConfigSchema.default({
      effect: "none",
      intensity: "low",
    }),
    id: idSchema.optional(),
    lifetimeSupplyCeiling: z
      .number()
      .int()
      .positive()
      .max(2_147_483_647)
      .nullable()
      .default(null),
    presentation: cardPresentationMetadataSchema.default({
      accentColor: "#7c3aed",
      frameKey: "default",
      watermarkText: CARD_WATERMARK_TEXT,
    }),
    portraitMediaId: idSchema,
    rarity: cardRaritySchema,
    seriesId: idSchema,
  })
  .strict();
export type CardTemplateDraft = z.infer<typeof cardTemplateDraftSchema>;

export const cardPublicTemplateSchema = z
  .object({
    characterName: z.string(),
    description: z.string(),
    disabled: z.boolean(),
    edition: z.string().nullable(),
    gameName: z.string(),
    id: idSchema,
    lifetimeSupplyCeiling: z.number().int().positive().nullable(),
    placeholder: z.boolean().default(false),
    presentation: cardPresentationMetadataSchema,
    rarity: cardRaritySchema,
    renderedVariants: z.array(cardRenderedVariantSchema),
    seriesName: z.string(),
  })
  .strict();
export type CardPublicTemplate = z.infer<typeof cardPublicTemplateSchema>;

/**
 * The only card shape that may cross the opening boundary.  The instance
 * identity is intentionally absent from every Unopened Pack response and is
 * only persisted/returned once the owning transaction has committed.
 */
export const packOpeningCardSchema = z
  .object({
    cardInstanceId: idSchema,
    mintDisplay: z.string().trim().min(1).max(64),
    mintNumber: z.number().int().positive(),
    revealOrder: z.number().int().positive(),
    template: cardPublicTemplateSchema,
  })
  .strict();
export type PackOpeningCard = z.infer<typeof packOpeningCardSchema>;

export const packOpeningCardsSchema = z.array(packOpeningCardSchema).min(1);

export type CardRenderPlanInput = {
  effect: CardEffectConfig;
  gameName?: string;
  characterName?: string;
  presentation: CardPresentationMetadata;
  portraitMediaId: string;
  rarity?: CollectibleRarity;
  templateId: string;
};

export type CardRenderPlan = {
  contentHash: string;
  effect: CardEffectConfig;
  frameKey: CardFrameKey;
  includes: readonly ["frame", "labels", "rarity", "watermark", "effect"];
  labels: {
    character: string;
    game: string;
    rarity: string;
    watermark: typeof CARD_WATERMARK_TEXT;
  };
  rarityTreatment: CollectibleRarity;
  variants: CardRenderedVariant[];
};

/** Normalizes curated identity fields while preserving display spelling. */
export function normalizeCardIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export const normalizeCardCharacterName = normalizeCardIdentity;
export const normalizeCardGameName = normalizeCardIdentity;

export function getCardCharacterIdentity(input: {
  characterName: string;
  gameName: string;
}) {
  const characterName = normalizeCardCharacterName(input.characterName);
  const gameName = normalizeCardGameName(input.gameName);
  if (!characterName || !gameName) {
    throw new Error("El personaje y el juego son obligatorios.");
  }
  return { characterName, gameName };
}

function stableCardHash(input: unknown) {
  const text = JSON.stringify(input);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- FNV-1a intentionally hashes each UTF-16 code unit with 32-bit arithmetic.
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-math-trunc -- Unsigned FNV normalization.
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4);
}

/**
 * Returns the immutable render contract. Actual image work belongs to the
 * publication worker; this plan is safe to persist and independently checks
 * that every motion effect has static and reduced-motion variants.
 */
export function buildCardRenderPlan(
  input: CardRenderPlanInput
): CardRenderPlan {
  const effect = cardEffectConfigSchema.parse(input.effect);
  const presentation = cardPresentationMetadataSchema.parse(input.presentation);
  const portraitMediaId = idSchema.parse(input.portraitMediaId);
  const templateId = idSchema.parse(input.templateId);
  const rarity = input.rarity ?? "common";
  const labels = {
    character: input.characterName?.trim() || "Personaje",
    game: input.gameName?.trim() || "Juego",
    rarity: COLLECTIBLE_RARITY_LABELS[rarity],
    watermark: CARD_WATERMARK_TEXT,
  } as const;
  const contentHash = stableCardHash({
    effect,
    labels,
    portraitMediaId,
    presentation,
    rarity,
  });
  const basePath = `cards/rendered/${templateId}/${contentHash}`;
  const dimensions = {
    standard: { height: 900, width: 640 },
    thumbnail: { height: 360, width: 256 },
    static: { height: 900, width: 640 },
    "reduced-motion": { height: 900, width: 640 },
  } as const;
  const variants = CARD_RENDER_VARIANTS.map((variant) =>
    cardRenderedVariantSchema.parse({
      contentHash,
      ...dimensions[variant],
      objectKey: `${basePath}/${variant}.webp`,
      variant,
    })
  );
  return {
    contentHash,
    effect,
    frameKey: presentation.frameKey,
    includes: ["frame", "labels", "rarity", "watermark", "effect"],
    labels,
    rarityTreatment: rarity,
    variants,
  };
}

export const createCardRenderPlan = buildCardRenderPlan;

export function getCardEffectCatalogEntry(effect: CardEffectConfig) {
  const parsed = cardEffectConfigSchema.parse(effect);
  return CARD_EFFECT_CATALOG.find((entry) => entry.key === parsed.effect)!;
}

export function assertCompleteCardRenderPlan(
  plan: CardRenderPlan | readonly CardRenderedVariant[]
) {
  const variants: readonly CardRenderedVariant[] =
    "variants" in plan ? plan.variants : plan;
  const parsed = variants.map((variant) =>
    cardRenderedVariantSchema.parse(variant)
  );
  if (parsed.length !== CARD_RENDER_VARIANTS.length) {
    throw new Error("La plantilla debe tener exactamente cuatro variantes.");
  }
  const seen = new Set(parsed.map(({ variant }) => variant));
  for (const variant of CARD_RENDER_VARIANTS) {
    if (!seen.has(variant)) {
      throw new Error(`Falta la variante renderizada ${variant}.`);
    }
  }
  if (
    seen.size !== parsed.length ||
    new Set(parsed.map(({ contentHash }) => contentHash)).size !== 1
  ) {
    throw new Error(
      "Las variantes deben pertenecer a una única representación content-addressed."
    );
  }
  return parsed;
}

export function getDisabledCardPlaceholder(input: {
  id: string;
  rarity: CollectibleRarity;
  seriesName: string;
}): CardPublicTemplate & { placeholder: true } {
  return {
    characterName: "Contenido no disponible",
    description: "Esta carta está temporalmente deshabilitada.",
    disabled: true,
    edition: null,
    gameName: "NeXusTC",
    id: idSchema.parse(input.id),
    lifetimeSupplyCeiling: null,
    placeholder: true,
    presentation: {
      accentColor: "#52525b",
      frameKey: "disabled",
      watermarkText: "NeXusTC",
    },
    rarity: cardRaritySchema.parse(input.rarity),
    renderedVariants: [],
    seriesName: input.seriesName,
  };
}

export const CARD_TEMPLATE_IMMUTABLE_FIELDS = [
  "characterId",
  "seriesId",
  "edition",
  "rarity",
  "lifetimeSupplyCeiling",
] as const;

export function assertCardTemplateFieldsMutable(input: {
  changes: Record<string, unknown>;
  mintedSupply: number;
}) {
  if (
    input.mintedSupply > 0 &&
    CARD_TEMPLATE_IMMUTABLE_FIELDS.some((field) => field in input.changes)
  ) {
    throw new Error(
      "La identidad y los atributos económicos no pueden cambiar después del primer mint."
    );
  }
}

/**
 * Formats the only public mint identity.  The minted counter is scoped to a
 * Card Template, so limited cards can show their ceiling without exposing the
 * mutable projection that is used while issuing.
 */
export function formatCardMintNumber(
  mintNumber: number,
  lifetimeSupplyCeiling: number | null
) {
  if (!Number.isSafeInteger(mintNumber) || mintNumber < 1) {
    throw new RangeError("El Mint Number debe ser un entero positivo.");
  }
  if (
    lifetimeSupplyCeiling !== null &&
    (!Number.isSafeInteger(lifetimeSupplyCeiling) || lifetimeSupplyCeiling < 1)
  ) {
    throw new RangeError("El techo de suministro debe ser positivo.");
  }
  return lifetimeSupplyCeiling === null
    ? `#${mintNumber}`
    : `#${mintNumber}/${lifetimeSupplyCeiling}`;
}

export const formatMintNumber = formatCardMintNumber;
export const getCardMintDisplay = formatCardMintNumber;

export const collectibleAssetReferenceSchema = z
  .object({
    assetId: idSchema,
    kind: z.enum(COLLECTIBLE_ASSET_KINDS),
  })
  .strict();

export type CollectibleAssetReference = z.infer<
  typeof collectibleAssetReferenceSchema
>;
export const collectibleAssetSchema = collectibleAssetReferenceSchema;

export const collectibleBindingSchema = z.enum(COLLECTIBLE_BINDINGS);
export const collectibleLifecycleSchema = z.enum(COLLECTIBLE_LIFECYCLES);
export const collectibleAvailabilitySchema = z.enum(COLLECTIBLE_AVAILABILITIES);
export const collectibleInstanceStateSchema = z.enum(
  COLLECTIBLE_INSTANCE_STATES
);

export const collectibleStateSchema = z
  .object({
    availability: collectibleAvailabilitySchema,
    binding: collectibleBindingSchema,
    lifecycle: collectibleLifecycleSchema,
  })
  .strict();

export type CollectibleState = z.infer<typeof collectibleStateSchema>;

export const expectedVersionSchema = z.number().int().positive();
export const expectedVersionInputSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const callerIdempotencyKeySchema = z
  .string()
  .trim()
  .min(10)
  .max(200)
  .transform((value) => value.trim());
export const callerIdempotencyInputSchema = z
  .object({ idempotencyKey: callerIdempotencyKeySchema })
  .strict();
export const idempotencyKeySchema = callerIdempotencyKeySchema;
export const idempotencyInputSchema = callerIdempotencyInputSchema;
export const collectibleIdempotencyKeySchema = callerIdempotencyKeySchema;

export const packOpeningInputSchema = z
  .object({
    idempotencyKey: callerIdempotencyKeySchema,
    packInstanceId: idSchema,
  })
  .strict();
export type PackOpeningInput = z.infer<typeof packOpeningInputSchema>;

/** A trade side is a bounded list of exact, server-owned assets. */
export const tradeOfferAssetSchema = collectibleAssetReferenceSchema;
export type TradeOfferAsset = z.infer<typeof tradeOfferAssetSchema>;

export const tradeOfferAssetsSchema = z
  .array(tradeOfferAssetSchema)
  .min(1, "Cada lado debe incluir al menos un coleccionable.")
  .max(50, "Cada lado puede incluir como máximo 50 coleccionables.");

function normalizeTradeAssets(
  assets: TradeOfferAsset[] | undefined,
  legacyAsset: TradeOfferAsset | undefined
) {
  return assets ?? (legacyAsset ? [legacyAsset] : undefined);
}

function rejectDuplicateTradeAssets(
  input: {
    proposerAssets?: TradeOfferAsset[];
    recipientAssets?: TradeOfferAsset[];
    proposerAsset?: TradeOfferAsset;
    recipientAsset?: TradeOfferAsset;
  },
  context: z.RefinementCtx
) {
  const proposerAssets = normalizeTradeAssets(
    input.proposerAssets,
    input.proposerAsset
  );
  const recipientAssets = normalizeTradeAssets(
    input.recipientAssets,
    input.recipientAsset
  );
  if (!proposerAssets || !recipientAssets) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Una oferta debe incluir activos exactos en ambos lados.",
      path: ["proposerAssets"],
    });
    return;
  }
  const seen = new Set<string>();
  for (const [side, assets] of [
    ["proposerAssets", proposerAssets],
    ["recipientAssets", recipientAssets],
  ] as const) {
    for (const [index, asset] of assets.entries()) {
      // Instance IDs are globally generated. Treating an ID repeated with a
      // different kind as a duplicate closes an ambiguous client contract.
      if (seen.has(asset.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Una oferta no puede repetir el mismo coleccionable.",
          path: [side, index, "assetId"],
        });
      }
      seen.add(asset.assetId);
    }
  }
}

export const tradeOfferSendInputSchema = z
  .object({
    idempotencyKey: callerIdempotencyKeySchema,
    proposerAsset: tradeOfferAssetSchema.optional(),
    proposerAssets: tradeOfferAssetsSchema.optional(),
    recipientAsset: tradeOfferAssetSchema.optional(),
    recipientAssets: tradeOfferAssetsSchema.optional(),
    recipientUserId: idSchema,
  })
  .strict()
  .superRefine(rejectDuplicateTradeAssets);
export type TradeOfferSendInput = z.infer<typeof tradeOfferSendInputSchema>;
export const tradeSendInputSchema = tradeOfferSendInputSchema;

export const tradeOfferActionInputSchema = z
  .object({
    idempotencyKey: callerIdempotencyKeySchema,
    offerId: idSchema,
  })
  .strict();
export type TradeOfferActionInput = z.infer<typeof tradeOfferActionInputSchema>;

export const tradeOfferCounterInputSchema = z
  .object({
    idempotencyKey: callerIdempotencyKeySchema,
    offerId: idSchema,
    proposerAsset: tradeOfferAssetSchema.optional(),
    proposerAssets: tradeOfferAssetsSchema.optional(),
    recipientAsset: tradeOfferAssetSchema.optional(),
    recipientAssets: tradeOfferAssetsSchema.optional(),
  })
  .strict()
  .superRefine(rejectDuplicateTradeAssets);
export type TradeOfferCounterInput = z.infer<
  typeof tradeOfferCounterInputSchema
>;

export const tradeOfferListInputSchema = z
  .object({
    cursor: z.string().trim().min(1).max(300).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    state: z
      .enum([
        "sent",
        "accepted",
        "rejected",
        "cancelled",
        "expired",
        "administratively-cancelled",
      ])
      .optional(),
  })
  .strict();
export type TradeOfferListInput = z.infer<typeof tradeOfferListInputSchema>;

export const tradeOfferStateSchema = z.enum([
  "sent",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "administratively-cancelled",
]);
export type TradeOfferState = z.infer<typeof tradeOfferStateSchema>;

/** A gift is a one-way, compensation-free transfer of exact assets. */
export const giftOfferAssetSchema = collectibleAssetReferenceSchema;
export type GiftOfferAsset = z.infer<typeof giftOfferAssetSchema>;

export const giftOfferAssetsSchema = z
  .array(giftOfferAssetSchema)
  .min(1, "Un regalo debe incluir al menos un coleccionable.")
  .max(50, "Un regalo puede incluir como máximo 50 coleccionables.");

export const giftOfferSendInputSchema = z
  .object({
    assets: giftOfferAssetsSchema,
    idempotencyKey: callerIdempotencyKeySchema,
    recipientUserId: idSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();
    for (const [index, asset] of input.assets.entries()) {
      if (seen.has(asset.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Un regalo no puede repetir el mismo coleccionable.",
          path: ["assets", index, "assetId"],
        });
      }
      seen.add(asset.assetId);
    }
  });
export type GiftOfferSendInput = z.infer<typeof giftOfferSendInputSchema>;

export const giftOfferActionInputSchema = z
  .object({
    giftId: idSchema,
    idempotencyKey: callerIdempotencyKeySchema,
  })
  .strict();
export type GiftOfferActionInput = z.infer<typeof giftOfferActionInputSchema>;

export const giftOfferListInputSchema = z
  .object({
    cursor: z.string().trim().min(1).max(300).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    state: z
      .enum([
        "sent",
        "accepted",
        "rejected",
        "cancelled",
        "expired",
        "administratively-cancelled",
      ])
      .optional(),
  })
  .strict();
export type GiftOfferListInput = z.infer<typeof giftOfferListInputSchema>;

export const giftOfferStateSchema = z.enum([
  "sent",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "administratively-cancelled",
]);
export type GiftOfferState = z.infer<typeof giftOfferStateSchema>;

/** Fixed-price Black Market contracts. Listings never carry seller-authored
 * copy: the public summary is derived entirely from these exact assets. */
export const BLACK_MARKET_LISTING_STATES = [
  "active",
  "sold",
  "cancelled",
  "expired",
  "administratively-cancelled",
] as const;
export type BlackMarketListingState =
  (typeof BLACK_MARKET_LISTING_STATES)[number];
export const blackMarketListingStateSchema = z.enum(
  BLACK_MARKET_LISTING_STATES
);

export const BLACK_MARKET_LISTING_SORTS = [
  "newest",
  "price",
  "rarity",
  "mint",
] as const;
export type BlackMarketListingSort =
  (typeof BLACK_MARKET_LISTING_SORTS)[number];
export const blackMarketListingSortSchema = z.enum(BLACK_MARKET_LISTING_SORTS);

const blackMarketPriceSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, "El precio debe ser un entero positivo.")
  .transform((value) => BigInt(value))
  .refine(
    (value) => value <= ETERIS_MAX_AMOUNT,
    "El precio excede el rango permitido."
  );

export const blackMarketListingAssetSchema = collectibleAssetReferenceSchema;
export type BlackMarketListingAsset = z.infer<
  typeof blackMarketListingAssetSchema
>;
export const blackMarketListingAssetsSchema = z
  .array(blackMarketListingAssetSchema)
  .min(1, "Una publicación debe incluir al menos un coleccionable.")
  .max(50, "Una publicación puede incluir como máximo 50 coleccionables.")
  .superRefine((assets, context) => {
    const seen = new Set<string>();
    for (const [index, asset] of assets.entries()) {
      if (seen.has(asset.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Una publicación no puede repetir el mismo coleccionable.",
          path: [index, "assetId"],
        });
      }
      seen.add(asset.assetId);
    }
  });

export const blackMarketListingPublishInputSchema = z
  .object({
    askingPrice: blackMarketPriceSchema,
    assets: blackMarketListingAssetsSchema,
    expectedWalletBalance: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform((value) => BigInt(value))
      .optional(),
    idempotencyKey: callerIdempotencyKeySchema,
  })
  .strict();
export type BlackMarketListingPublishInput = z.infer<
  typeof blackMarketListingPublishInputSchema
>;

export const blackMarketListingActionInputSchema = z
  .object({
    idempotencyKey: callerIdempotencyKeySchema,
    listingId: idSchema,
  })
  .strict();
export type BlackMarketListingActionInput = z.infer<
  typeof blackMarketListingActionInputSchema
>;

export const blackMarketPurchaseInputSchema = z
  .object({
    expectedPrice: blackMarketPriceSchema,
    expectedVersion: expectedVersionSchema,
    idempotencyKey: callerIdempotencyKeySchema,
    listingId: idSchema,
  })
  .strict();
export type BlackMarketPurchaseInput = z.infer<
  typeof blackMarketPurchaseInputSchema
>;

export const blackMarketAdminCancellationInputSchema = z
  .object({
    compliant: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
    idempotencyKey: callerIdempotencyKeySchema,
    listingId: idSchema,
    policyViolation: z.boolean().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine(
    ({ compliant, policyViolation }) =>
      compliant === undefined || policyViolation === undefined,
    "Indica cumplimiento o infracción, no ambos."
  );
export type BlackMarketAdminCancellationInput = z.infer<
  typeof blackMarketAdminCancellationInputSchema
>;

export const blackMarketListingSearchInputSchema = z
  .object({
    assetKind: z.enum(COLLECTIBLE_ASSET_KINDS).optional(),
    bundleStatus: z.enum(["single", "bundle"]).optional(),
    character: z.string().trim().max(200).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
    edition: z.string().trim().max(200).optional(),
    gameName: z.string().trim().max(200).optional(),
    limited: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    maxPrice: blackMarketPriceSchema.optional(),
    minPrice: blackMarketPriceSchema.optional(),
    mintNumber: z.number().int().positive().optional(),
    rarity: cardRaritySchema.optional(),
    search: z.string().trim().max(200).optional(),
    series: z.string().trim().max(200).optional(),
    seriesId: idSchema.optional(),
    sort: blackMarketListingSortSchema.default("newest"),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El precio mínimo debe ser menor o igual al máximo.",
        path: ["maxPrice"],
      });
    }
  });
export type BlackMarketListingSearchInput = z.infer<
  typeof blackMarketListingSearchInputSchema
>;

export const blackMarketSaleHistoryInputSchema = z
  .object({
    cardTemplateId: idSchema,
    cursor: z.string().trim().min(1).max(500).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export type BlackMarketSaleHistoryInput = z.infer<
  typeof blackMarketSaleHistoryInputSchema
>;

/** Official Shop boundary contracts. Prices cross the RPC boundary as strings
 * so the server can preserve the integer Eteris convention without allowing
 * JavaScript number rounding. */
export const officialCardShopQuantitySchema = z.number().int().min(1).max(10);

export const officialCardShopPurchaseInputSchema = z
  .object({
    expectedOfferVersion: expectedVersionSchema,
    expectedUnitPrice: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/)
      .transform((value) => BigInt(value))
      .refine(
        (value) => value <= ETERIS_MAX_AMOUNT,
        "El precio excede el rango permitido."
      ),
    idempotencyKey: callerIdempotencyKeySchema,
    offerId: idSchema,
    quantity: officialCardShopQuantitySchema,
  })
  .strict();
export type OfficialCardShopPurchaseInput = z.infer<
  typeof officialCardShopPurchaseInputSchema
>;

export const officialCardShopOfferDraftSchema = z
  .object({
    binding: collectibleBindingSchema,
    endsAt: z.coerce.date().nullable().optional(),
    packTemplateId: idSchema,
    perAccountLimit: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .nullable()
      .optional(),
    price: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/)
      .transform((value) => BigInt(value))
      .refine(
        (value) => value <= ETERIS_MAX_AMOUNT,
        "El precio excede el rango permitido."
      ),
    remainingSales: z.number().int().nonnegative().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .superRefine((offer, context) => {
    if (offer.endsAt && offer.startsAt && offer.endsAt <= offer.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha final debe ser posterior a la inicial.",
        path: ["endsAt"],
      });
    }
    if (offer.perAccountLimit === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El límite por cuenta debe ser positivo o ilimitado.",
        path: ["perAccountLimit"],
      });
    }
  });
export type OfficialCardShopOfferDraft = z.input<
  typeof officialCardShopOfferDraftSchema
>;

export const officialCardShopOfferIdInputSchema = z
  .object({
    offerId: idSchema,
  })
  .strict();

export const officialCardShopExpectedVersionInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    offerId: idSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const officialCardShopRestockInputSchema = z
  .object({
    amount: z.number().int().positive().max(1_000_000),
    expectedVersion: expectedVersionSchema,
    offerId: idSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const officialCardShopReduceQuotaInputSchema = z
  .object({
    amount: z.number().int().positive().max(1_000_000),
    expectedVersion: expectedVersionSchema,
    offerId: idSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type OfficialCardShopPublicOffer = {
  binding: CollectibleBinding;
  cardCount: number;
  description: string;
  endsAt: string | null;
  guarantees: PackGuarantee[];
  id: string;
  latestRevision: PackPublicRevision;
  name: string;
  perAccountLimit: number | null;
  possiblePool: PackPublicCard[];
  price: string;
  remainingSales: number | null;
  startsAt: string | null;
  unavailableCards: PackPublicCard[];
  version: number;
};

/** Gachapon Machines weight Pack Templates, never rarity or direct cards. */
export const GACHAPON_MACHINE_STATES = [
  "draft",
  "active",
  "paused",
  "exhausted",
  "retired",
] as const;
export type GachaponMachineState = (typeof GACHAPON_MACHINE_STATES)[number];
export const gachaponMachineStateSchema = z.enum(GACHAPON_MACHINE_STATES);
export const GACHAPON_WEIGHT_MAX = 1_000_000;

const gachaponCostSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform((value) => BigInt(value))
  .refine(
    (value) => value <= ETERIS_MAX_AMOUNT,
    "El coste excede el rango permitido."
  );

export const gachaponMachinePackEntrySchema = z
  .object({
    packTemplateId: idSchema,
    weight: z.number().int().min(1).max(GACHAPON_WEIGHT_MAX),
  })
  .strict();
export type GachaponMachinePackEntry = z.infer<
  typeof gachaponMachinePackEntrySchema
>;

export const gachaponMachineDraftSchema = z
  .object({
    binding: collectibleBindingSchema,
    cost: gachaponCostSchema,
    description: z.string().trim().max(2000),
    endsAt: z.coerce.date().nullable().optional(),
    entries: z.array(gachaponMachinePackEntrySchema).min(1).max(100),
    globalQuota: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .nullable()
      .optional(),
    name: z.string().trim().min(1).max(160),
    perAccountLimit: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .nullable()
      .optional(),
    startsAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .superRefine((machine, context) => {
    const ids = machine.entries.map(({ packTemplateId }) => packTemplateId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada Pack Template puede aparecer una sola vez.",
        path: ["entries"],
      });
    }
    if (
      machine.endsAt &&
      machine.startsAt &&
      machine.endsAt <= machine.startsAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha final debe ser posterior a la inicial.",
        path: ["endsAt"],
      });
    }
  });
export type GachaponMachineDraft = z.input<typeof gachaponMachineDraftSchema>;

export const gachaponMachineIdInputSchema = z
  .object({ machineId: idSchema })
  .strict();

export const gachaponActivationInputSchema = z
  .object({
    expectedCost: gachaponCostSchema,
    expectedMachineVersion: expectedVersionSchema,
    idempotencyKey: callerIdempotencyKeySchema,
    machineId: idSchema,
  })
  .strict();
export type GachaponActivationInput = z.infer<
  typeof gachaponActivationInputSchema
>;

export type GachaponPublicEntry = {
  available: boolean;
  description: string;
  latestRevision: PackPublicRevision | null;
  name: string;
  packTemplateId: string;
};

export type GachaponPublicMachine = {
  binding: CollectibleBinding;
  cost: string;
  description: string;
  endsAt: string | null;
  entries: GachaponPublicEntry[];
  globalQuota: number | null;
  id: string;
  name: string;
  perAccountLimit: number | null;
  remainingGlobalActivations: number | null;
  startsAt: string | null;
  state: Exclude<GachaponMachineState, "draft">;
  version: number;
  availability:
    | "available"
    | "scheduled"
    | "paused"
    | "exhausted"
    | "unavailable";
};

export type GachaponActivationResult = {
  activationId: string;
  chargedCost: string;
  machineId: string;
  packInstanceId: string;
  replayed: boolean;
  revisionId: string;
  templateId: string;
  transactionId: string;
};

/** Inputs common to retryable collectible mutations. */
export const collectibleMutationInputSchema = z
  .object({
    expectedVersion: expectedVersionSchema.optional(),
    idempotencyKey: callerIdempotencyKeySchema,
  })
  .strict();

export type CollectibleMutationInput = z.infer<
  typeof collectibleMutationInputSchema
>;

export const collectibleReplayResultSchema = z
  .object({ replayed: z.boolean() })
  .strict();
export type CollectibleReplayResult = z.infer<
  typeof collectibleReplayResultSchema
>;
export const replayResponseSchema = collectibleReplayResultSchema;

export type CollectibleCommandResult<T> = T & CollectibleReplayResult;

/**
 * Produces a stable JSON representation for idempotency comparisons. Object
 * keys are sorted recursively, while array order remains command-significant.
 * BigInts and non-finite numbers are represented explicitly instead of being
 * silently coerced by JSON.stringify.
 */
export function normalizeCollectiblePayload(value: unknown): string {
  const seen = new WeakSet<object>();

  function normalize(input: unknown): unknown {
    if (
      input === null ||
      typeof input === "string" ||
      typeof input === "boolean"
    ) {
      return input;
    }
    if (typeof input === "bigint") {
      return { $bigint: input.toString() };
    }
    if (typeof input === "number") {
      if (Number.isNaN(input)) {
        return { $number: "NaN" };
      }
      if (input === Number.POSITIVE_INFINITY) {
        return { $number: "Infinity" };
      }
      if (input === Number.NEGATIVE_INFINITY) {
        return { $number: "-Infinity" };
      }
      if (Object.is(input, -0)) {
        return { $number: "-0" };
      }
      return input;
    }
    if (input === undefined) {
      return { $undefined: true };
    }
    if (typeof input === "function" || typeof input === "symbol") {
      throw new TypeError("Los datos de idempotencia deben ser serializables.");
    }
    if (input instanceof Date) {
      return { $date: input.toISOString() };
    }
    if (typeof input !== "object") {
      throw new TypeError("Los datos de idempotencia no son válidos.");
    }
    if (seen.has(input)) {
      throw new TypeError("Los datos de idempotencia no pueden ser cíclicos.");
    }
    seen.add(input);

    if (Array.isArray(input)) {
      const result = input.map((item) => normalize(item));
      seen.delete(input);
      return result;
    }

    const result = Object.fromEntries(
      Object.keys(input)
        .toSorted()
        .map((key) => [key, normalize((input as Record<string, unknown>)[key])])
    );
    seen.delete(input);
    return result;
  }

  return JSON.stringify(normalize(value));
}

export const normalizeCollectibleIdempotencyPayload =
  normalizeCollectiblePayload;

/**
 * Listing Fee is five percent of the integer asking price, rounded upward,
 * with a minimum of one Eteris. BigInt arithmetic keeps the result exact for
 * the full ledger amount range.
 */
export function calculateListingFee(
  askingPrice: bigint | number | string
): bigint {
  let amount: bigint;
  if (typeof askingPrice === "bigint") {
    amount = askingPrice;
  } else if (typeof askingPrice === "number") {
    if (!Number.isSafeInteger(askingPrice)) {
      throw new RangeError("El precio debe ser un entero seguro.");
    }
    amount = BigInt(askingPrice);
  } else if (/^\d+$/.test(askingPrice.trim())) {
    amount = BigInt(askingPrice.trim());
  } else {
    throw new RangeError("El precio debe ser un entero no negativo.");
  }

  if (amount < 0n) {
    throw new RangeError("El precio debe ser un entero no negativo.");
  }

  const percentage = amount * 5n;
  return percentage === 0n ? 1n : (percentage + 99n) / 100n;
}

export const computeListingFee = calculateListingFee;
export const getListingFee = calculateListingFee;

/**
 * Pack configuration is deliberately integer based.  Percentages shown in
 * an administrative inspection are derived from these bounded weights and
 * are never accepted as authoritative input.
 */
export const PACK_MAX_CARD_COUNT = 20;
export const MAX_PACK_CARDS = PACK_MAX_CARD_COUNT;
export const PACK_WEIGHT_MAX = 1_000_000;
export const PACK_MAX_WEIGHT = PACK_WEIGHT_MAX;

export const packLifecycleSchema = z.enum(COLLECTIBLE_LIFECYCLES);

export const PACK_DUPLICATE_POLICIES = ["allow", "no-duplicates"] as const;
export type PackDuplicatePolicy = (typeof PACK_DUPLICATE_POLICIES)[number];

export const packDuplicatePolicySchema = z.enum(PACK_DUPLICATE_POLICIES);
export const PACK_BINDING_POLICIES = [
  "transferable",
  "account-bound",
  "either",
] as const;
export type PackBindingPolicy = (typeof PACK_BINDING_POLICIES)[number];
export const packBindingPolicySchema = z.enum(PACK_BINDING_POLICIES);

const positivePackWeightSchema = z.number().int().min(1).max(PACK_WEIGHT_MAX);

export const packGuaranteeSchema = z
  .object({
    minimumCount: z.number().int().positive().max(PACK_MAX_CARD_COUNT),
    rarity: cardRaritySchema,
  })
  .strict();
export type PackGuarantee = z.infer<typeof packGuaranteeSchema>;

export const packRarityWeightSchema = z
  .object({
    rarity: cardRaritySchema,
    weight: positivePackWeightSchema,
  })
  .strict();
export type PackRarityWeight = z.infer<typeof packRarityWeightSchema>;

export const packCardWeightSchema = z
  .object({
    cardTemplateId: idSchema,
    rarity: cardRaritySchema,
    weight: positivePackWeightSchema,
  })
  .strict();
export type PackCardWeight = z.infer<typeof packCardWeightSchema>;

/** A normalized, ordered draw group used by validation and publication. */
export const packDrawGroupSchema = z
  .object({
    cardWeights: z.array(packCardWeightSchema).default([]),
    drawCount: z.number().int().positive().max(PACK_MAX_CARD_COUNT),
    guarantees: z.array(packGuaranteeSchema).default([]),
    order: z.number().int().positive(),
    rarityWeights: z.array(packRarityWeightSchema).min(1),
  })
  .strict();
export type PackDrawGroup = z.infer<typeof packDrawGroupSchema>;

/**
 * Browser/admin drafts also accept `position` as a friendly spelling for
 * `order`; normalization below emits only `order` so hashes stay stable.
 */
export const packDrawGroupDraftSchema = z
  .object({
    cardWeights: z.array(packCardWeightSchema).default([]),
    drawCount: z.number().int().positive().max(PACK_MAX_CARD_COUNT),
    guarantees: z.array(packGuaranteeSchema).default([]),
    order: z.number().int().positive().optional(),
    position: z.number().int().positive().optional(),
    rarityWeights: z.array(packRarityWeightSchema).min(1),
  })
  .strict()
  .superRefine((group, context) => {
    if (group.order === undefined && group.position === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada grupo necesita un orden.",
        path: ["order"],
      });
    }
    if (group.order !== undefined && group.position !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Usa order o position, no ambos.",
        path: ["order"],
      });
    }
  });
export type PackDrawGroupDraft = z.input<typeof packDrawGroupDraftSchema>;

export const packRevisionDraftSchema = z
  .object({
    bindingPolicy: packBindingPolicySchema.default("either"),
    cardCount: z.number().int().positive().max(PACK_MAX_CARD_COUNT),
    duplicatePolicy: packDuplicatePolicySchema,
    drawGroups: z.array(packDrawGroupDraftSchema).min(1),
    id: idSchema.optional(),
    templateId: idSchema.optional(),
  })
  .strict()
  .superRefine((revision, context) => {
    const orders = revision.drawGroups.map(
      (group) => group.order ?? group.position
    );
    if (new Set(orders).size !== orders.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El orden de los Draw Groups no puede repetirse.",
        path: ["drawGroups"],
      });
    }
  });
export type PackRevisionDraft = z.input<typeof packRevisionDraftSchema>;

export const packTemplateDraftSchema = z
  .object({
    assetMediaId: idSchema,
    description: z.string().trim().max(2000).default(""),
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(160),
  })
  .strict();
export type PackTemplateDraft = z.input<typeof packTemplateDraftSchema>;

export type NormalizedPackRevisionDraft = {
  bindingPolicy: PackBindingPolicy;
  cardCount: number;
  duplicatePolicy: PackDuplicatePolicy;
  drawGroups: PackDrawGroup[];
  id?: string;
  templateId?: string;
};

export type PackCandidate = {
  cardTemplateId: string;
  rarity: CollectibleRarity;
  available?: boolean;
  /** Current projection values are optional for pure probability tests. */
  lifetimeSupplyCeiling?: number | null;
  mintedSupply?: number;
  weight?: number;
};

export type PackOutcomeCard = {
  cardTemplateId: string;
  rarity: CollectibleRarity;
};

export type PackSelectionRandomSource = (() => number) | { next: () => number };

export type PackSelectionErrorCode =
  | "EXHAUSTED_SUPPLY"
  | "IMPOSSIBLE_GUARANTEE"
  | "UNAVAILABLE";

/** A selection failure contains no candidate, outcome, or random-source data. */
export class PackSelectionError extends Error {
  readonly code: PackSelectionErrorCode;

  constructor(code: PackSelectionErrorCode, message: string) {
    super(message);
    this.name = "PackSelectionError";
    this.code = code;
  }
}

export type PackValidationIssue = {
  message: string;
  path: (number | string)[];
};

export type PackValidationResult =
  | {
      issues: [];
      normalized: NormalizedPackRevisionDraft;
      valid: true;
    }
  | {
      issues: PackValidationIssue[];
      normalized?: NormalizedPackRevisionDraft;
      valid: false;
    };

function packCandidatesForGroup(
  group: PackDrawGroup,
  candidates: readonly PackCandidate[] | undefined,
  rarity: CollectibleRarity
) {
  const explicitForRarity = group.cardWeights.filter(
    (candidate) => candidate.rarity === rarity
  );
  const explicit = explicitForRarity
    .filter((candidate) => {
      if (!candidates) {
        return true;
      }
      return candidates.some(
        (available) =>
          available.cardTemplateId === candidate.cardTemplateId &&
          available.rarity === rarity &&
          available.available !== false
      );
    })
    .map((candidate) => ({
      cardTemplateId: candidate.cardTemplateId,
      rarity,
      weight: candidate.weight,
    }));
  // An explicit per-template pool is authoritative even when all of its
  // entries are currently unavailable. Falling back to every card of the
  // same rarity here would publish a different pool than the revision says.
  if (explicitForRarity.length > 0) {
    return explicit;
  }
  return (candidates ?? [])
    .filter(
      (candidate) =>
        candidate.rarity === rarity && candidate.available !== false
    )
    .map((candidate) => ({
      cardTemplateId: candidate.cardTemplateId,
      rarity,
      weight: candidate.weight ?? 1,
    }));
}

function hasDistinctCandidateAssignment(slots: readonly string[][]) {
  const orderedSlots = slots
    .map((candidateIds, index) => ({ candidateIds, index }))
    .toSorted(
      (left, right) => left.candidateIds.length - right.candidateIds.length
    );
  const matched = new Map<string, number>();
  const assign = (slotIndex: number, seen: Set<string>): boolean => {
    for (const candidateId of slots[slotIndex] ?? []) {
      if (seen.has(candidateId)) {
        continue;
      }
      seen.add(candidateId);
      const previousSlot = matched.get(candidateId);
      if (previousSlot === undefined || assign(previousSlot, seen)) {
        matched.set(candidateId, slotIndex);
        return true;
      }
    }
    return false;
  };
  return orderedSlots.every(({ index }) => assign(index, new Set()));
}

export function normalizePackRevisionDraft(
  input: unknown
): NormalizedPackRevisionDraft {
  const parsed = packRevisionDraftSchema.parse(input);
  const drawGroups = parsed.drawGroups
    .map((group) => ({
      cardWeights: group.cardWeights,
      drawCount: group.drawCount,
      guarantees: group.guarantees,
      order: group.order ?? group.position!,
      rarityWeights: group.rarityWeights,
    }))
    .toSorted((left, right) => left.order - right.order)
    .map((group, index) => ({
      ...group,
      // Order is a sequence, not an arbitrary display number.  This also
      // prevents two equivalent drafts from producing different hashes.
      order: index + 1,
      cardWeights: group.cardWeights.toSorted((left, right) =>
        left.cardTemplateId.localeCompare(right.cardTemplateId)
      ),
      guarantees: group.guarantees.toSorted((left, right) =>
        left.rarity.localeCompare(right.rarity)
      ),
      rarityWeights: group.rarityWeights.toSorted((left, right) =>
        left.rarity.localeCompare(right.rarity)
      ),
    }));
  return {
    bindingPolicy: parsed.bindingPolicy,
    cardCount: parsed.cardCount,
    duplicatePolicy: parsed.duplicatePolicy,
    drawGroups,
    ...(parsed.id ? { id: parsed.id } : {}),
    ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
  };
}

function nextPackSelectionRandom(
  source: PackSelectionRandomSource | undefined
) {
  const value =
    typeof source === "function" ? source() : (source?.next() ?? Math.random());
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(0.999_999_999_999, value));
}

function choosePackWeighted<T extends { weight: number }>(
  entries: readonly T[],
  source: PackSelectionRandomSource | undefined
) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || total <= 0) {
    return;
  }
  let cursor = nextPackSelectionRandom(source) * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entry;
    }
  }
  return entries.at(-1);
}

/**
 * Returns the weighted choice first and stable alternatives after it.  The
 * first choice preserves the weighted boundary contract; alternatives let
 * the feasibility search recover when a random choice would strand a later
 * guarantee or a no-duplicate slot.
 */
function orderedPackChoices<T extends { weight: number }>(
  entries: readonly T[],
  source: PackSelectionRandomSource | undefined
) {
  const first = choosePackWeighted(entries, source);
  if (!first) {
    return [] as T[];
  }
  return [first, ...entries.filter((entry) => entry !== first)];
}

type PackSelectionSlot = {
  fixedRarity?: CollectibleRarity;
  group: PackDrawGroup;
};

function candidateCapacity(candidate: PackCandidate) {
  if (candidate.lifetimeSupplyCeiling === null) {
    return Number.POSITIVE_INFINITY;
  }
  if (candidate.lifetimeSupplyCeiling !== undefined) {
    return Math.max(
      0,
      candidate.lifetimeSupplyCeiling - (candidate.mintedSupply ?? 0)
    );
  }
  return Number.POSITIVE_INFINITY;
}

function configuredPackCandidatesForRarity(
  group: PackDrawGroup,
  candidates: readonly PackCandidate[],
  rarity: CollectibleRarity,
  selected: ReadonlySet<string>,
  capacities: ReadonlyMap<string, number>,
  noDuplicates: boolean
) {
  const explicit = group.cardWeights
    .filter((entry) => entry.rarity === rarity)
    .map((entry) => ({
      cardTemplateId: entry.cardTemplateId,
      rarity,
      weight: entry.weight,
    }));
  const configured =
    explicit.length > 0
      ? explicit
      : candidates
          .filter((candidate) => candidate.rarity === rarity)
          .map((candidate) => ({
            cardTemplateId: candidate.cardTemplateId,
            rarity,
            weight: candidate.weight ?? 1,
          }));

  return configured.filter(
    ({ cardTemplateId }) =>
      candidates.some(
        (candidate) =>
          candidate.cardTemplateId === cardTemplateId &&
          candidate.rarity === rarity &&
          candidate.available !== false
      ) &&
      (capacities.get(cardTemplateId) ?? 0) > 0 &&
      (!noDuplicates || !selected.has(cardTemplateId))
  );
}

function candidateIdsForPackSelectionSlot(
  slot: PackSelectionSlot,
  candidates: readonly PackCandidate[],
  selected: ReadonlySet<string>,
  capacities: ReadonlyMap<string, number>,
  noDuplicates: boolean
) {
  const rarities = slot.fixedRarity
    ? [slot.fixedRarity]
    : slot.group.rarityWeights.map(({ rarity }) => rarity);
  return [
    ...new Set(
      rarities.flatMap((rarity) =>
        configuredPackCandidatesForRarity(
          slot.group,
          candidates,
          rarity,
          selected,
          capacities,
          noDuplicates
        ).map(({ cardTemplateId }) => cardTemplateId)
      )
    ),
  ];
}

/**
 * Selects every card in ordered Draw Groups while preserving guarantees and
 * revision-wide duplicate policy.  Candidate removal happens before weight
 * totals are computed, which means integer weights are naturally
 * renormalized after retired, disabled, or exhausted cards disappear.
 *
 * The bounded depth-first search is deliberate: a locally valid weighted
 * choice must not make a later guarantee impossible.  It is bounded by the
 * code-owned 20-card pack maximum and returns only the committed template
 * and rarity pair, never random bytes or hidden instance identifiers.
 */
export function selectPackOutcome(
  input: NormalizedPackRevisionDraft,
  candidates: readonly PackCandidate[],
  source?: PackSelectionRandomSource
): PackOutcomeCard[] {
  const configuration = normalizePackRevisionDraft(input);
  const noDuplicates = configuration.duplicatePolicy === "no-duplicates";
  const uniqueCandidates = new Map<string, PackCandidate>();
  for (const candidate of candidates) {
    if (
      candidate.available === false ||
      uniqueCandidates.has(candidate.cardTemplateId)
    ) {
      continue;
    }
    uniqueCandidates.set(candidate.cardTemplateId, candidate);
  }
  const availableCandidates = [...uniqueCandidates.values()];
  const capacities = new Map(
    availableCandidates.map((candidate) => [
      candidate.cardTemplateId,
      candidateCapacity(candidate),
    ])
  );
  const slots: PackSelectionSlot[] = [];
  for (const group of configuration.drawGroups) {
    for (const guarantee of group.guarantees) {
      for (let count = 0; count < guarantee.minimumCount; count += 1) {
        slots.push({ fixedRarity: guarantee.rarity, group });
      }
    }
    const guaranteedCount = group.guarantees.reduce(
      (sum, guarantee) => sum + guarantee.minimumCount,
      0
    );
    for (let count = guaranteedCount; count < group.drawCount; count += 1) {
      slots.push({ group });
    }
  }

  if (slots.length !== configuration.cardCount) {
    throw new PackSelectionError(
      "UNAVAILABLE",
      "La revisión no pudo producir la cantidad de cartas anunciada."
    );
  }

  const selected = new Set<string>();
  const result: PackOutcomeCard[] = [];
  const search = (slotIndex: number): boolean => {
    if (slotIndex === slots.length) {
      return true;
    }
    const slot = slots[slotIndex]!;
    const remainingCandidateIds = slots
      .slice(slotIndex)
      .map((remainingSlot) =>
        candidateIdsForPackSelectionSlot(
          remainingSlot,
          availableCandidates,
          selected,
          capacities,
          noDuplicates
        )
      );
    if (remainingCandidateIds.some((ids) => ids.length === 0)) {
      return false;
    }
    if (
      (noDuplicates &&
        !hasDistinctCandidateAssignment(remainingCandidateIds)) ||
      (!noDuplicates &&
        [...capacities.values()].reduce((sum, capacity) => sum + capacity, 0) <
          slots.length - slotIndex)
    ) {
      return false;
    }
    const rarityChoices = slot.fixedRarity
      ? [{ rarity: slot.fixedRarity, weight: 1 }]
      : slot.group.rarityWeights.filter(({ rarity }) =>
          configuredPackCandidatesForRarity(
            slot.group,
            availableCandidates,
            rarity,
            selected,
            capacities,
            noDuplicates
          ).some(() => true)
        );

    for (const rarityChoice of orderedPackChoices(rarityChoices, source)) {
      const choices = configuredPackCandidatesForRarity(
        slot.group,
        availableCandidates,
        rarityChoice.rarity,
        selected,
        capacities,
        noDuplicates
      );
      for (const choice of orderedPackChoices(choices, source)) {
        const previousCapacity = capacities.get(choice.cardTemplateId) ?? 0;
        capacities.set(choice.cardTemplateId, previousCapacity - 1);
        if (noDuplicates) {
          selected.add(choice.cardTemplateId);
        }
        result.push({
          cardTemplateId: choice.cardTemplateId,
          rarity: rarityChoice.rarity,
        });
        if (search(slotIndex + 1)) {
          return true;
        }
        result.pop();
        if (noDuplicates) {
          selected.delete(choice.cardTemplateId);
        }
        capacities.set(choice.cardTemplateId, previousCapacity);
      }
    }
    return false;
  };

  if (!search(0)) {
    const hasGuarantee = configuration.drawGroups.some(
      (group) => group.guarantees.length > 0
    );
    throw new PackSelectionError(
      hasGuarantee
        ? "IMPOSSIBLE_GUARANTEE"
        : noDuplicates
          ? "EXHAUSTED_SUPPLY"
          : "UNAVAILABLE",
      hasGuarantee
        ? "La garantía del Pack no puede cumplirse con el suministro disponible."
        : noDuplicates
          ? "No quedan cartas suficientes para respetar la política del Pack."
          : "El Pack no tiene candidatas disponibles."
    );
  }
  return result;
}

export const resolvePackOutcome = selectPackOutcome;

/**
 * Checks the complete pack contract without consulting a database.  Callers
 * pass the currently eligible cards when they need availability-aware
 * validation; a draft containing explicit card weights can be validated
 * without any database dependency.
 */
export function validatePackRevision(
  input: unknown,
  options: {
    binding?: CollectibleBinding;
    candidates?: readonly PackCandidate[];
  } = {}
): PackValidationResult {
  let normalized: NormalizedPackRevisionDraft;
  try {
    normalized = normalizePackRevisionDraft(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        issues: error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.filter(
            (part): part is string | number =>
              typeof part === "string" || typeof part === "number"
          ),
        })),
        valid: false,
      };
    }
    throw error;
  }

  const issues: PackValidationIssue[] = [];
  const canProveCandidateFeasibility =
    options.candidates !== undefined ||
    normalized.drawGroups.every((group) =>
      group.rarityWeights.every(({ rarity }) =>
        group.cardWeights.some((entry) => entry.rarity === rarity)
      )
    );
  const noDuplicateSlots: string[][] = [];
  if (
    options.binding &&
    normalized.bindingPolicy !== "either" &&
    normalized.bindingPolicy !== options.binding
  ) {
    issues.push({
      message: "La política de binding de la revisión no permite esta emisión.",
      path: ["bindingPolicy"],
    });
  }
  const totalDraws = normalized.drawGroups.reduce(
    (sum, group) => sum + group.drawCount,
    0
  );
  if (totalDraws !== normalized.cardCount) {
    issues.push({
      message: "La suma de los grupos debe coincidir con el total de cartas.",
      path: ["cardCount"],
    });
  }
  if (totalDraws > PACK_MAX_CARD_COUNT) {
    issues.push({
      message: `Un pack no puede tener más de ${PACK_MAX_CARD_COUNT} cartas.`,
      path: ["cardCount"],
    });
  }

  const allCandidates = new Set<string>();
  for (const [groupIndex, group] of normalized.drawGroups.entries()) {
    if (
      new Set(group.rarityWeights.map(({ rarity }) => rarity)).size !==
      group.rarityWeights.length
    ) {
      issues.push({
        message: "Una rareza no puede tener más de un peso por grupo.",
        path: ["drawGroups", groupIndex, "rarityWeights"],
      });
    }
    if (
      new Set(group.cardWeights.map(({ cardTemplateId }) => cardTemplateId))
        .size !== group.cardWeights.length
    ) {
      issues.push({
        message: "Una carta no puede repetirse en el mismo grupo.",
        path: ["drawGroups", groupIndex, "cardWeights"],
      });
    }
    const guaranteesByRarity = new Map<CollectibleRarity, number>();
    for (const guarantee of group.guarantees) {
      if (guaranteesByRarity.has(guarantee.rarity)) {
        issues.push({
          message: "Una rareza no puede tener más de una garantía por grupo.",
          path: ["drawGroups", groupIndex, "guarantees"],
        });
      }
      guaranteesByRarity.set(guarantee.rarity, guarantee.minimumCount);
    }
    if (
      [...guaranteesByRarity.values()].reduce(
        (sum, minimumCount) => sum + minimumCount,
        0
      ) > group.drawCount
    ) {
      issues.push({
        message: "La suma de garantías supera la cantidad de cartas del grupo.",
        path: ["drawGroups", groupIndex, "guarantees"],
      });
    }
    for (const cardWeight of group.cardWeights) {
      if (
        !group.rarityWeights.some(({ rarity }) => rarity === cardWeight.rarity)
      ) {
        issues.push({
          message:
            "Cada peso de carta necesita un peso de rareza correspondiente.",
          path: ["drawGroups", groupIndex, "cardWeights"],
        });
      }
    }
    const groupCandidates = new Set<string>();
    for (const rarity of COLLECTIBLE_RARITY_KEYS) {
      const rarityWeight = group.rarityWeights.find(
        (entry) => entry.rarity === rarity
      );
      const candidates = packCandidatesForGroup(
        group,
        options.candidates,
        rarity
      );
      if (
        rarityWeight &&
        candidates.length === 0 &&
        canProveCandidateFeasibility
      ) {
        issues.push({
          message: `No hay cartas disponibles para la rareza ${rarity}.`,
          path: ["drawGroups", groupIndex, "rarityWeights"],
        });
      }
      for (const candidate of candidates) {
        groupCandidates.add(candidate.cardTemplateId);
        allCandidates.add(candidate.cardTemplateId);
      }
    }
    if (
      normalized.duplicatePolicy === "no-duplicates" &&
      groupCandidates.size < group.drawCount &&
      canProveCandidateFeasibility
    ) {
      issues.push({
        message: "El grupo no tiene cartas suficientes para evitar duplicados.",
        path: ["drawGroups", groupIndex],
      });
    }
    for (const guarantee of group.guarantees) {
      if (
        !group.rarityWeights.some(({ rarity }) => rarity === guarantee.rarity)
      ) {
        issues.push({
          message: "Cada garantía necesita un peso de rareza correspondiente.",
          path: ["drawGroups", groupIndex, "guarantees"],
        });
      }
      const guaranteeCandidates = packCandidatesForGroup(
        group,
        options.candidates,
        guarantee.rarity
      );
      if (guarantee.minimumCount > group.drawCount) {
        issues.push({
          message: "La garantía supera la cantidad de cartas del grupo.",
          path: ["drawGroups", groupIndex, "guarantees"],
        });
      }
      if (
        normalized.duplicatePolicy === "no-duplicates" &&
        guaranteeCandidates.length < guarantee.minimumCount &&
        canProveCandidateFeasibility
      ) {
        issues.push({
          message: "La garantía no puede cumplirse sin duplicados.",
          path: ["drawGroups", groupIndex, "guarantees"],
        });
      }
      if (guaranteeCandidates.length === 0 && canProveCandidateFeasibility) {
        issues.push({
          message: `La garantía de ${guarantee.rarity} no tiene candidatas.`,
          path: ["drawGroups", groupIndex, "guarantees"],
        });
      }
      if (canProveCandidateFeasibility) {
        const candidateIds = guaranteeCandidates.map(
          ({ cardTemplateId }) => cardTemplateId
        );
        for (let count = 0; count < guarantee.minimumCount; count += 1) {
          noDuplicateSlots.push(candidateIds);
        }
      }
    }
    if (canProveCandidateFeasibility) {
      const guaranteedDraws = group.guarantees.reduce(
        (sum, guarantee) => sum + guarantee.minimumCount,
        0
      );
      const groupCandidateIds = [...groupCandidates];
      for (let count = guaranteedDraws; count < group.drawCount; count += 1) {
        noDuplicateSlots.push(groupCandidateIds);
      }
    }
  }
  if (
    normalized.duplicatePolicy === "no-duplicates" &&
    allCandidates.size < normalized.cardCount &&
    canProveCandidateFeasibility
  ) {
    issues.push({
      message: "La revisión no puede evitar duplicados entre grupos.",
      path: ["duplicatePolicy"],
    });
  }
  if (
    normalized.duplicatePolicy === "no-duplicates" &&
    canProveCandidateFeasibility &&
    !hasDistinctCandidateAssignment(noDuplicateSlots)
  ) {
    issues.push({
      message:
        "La revisión no puede evitar duplicados entre grupos: no existe una asignación factible.",
      path: ["duplicatePolicy"],
    });
  }

  return issues.length > 0
    ? { issues, normalized, valid: false }
    : { issues: [], normalized, valid: true };
}

// Both validation errors are part of this module's public domain contract.
// oxlint-disable-next-line eslint/max-classes-per-file
export class PackValidationError extends Error {
  readonly issues: PackValidationIssue[];

  constructor(issues: PackValidationIssue[]) {
    super("La revisión del pack no es publicable.");
    this.name = "PackValidationError";
    this.issues = issues;
  }
}

export function assertValidPackRevision(
  input: unknown,
  options: {
    binding?: CollectibleBinding;
    candidates?: readonly PackCandidate[];
  } = {}
) {
  const result = validatePackRevision(input, options);
  if (!result.valid) {
    throw new PackValidationError(result.issues);
  }
  return result.normalized;
}

export const validatePackConfiguration = validatePackRevision;
export const assertPackRevisionValid = assertValidPackRevision;

function stablePackConfigurationHash(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- FNV-1a intentionally hashes each UTF-16 code unit with 32-bit arithmetic.
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-math-trunc -- Unsigned FNV normalization.
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}

/** Hashes only normalized configuration, never draft IDs or audit metadata. */
export function hashPackConfiguration(input: unknown) {
  const normalized = normalizePackRevisionDraft(input);
  return stablePackConfigurationHash({
    bindingPolicy: normalized.bindingPolicy,
    cardCount: normalized.cardCount,
    duplicatePolicy: normalized.duplicatePolicy,
    drawGroups: normalized.drawGroups,
  });
}

export const computePackConfigurationHash = hashPackConfiguration;
export const packConfigurationHash = hashPackConfiguration;

export type PackProbabilityInspection = {
  groups: {
    order: number;
    rarityWeights: (PackRarityWeight & { percentage: number })[];
    totalWeight: number;
  }[];
};

/** Internal/admin-only probability view; do not use in public pack shaping. */
export function inspectPackProbabilities(
  input: unknown
): PackProbabilityInspection {
  const normalized = assertValidPackRevision(input);
  return {
    groups: normalized.drawGroups.map((group) => {
      const totalWeight = group.rarityWeights.reduce(
        (sum, entry) => sum + entry.weight,
        0
      );
      return {
        order: group.order,
        rarityWeights: group.rarityWeights.map((entry) => ({
          ...entry,
          percentage: (entry.weight / totalWeight) * 100,
        })),
        totalWeight,
      };
    }),
  };
}

export type PackSimulationResult = {
  draws: number;
  guaranteeChecks: number;
  guaranteeFailures: number;
  iterations: number;
  outcomesByCardTemplate: Record<string, number>;
  outcomesByRarity: Record<CollectibleRarity, number>;
};

type PackRandomSource = (() => number) | { next: () => number };

function nextPackRandom(source: PackRandomSource | undefined) {
  const value =
    typeof source === "function" ? source() : (source?.next() ?? Math.random());
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(0.999_999_999_999, Math.max(0, value));
}

function chooseWeighted<T extends { weight: number }>(
  entries: readonly T[],
  source: PackRandomSource | undefined
) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0 || entries.length === 0) {
    return;
  }
  let cursor = nextPackRandom(source) * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entry;
    }
  }
  return entries.at(-1);
}

/**
 * Runs aggregate-only deterministic simulation.  It intentionally returns
 * counts, never an ordered per-pack result, so a caller cannot accidentally
 * turn an admin validation endpoint into an outcome oracle.
 */
export function simulatePackRevision(
  input: unknown,
  options: {
    candidates?: readonly PackCandidate[];
    iterations?: number;
    random?: PackRandomSource;
  } = {}
): PackSimulationResult {
  const normalized = assertValidPackRevision(input, options);
  const iterations = Math.max(1, Math.min(100_000, options.iterations ?? 1000));
  const outcomesByCardTemplate: Record<string, number> = {};
  const outcomesByRarity = Object.fromEntries(
    COLLECTIBLE_RARITY_KEYS.map((rarity) => [rarity, 0])
  ) as Record<CollectibleRarity, number>;
  let guaranteeChecks = 0;
  let guaranteeFailures = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const selected = new Set<string>();
    const selectedByGroup = new Map<number, CollectibleRarity[]>();
    for (const group of normalized.drawGroups) {
      const groupSelected: CollectibleRarity[] = [];
      const groupResult = selectedByGroup.get(group.order) ?? groupSelected;
      for (const guarantee of group.guarantees) {
        for (let count = 0; count < guarantee.minimumCount; count += 1) {
          const candidates = packCandidatesForGroup(
            group,
            options.candidates,
            guarantee.rarity
          ).filter(
            (candidate) =>
              normalized.duplicatePolicy === "allow" ||
              !selected.has(candidate.cardTemplateId)
          );
          const choice = chooseWeighted(candidates, options.random);
          if (!choice) {
            continue;
          }
          selected.add(choice.cardTemplateId);
          groupResult.push(choice.rarity);
          outcomesByCardTemplate[choice.cardTemplateId] =
            (outcomesByCardTemplate[choice.cardTemplateId] ?? 0) + 1;
          outcomesByRarity[choice.rarity] += 1;
        }
      }
      while (groupResult.length < group.drawCount) {
        const rarityEntries = group.rarityWeights
          .map((entry) => ({ ...entry }))
          .filter(({ rarity }) =>
            packCandidatesForGroup(group, options.candidates, rarity).some(
              (candidate) =>
                normalized.duplicatePolicy === "allow" ||
                !selected.has(candidate.cardTemplateId)
            )
          );
        const selectedRarity = chooseWeighted(rarityEntries, options.random);
        const available = selectedRarity
          ? packCandidatesForGroup(
              group,
              options.candidates,
              selectedRarity.rarity
            ).filter(
              (candidate) =>
                normalized.duplicatePolicy === "allow" ||
                !selected.has(candidate.cardTemplateId)
            )
          : [];
        const choice = chooseWeighted(available, options.random);
        if (!choice) {
          break;
        }
        selected.add(choice.cardTemplateId);
        groupResult.push(choice.rarity);
        outcomesByCardTemplate[choice.cardTemplateId] =
          (outcomesByCardTemplate[choice.cardTemplateId] ?? 0) + 1;
        outcomesByRarity[choice.rarity] += 1;
      }
      selectedByGroup.set(group.order, groupResult);
      for (const guarantee of group.guarantees) {
        guaranteeChecks += 1;
        const count = groupResult.filter(
          (rarity) => rarity === guarantee.rarity
        ).length;
        if (count < guarantee.minimumCount) {
          guaranteeFailures += 1;
        }
      }
    }
  }
  return {
    draws: Object.values(outcomesByCardTemplate).reduce(
      (sum, count) => sum + count,
      0
    ),
    guaranteeChecks,
    guaranteeFailures,
    iterations,
    outcomesByCardTemplate,
    outcomesByRarity,
  };
}

export const simulatePack = simulatePackRevision;
export const runPackSimulation = simulatePackRevision;
export const simulatePackRevisionAggregates = simulatePackRevision;
export const normalizePackConfiguration = normalizePackRevisionDraft;
export const packRevisionSchema = packRevisionDraftSchema;
export const packTemplateSchema = packTemplateDraftSchema;
export const drawGroupSchema = packDrawGroupSchema;

export const packPublicCardSchema = z
  .object({
    characterName: z.string(),
    disabled: z.boolean(),
    gameName: z.string(),
    id: idSchema,
    rarity: cardRaritySchema,
    seriesName: z.string(),
  })
  .strict();
export type PackPublicCard = z.infer<typeof packPublicCardSchema>;

export const packPublicRevisionSchema = z
  .object({
    bindingPolicy: packBindingPolicySchema,
    cardCount: z.number().int().positive().max(PACK_MAX_CARD_COUNT),
    duplicatePolicy: packDuplicatePolicySchema,
    guarantees: z.array(packGuaranteeSchema),
    possiblePool: z.array(packPublicCardSchema),
    publishedAt: z.string().datetime().nullable(),
    revision: z.number().int().positive(),
    unavailableCards: z.array(packPublicCardSchema),
  })
  .strict();
export type PackPublicRevision = z.infer<typeof packPublicRevisionSchema>;

export const packPublicTemplateSchema = z
  .object({
    assetObjectKey: z.string().min(1),
    description: z.string(),
    id: idSchema,
    lifecycle: packLifecycleSchema,
    name: z.string(),
    revision: packPublicRevisionSchema,
  })
  .strict();
export type PackPublicTemplate = z.infer<typeof packPublicTemplateSchema>;

/**
 * Collection ordering is intentionally finite and cursor-friendly. Every
 * service ordering pairs the selected value with the authoritative instance
 * identity so inserting an equal-valued item cannot duplicate or skip rows.
 */
export const COLLECTIBLE_COLLECTION_SORTS = [
  "newest",
  "rarity",
  "game",
  "character",
  "series",
  "edition",
  "limited",
  "transferability",
  "mint",
  "for-sale",
] as const;
export type CollectibleCollectionSort =
  (typeof COLLECTIBLE_COLLECTION_SORTS)[number];
export const collectibleCollectionSortSchema = z.enum(
  COLLECTIBLE_COLLECTION_SORTS
);

/**
 * A public sale link is resolved by the future Black Market service. Profile
 * and collection readers may carry it, but they never infer sale state from
 * custody, trade, or gift rows.
 */
export const publicCollectibleSaleSchema = z
  .object({
    isBundle: z.boolean(),
    listingId: z.string().trim().min(1).max(200),
    listingUrl: z.string().trim().min(1).max(500),
  })
  .strict();
export type PublicCollectibleSale = z.infer<typeof publicCollectibleSaleSchema>;

/** Public card fields are deliberately independent from ownership history. */
export const publicCardInstanceSchema = z
  .object({
    availability: z.enum(["active", "frozen"]),
    binding: collectibleBindingSchema,
    characterName: z.string(),
    edition: z.string().nullable(),
    forSale: z.boolean(),
    gameName: z.string(),
    id: idSchema,
    limited: z.boolean(),
    lifetimeSupplyCeiling: z.number().int().positive().nullable(),
    listingIsBundle: z.boolean().optional(),
    listingId: z.string().trim().min(1).max(200).optional(),
    listingUrl: z.string().trim().min(1).max(500).nullable().optional(),
    mintDisplay: z.string().trim().min(1).max(64),
    mintNumber: z.number().int().positive(),
    rarity: cardRaritySchema,
    seriesName: z.string(),
    template: cardPublicTemplateSchema,
    templateId: idSchema,
  })
  .strict();
export type PublicCardInstance = z.infer<typeof publicCardInstanceSchema>;

/**
 * Pack Instance identity, result identifiers, and issue references are never
 * part of this shape. A public pack is only a bounded presentation summary.
 */
export const publicPackInstanceSchema = z
  .object({
    availability: z.enum(["active", "frozen"]),
    binding: collectibleBindingSchema,
    disabled: z.boolean().optional(),
    forSale: z.boolean(),
    issuedAt: z.date(),
    listingIsBundle: z.boolean().optional(),
    listingId: z.string().trim().min(1).max(200).optional(),
    listingUrl: z.string().trim().min(1).max(500).nullable().optional(),
    revision: z.number().int().positive(),
    templateAssetObjectKey: z.string().min(1),
    templateId: idSchema,
    templateName: z.string(),
  })
  .strict();
export type PublicPackInstance = z.infer<typeof publicPackInstanceSchema>;

export const publicCollectionPageSchema = z
  .object({
    items: z.array(
      z.union([publicCardInstanceSchema, publicPackInstanceSchema])
    ),
    nextCursor: z.string().nullable(),
    visible: z.boolean(),
  })
  .strict();
export type PublicCollectionPage = z.infer<typeof publicCollectionPageSchema>;
