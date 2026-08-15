import { normalizeProfileVisibilityConfig } from "@repo/shared/profile";
import {
  EMPTY_PROFILE_DECORATIONS,
  PROFILE_DECORATION_SLOTS,
  PROFILE_DEFAULT_LAYOUT_KEY,
  PROFILE_DEFAULT_SKIN_KEY,
  PROFILE_DEFAULT_SKIN_TOKENS,
} from "@repo/shared/profile-customization";
import type {
  EffectiveProfileManifest,
  FavoriteGameProjection,
  ProfileCustomizationDraft,
  ProfileDecorationCatalogEntry,
  ProfileSkinCatalogEntry,
} from "@repo/shared/profile-customization";

import { PROFILE_SHOWCASE_REGISTRY } from "./profile-showcase-registry";

export function resolveVirtualDefaultProfileConfiguration(
  rawVisibility: unknown,
  eterisPublic = false
) {
  const visibility = normalizeProfileVisibilityConfig(rawVisibility);

  return {
    decorations: EMPTY_PROFILE_DECORATIONS,
    isVirtual: true as const,
    layoutKey: PROFILE_DEFAULT_LAYOUT_KEY,
    showcases: PROFILE_SHOWCASE_REGISTRY.map((definition, order) => ({
      enabled:
        definition.key === "library"
          ? visibility.favorites
          : definition.key === "reviews"
            ? visibility.reviews
            : definition.key === "streak"
              ? visibility.streak
              : definition.key === "eteris"
                ? eterisPublic
                : false,
      instanceId: `virtual:${definition.key}`,
      order,
      payload: definition.defaultPayload,
      payloadSchemaVersion: definition.payloadSchemaVersion,
      type: definition.key,
      variant: "standard" as const,
    })),
    skinKey: PROFILE_DEFAULT_SKIN_KEY,
  };
}

export function resolveCurrentProfileDefaults() {
  return {
    decorations: EMPTY_PROFILE_DECORATIONS,
    isVirtual: true as const,
    layoutKey: PROFILE_DEFAULT_LAYOUT_KEY,
    showcases: PROFILE_SHOWCASE_REGISTRY.map((definition, order) => ({
      enabled: definition.key === "library" || definition.key === "reviews",
      instanceId: `virtual:${definition.key}`,
      order,
      payload: definition.defaultPayload,
      payloadSchemaVersion: definition.payloadSchemaVersion,
      type: definition.key,
      variant: "standard" as const,
    })),
    skinKey: PROFILE_DEFAULT_SKIN_KEY,
  };
}

export function resolveVirtualDefaultManifest(
  rawVisibility: unknown,
  activityCounts: { favorites: number | null; reviews: number | null }
): EffectiveProfileManifest {
  return resolveProfileConfigurationManifest(
    resolveVirtualDefaultProfileConfiguration(rawVisibility),
    activityCounts
  );
}

export function resolveProfileConfigurationManifest(
  configuration: ProfileCustomizationDraft,
  activityCounts: { favorites: number | null; reviews: number | null },
  favoriteGames: FavoriteGameProjection[] = [],
  skins: ProfileSkinCatalogEntry[] = [],
  decorations: ProfileDecorationCatalogEntry[] = []
): EffectiveProfileManifest {
  const showcases: EffectiveProfileManifest["showcases"] = [];
  for (const showcase of configuration.showcases) {
    const definition = PROFILE_SHOWCASE_REGISTRY.find(
      ({ key }) => key === showcase.type
    );
    if (!definition) {
      continue;
    }
    if (definition.key === "favorite-games") {
      if (showcase.enabled && favoriteGames.length > 0) {
        showcases.push({
          games: favoriteGames,
          order: showcase.order,
          rendererKey: "favorite-games",
          type: "favorite-games",
          variant: showcase.variant,
        });
      }
      continue;
    }
    if (
      definition.key === "xp" ||
      definition.key === "streak" ||
      definition.key === "eteris"
    ) {
      continue;
    }
    const count =
      definition.key === "library"
        ? activityCounts.favorites
        : activityCounts.reviews;
    if (!(showcase.enabled && count && count > 0)) {
      continue;
    }
    showcases.push({
      order: showcase.order,
      rendererKey: definition.rendererKey,
      type: definition.key,
      variant: showcase.variant,
    });
  }

  const skin = skins.find(({ key }) => key === configuration.skinKey);
  return {
    decorations: PROFILE_DECORATION_SLOTS.flatMap((slot) => {
      const key = configuration.decorations[slot];
      const decoration = key
        ? decorations.find((entry) => entry.key === key && entry.slot === slot)
        : undefined;
      return decoration
        ? [
            {
              effectKey: decoration.effectKey,
              fontKey: decoration.fontKey,
              mediaAssetKey: decoration.mediaAssetKey,
              reducedMotion: decoration.reducedMotion,
              slot: decoration.slot,
            },
          ]
        : [];
    }),
    layout: { rendererKey: configuration.layoutKey },
    showcases,
    skin: {
      backgroundAssetKey: skin?.backgroundAssetKey ?? null,
      key: skin?.key ?? PROFILE_DEFAULT_SKIN_KEY,
      tokens: skin?.tokens ?? PROFILE_DEFAULT_SKIN_TOKENS,
    },
  };
}

export function resolvePublicProfileManifest({
  activityCounts,
  customizationEnabled,
  favoriteGames = [],
  decorations = [],
  selectedConfiguration,
  skins = [],
  visibility,
}: {
  activityCounts: { favorites: number | null; reviews: number | null };
  customizationEnabled: boolean;
  favoriteGames?: FavoriteGameProjection[];
  decorations?: ProfileDecorationCatalogEntry[];
  selectedConfiguration?: ProfileCustomizationDraft;
  skins?: ProfileSkinCatalogEntry[];
  visibility: unknown;
}) {
  if (!customizationEnabled) {
    return;
  }

  return selectedConfiguration
    ? resolveProfileConfigurationManifest(
        selectedConfiguration,
        activityCounts,
        favoriteGames,
        skins,
        decorations
      )
    : resolveVirtualDefaultManifest(visibility, activityCounts);
}
