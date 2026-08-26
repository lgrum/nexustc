import {
  automaticShowcasePayloadSchema,
  cardShowcasePayloadSchema,
  EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
  favoriteGamesShowcasePayloadSchema,
  PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES,
  PROFILE_SHOWCASE_PAGE_SIZES,
  PROFILE_SHOWCASE_VARIANTS_BY_TYPE,
  profileCollectibleShowcaseFiltersSchema,
  rareCardShowcasePayloadSchema,
  unopenedPackShowcasePayloadSchema,
} from "@repo/shared/profile-customization";
import type {
  ProfileShowcaseTypeKey,
  ProfileShowcaseVariant,
} from "@repo/shared/profile-customization";

type ShowcaseDefinition = {
  capacity?: number;
  defaultPayload: Record<string, unknown>;
  description: string;
  isEmpty: (count: number) => boolean;
  key: ProfileShowcaseTypeKey;
  label: string;
  migratePayload: (
    version: number,
    payload: unknown
  ) => Record<string, unknown>;
  payloadSchemaVersion: 1;
  rendererKey: ProfileShowcaseTypeKey;
  source?: {
    compactPageSize: number;
    loaderProcedure: "user.getUserBookmarks" | "rating.getByUserId";
    standardPageSize: number;
    visibilityKey: "favorites" | "reviews";
  };
  supportedVariants: readonly ProfileShowcaseVariant[];
};

function migrateAutomaticPayload(version: number, payload: unknown) {
  if (version !== 1) {
    throw new Error(
      `Unsupported automatic Showcase payload version: ${version}`
    );
  }
  return automaticShowcasePayloadSchema.parse(payload);
}

export function migrateFavoriteGamesPayload(version: number, payload: unknown) {
  if (version !== 1) {
    throw new Error(`Unsupported Favorite Games payload version: ${version}`);
  }
  return favoriteGamesShowcasePayloadSchema.parse(payload);
}

function normalizeFilters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS;
  }
  const raw = value as Record<string, unknown>;
  return profileCollectibleShowcaseFiltersSchema.parse({
    edition: raw.edition ?? null,
    game: raw.game ?? raw.gameName ?? null,
    seriesId: raw.seriesId ?? raw.series ?? null,
  });
}

