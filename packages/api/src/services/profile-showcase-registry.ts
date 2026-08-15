import {
  automaticShowcasePayloadSchema,
  favoriteGamesShowcasePayloadSchema,
  PROFILE_SHOWCASE_PAGE_SIZES,
  PROFILE_SHOWCASE_VARIANTS_BY_TYPE,
} from "@repo/shared/profile-customization";
import type {
  ProfileShowcaseTypeKey,
  ProfileShowcaseVariant,
} from "@repo/shared/profile-customization";

type ShowcaseDefinition = {
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
] as const satisfies readonly ShowcaseDefinition[];