function readPayloadObject(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Showcase payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

export function migrateCardShowcasePayload(version: number, payload: unknown) {
  if (version !== 1) {
    throw new Error(`Unsupported Card Showcase payload version: ${version}`);
  }
  const raw = readPayloadObject(payload);
  const ids = raw.cardInstanceIds ?? raw.selectedCardInstanceIds ?? [];
  return cardShowcasePayloadSchema.parse({
    cardInstanceIds: ids,
    filters: normalizeFilters(raw.filters ?? raw),
  });
}

export function migrateRareCardShowcasePayload(
  version: number,
  payload: unknown
) {
  if (version !== 1) {
    throw new Error(
      `Unsupported Rare Card Showcase payload version: ${version}`
    );
  }
  const raw = readPayloadObject(payload);
  return rareCardShowcasePayloadSchema.parse({
    filters: normalizeFilters(raw.filters ?? raw),
  });
}

export function migrateUnopenedPackShowcasePayload(
  version: number,
  payload: unknown
) {
  if (version !== 1) {
    throw new Error(
      `Unsupported Unopened Pack Showcase payload version: ${version}`
    );
  }
  const raw = readPayloadObject(payload);
  const { packTemplateIds } = raw;
  const packTemplateId =
    raw.packTemplateId ??
    (Array.isArray(packTemplateIds) ? packTemplateIds[0] : null);
  return unopenedPackShowcasePayloadSchema.parse({
    packTemplateId: packTemplateId ?? null,
  });
}

export const PROFILE_SHOWCASE_REGISTRY = [
  {
    defaultPayload: {},
    description: "Juegos y cómics guardados públicamente.",
    isEmpty: (count) => count === 0,
    key: "library",
    label: "Biblioteca",
    migratePayload: migrateAutomaticPayload,
    payloadSchemaVersion: 1,
    rendererKey: "library",
    source: {
      compactPageSize: PROFILE_SHOWCASE_PAGE_SIZES.library.compact,
      loaderProcedure: "user.getUserBookmarks",
      standardPageSize: PROFILE_SHOWCASE_PAGE_SIZES.library.standard,
      visibilityKey: "favorites",
    },
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.library,
  },
  {
    defaultPayload: {},
    description: "Opiniones públicas en orden cronológico inverso.",
    isEmpty: (count) => count === 0,
    key: "reviews",
    label: "Reseñas",
    migratePayload: migrateAutomaticPayload,
    payloadSchemaVersion: 1,
    rendererKey: "reviews",
    source: {
      compactPageSize: PROFILE_SHOWCASE_PAGE_SIZES.reviews.compact,
      loaderProcedure: "rating.getByUserId",
      standardPageSize: PROFILE_SHOWCASE_PAGE_SIZES.reviews.standard,
      visibilityKey: "reviews",
    },
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.reviews,
  },
  {
    defaultPayload: { gameIds: [] },
    description: "Una lista personal y ordenada de juegos favoritos.",
    isEmpty: (count) => count === 0,
    key: "favorite-games",
    label: "Juegos favoritos",
    migratePayload: migrateFavoriteGamesPayload,
    payloadSchemaVersion: 1,
    rendererKey: "favorite-games",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE["favorite-games"],
  },
  {
    defaultPayload: {},
    description: "Nivel y avance dentro del nivel actual.",
    isEmpty: (count) => count === 0,
    key: "xp",
    label: "Experiencia",
    migratePayload: migrateAutomaticPayload,
    payloadSchemaVersion: 1,
    rendererKey: "xp",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.xp,
  },
  {
    defaultPayload: {},
    description: "Racha actual e hitos derivados de ese valor.",
    isEmpty: (count) => count === 0,
    key: "streak",
    label: "Racha",
    migratePayload: migrateAutomaticPayload,
    payloadSchemaVersion: 1,
    rendererKey: "streak",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.streak,
  },
  {
    defaultPayload: {},
    description: "Saldo público actual de Eteris.",
    isEmpty: (count) => count === 0,
    key: "eteris",
    label: "Eteris",
    migratePayload: migrateAutomaticPayload,
    payloadSchemaVersion: 1,
    rendererKey: "eteris",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.eteris,
  },
  {
    capacity: PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES.card,
    defaultPayload: {
      cardInstanceIds: [],
      filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
    },
    description: "Cartas elegidas de tu colección actual.",
    isEmpty: (count) => count === 0,
    key: "card",
    label: "Cartas destacadas",
    migratePayload: migrateCardShowcasePayload,
    payloadSchemaVersion: 1,
    rendererKey: "card",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE.card,
  },
  {
    capacity: PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES["rare-card"],
    defaultPayload: { filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS },
    description: "Las cartas más destacadas según un orden determinista.",
    isEmpty: (count) => count === 0,
    key: "rare-card",
    label: "Cartas raras",
    migratePayload: migrateRareCardShowcasePayload,
    payloadSchemaVersion: 1,
    rendererKey: "rare-card",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE["rare-card"],
  },
  {
    capacity: PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES["unopened-pack"],
    defaultPayload: { packTemplateId: null },
    description: "Packs sin abrir que conservas actualmente.",
    isEmpty: (count) => count === 0,
    key: "unopened-pack",
    label: "Packs sin abrir",
    migratePayload: migrateUnopenedPackShowcasePayload,
    payloadSchemaVersion: 1,
    rendererKey: "unopened-pack",
    supportedVariants: PROFILE_SHOWCASE_VARIANTS_BY_TYPE["unopened-pack"],
  },
] as const satisfies readonly ShowcaseDefinition[];
