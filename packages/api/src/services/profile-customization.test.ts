import { PROFILE_VISIBILITY_DEFAULTS } from "@repo/shared/profile";
import { EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS } from "@repo/shared/profile-customization";

import {
  canRenderPublicProfileShowcase,
  ProfileCustomizationError,
  prepareProfileCustomizationSave,
  PROFILE_LAYOUT_REGISTRY,
} from "./profile-customization";
import {
  resolveCurrentProfileDefaults,
  resolvePublicProfileManifest,
  resolveVirtualDefaultManifest,
  resolveVirtualDefaultProfileConfiguration,
} from "./profile-customization-manifest";
import { resolveFavoriteGamesCapacity } from "./profile-favorite-games";
import {
  migrateCardShowcasePayload,
  migrateRareCardShowcasePayload,
  migrateUnopenedPackShowcasePayload,
  PROFILE_SHOWCASE_REGISTRY,
} from "./profile-showcase-registry";

function createShowcaseEntitlementDb({
  enabled = true,
  isActive = true,
  materialized = true,
  requiredTier = "none",
  role = "user",
  tier = "none",
}: {
  enabled?: boolean;
  isActive?: boolean;
  materialized?: boolean;
  requiredTier?: "none" | "level1" | "level5";
  role?: string;
  tier?: "none" | "level1" | "level5";
} = {}) {
  return {
    query: {
      patron: {
        findFirst: vi.fn().mockResolvedValue({
          isActivePatron: tier !== "none",
          tier,
        }),
      },
      profileCustomization: {
        findFirst: vi
          .fn()
          .mockResolvedValue(materialized ? { userId: "user-1" } : null),
      },
      profileShowcaseConfig: {
        findFirst: vi.fn().mockResolvedValue({ enabled }),
      },
      profileShowcaseType: {
        findFirst: vi.fn().mockResolvedValue({ isActive, requiredTier }),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ role }) },
    },
  } as never;
}

describe(canRenderPublicProfileShowcase, () => {
  it("requires both the saved enabled state and the effective VIP entitlement", async () => {
    await expect(
      canRenderPublicProfileShowcase(
        createShowcaseEntitlementDb({ enabled: false }),
        "user-1",
        "library"
      )
    ).resolves.toBe(false);
    await expect(
      canRenderPublicProfileShowcase(
        createShowcaseEntitlementDb({ requiredTier: "level5" }),
        "user-1",
        "library"
      )
    ).resolves.toBe(false);
    await expect(
      canRenderPublicProfileShowcase(
        createShowcaseEntitlementDb({
          requiredTier: "level5",
          tier: "level5",
        }),
        "user-1",
        "library"
      )
    ).resolves.toBe(true);
  });

  it("uses the code-owned enabled default before customization materializes", async () => {
    await expect(
      canRenderPublicProfileShowcase(
        createShowcaseEntitlementDb({ enabled: false, materialized: false }),
        "user-1",
        "reviews"
      )
    ).resolves.toBe(true);
  });
});

describe("complete profile customization saves", () => {
  const defaults = resolveCurrentProfileDefaults();
  const { isVirtual: _isVirtual, ...defaultDraft } = defaults;
  const draft = {
    ...defaultDraft,
    showcases: defaults.showcases.map((showcase) =>
      showcase.type === "reviews"
        ? { ...showcase, enabled: false, variant: "compact" as const }
        : showcase
    ),
  };
  const library = draft.showcases[0]!;
  const reviews = draft.showcases[1]!;
  const favoriteGames = draft.showcases[2]!;

  it("accepts one complete ordered configuration and derives canonical visibility", () => {
    expect(prepareProfileCustomizationSave(draft)).toEqual({
      configuration: draft,
      visibility: {
        eteris: false,
        favorites: true,
        reviews: false,
        streak: false,
      },
    });
  });

  it.each(["stack", "grid", "spotlight"] as const)(
    "accepts the %s layout without changing supported Showcase variants",
    (layoutKey) => {
      expect(
        prepareProfileCustomizationSave({
          ...draft,
          layoutKey,
          showcases: [
            { ...library, variant: "featured" },
            { ...reviews, variant: "compact" },
            favoriteGames,
            ...draft.showcases.slice(3),
          ],
        }).configuration.layoutKey
      ).toBe(layoutKey);
    }
  );

  it("resets to current code-owned defaults instead of legacy visibility", () => {
    expect(
      resolveCurrentProfileDefaults().showcases.map(({ enabled }) => enabled)
    ).toEqual([true, true, false, false, false, false, false, false, false]);
  });

  it("rejects duplicate Showcase types without partially preparing a save", () => {
    expect(() =>
      prepareProfileCustomizationSave({
        ...draft,
        showcases: [
          library,
          { ...reviews, type: "library" },
          favoriteGames,
          ...draft.showcases.slice(3),
        ],
      })
    ).toThrow(ProfileCustomizationError);
  });

  it("migrates old payloads in memory and rejects unknown versions in isolation", () => {
    expect(
      prepareProfileCustomizationSave({
        ...draft,
        showcases: [
          { ...library, payloadSchemaVersion: 1 },
          reviews,
          favoriteGames,
          ...draft.showcases.slice(3),
        ],
      }).configuration.showcases[0]?.payloadSchemaVersion
    ).toBe(1);

    expect(() =>
      prepareProfileCustomizationSave({
        ...draft,
        showcases: [
          { ...library, payloadSchemaVersion: 99 },
          reviews,
          favoriteGames,
          ...draft.showcases.slice(3),
        ],
      })
    ).toThrow(ProfileCustomizationError);
  });
});

describe("Profile Showcase registry", () => {
  it("owns the first automatic public collections", () => {
    expect(
      PROFILE_SHOWCASE_REGISTRY.map((definition) => definition.key)
    ).toEqual([
      "library",
      "reviews",
      "favorite-games",
      "xp",
      "streak",
      "eteris",
      "card",
      "rare-card",
      "unopened-pack",
    ]);
    expect(
      PROFILE_SHOWCASE_REGISTRY.every(
        (definition) =>
          definition.payloadSchemaVersion === 1 &&
          definition.supportedVariants.includes("standard") &&
          (!("source" in definition) || definition.source.standardPageSize > 0)
      )
    ).toBe(true);
  });

  it("migrates legacy collectible payload aliases into canonical version one data", () => {
    expect(
      migrateCardShowcasePayload(1, {
        edition: " Primera ",
        gameName: "Metroid",
        selectedCardInstanceIds: [" card-1 "],
        series: "series-1",
      })
    ).toEqual({
      cardInstanceIds: ["card-1"],
      filters: {
        edition: "Primera",
        game: "Metroid",
        seriesId: "series-1",
      },
    });
    expect(
      migrateRareCardShowcasePayload(1, {
        filters: { game: "Metroid" },
      })
    ).toEqual({
      filters: {
        ...EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
        game: "Metroid",
      },
    });
    expect(
      migrateUnopenedPackShowcasePayload(1, {
        packTemplateIds: ["pack-template-1", "pack-template-2"],
      })
    ).toEqual({ packTemplateId: "pack-template-1" });
    expect(() => migrateCardShowcasePayload(2, {})).toThrow();
  });
});

describe("Profile Layout registry", () => {
  it("owns stable renderer keys and Spanish catalog metadata with Stack protected", () => {
    expect(PROFILE_LAYOUT_REGISTRY).toEqual([
      expect.objectContaining({
        isProtectedDefault: true,
        key: "stack",
        name: "Pila",
      }),
      expect.objectContaining({
        isProtectedDefault: false,
        key: "grid",
        name: "Cuadrícula",
      }),
      expect.objectContaining({
        isProtectedDefault: false,
        key: "spotlight",
        name: "Foco",
      }),
    ]);
  });
});

describe(resolveVirtualDefaultProfileConfiguration, () => {
  it("derives virtual defaults from canonical legacy visibility", () => {
    expect(
      resolveVirtualDefaultProfileConfiguration({
        favorites: false,
        reserved: {},
        reviews: true,
        streak: false,
      })
    ).toEqual({
      decorations: {
        "ambient-effect": null,
        "avatar-frame": null,
        "nameplate-effect": null,
        "profile-frame": null,
      },
      isVirtual: true,
      layoutKey: "stack",
      showcases: [
        expect.objectContaining({ enabled: false, order: 0, type: "library" }),
        expect.objectContaining({ enabled: true, order: 1, type: "reviews" }),
        expect.objectContaining({
          enabled: false,
          order: 2,
          payload: { gameIds: [] },
          type: "favorite-games",
        }),
        expect.objectContaining({ enabled: false, order: 3, type: "xp" }),
        expect.objectContaining({ enabled: false, order: 4, type: "streak" }),
        expect.objectContaining({ enabled: false, order: 5, type: "eteris" }),
        expect.objectContaining({ enabled: false, order: 6, type: "card" }),
        expect.objectContaining({
          enabled: false,
          order: 7,
          type: "rare-card",
        }),
        expect.objectContaining({
          enabled: false,
          order: 8,
          type: "unopened-pack",
        }),
      ],
      skinKey: "default",
    });
  });

  it("uses safe defaults for malformed legacy visibility", () => {
    const configuration = resolveVirtualDefaultProfileConfiguration({
      favorites: "yes",
      reviews: null,
    });

    expect(configuration.showcases.map(({ enabled }) => enabled)).toEqual([
      PROFILE_VISIBILITY_DEFAULTS.favorites,
      PROFILE_VISIBILITY_DEFAULTS.reviews,
      false,
      false,
      PROFILE_VISIBILITY_DEFAULTS.streak,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("Favorite Games Showcase", () => {
  const favoriteDraft = resolveCurrentProfileDefaults();
  const [
    favoriteLibrary,
    favoriteReviews,
    favoriteGamesShowcase,
    ...scalarShowcases
  ] = favoriteDraft.showcases;
  it.each([
    ["none", 1],
    ["level1", 3],
    ["level5", 7],
    ["level12", 10],
  ] as const)("grants tier %s a capacity of %i", (tier, capacity) => {
    expect(resolveFavoriteGamesCapacity(tier, "user")).toBe(capacity);
  });

  it("gives VIP-bypassing staff full capacity", () => {
    expect(resolveFavoriteGamesCapacity("none", "moderator")).toBe(10);
  });

  it("accepts an ordered unique list and rejects duplicates or more than ten", () => {
    expect(
      prepareProfileCustomizationSave({
        ...favoriteDraft,
        showcases: [
          favoriteLibrary!,
          favoriteReviews!,
          {
            ...favoriteGamesShowcase!,
            payload: { gameIds: ["game-b", "game-a"] },
          },
          ...scalarShowcases,
        ],
      }).configuration.showcases[2]?.payload
    ).toEqual({ gameIds: ["game-b", "game-a"] });

    for (const gameIds of [
      ["game-a", "game-a"],
      Array.from({ length: 11 }, (_, index) => `game-${index}`),
    ]) {
      expect(() =>
        prepareProfileCustomizationSave({
          ...favoriteDraft,
          showcases: [
            favoriteLibrary!,
            favoriteReviews!,
            { ...favoriteGamesShowcase!, payload: { gameIds } },
            ...scalarShowcases,
          ],
        })
      ).toThrow(ProfileCustomizationError);
    }
  });
});

describe(resolveVirtualDefaultManifest, () => {
  it("omits private and empty collections while preserving canonical order", () => {
    expect(
      resolveVirtualDefaultManifest(
        { favorites: true, reviews: false },
        { favorites: 2, reviews: 4 }
      ).showcases
    ).toEqual([
      {
        order: 0,
        rendererKey: "library",
        type: "library",
        variant: "standard",
      },
    ]);

    expect(
      resolveVirtualDefaultManifest(
        { favorites: true, reviews: true },
        { favorites: 0, reviews: 1 }
      ).showcases.map(({ type }) => type)
    ).toEqual(["reviews"]);
  });
});

describe(resolvePublicProfileManifest, () => {
  it("preserves the legacy renderer contract while rollout is off", () => {
    expect(
      resolvePublicProfileManifest({
        activityCounts: { favorites: 2, reviews: 1 },
        customizationEnabled: false,
        visibility: { favorites: true, reviews: true },
      })
    ).toBeUndefined();
  });

  it("preserves the selected layout and canonical renderable order", () => {
    const selectedDraft = resolveCurrentProfileDefaults();
    const [library, reviews] = selectedDraft.showcases;
    const manifest = resolvePublicProfileManifest({
      activityCounts: { favorites: 2, reviews: 1 },
      customizationEnabled: true,
      selectedConfiguration: {
        ...selectedDraft,
        layoutKey: "spotlight",
        showcases: [
          { ...reviews!, enabled: false, order: 0 },
          { ...library!, order: 1, variant: "standard" },
        ],
      },
      visibility: {},
    });

    expect(manifest?.layout.rendererKey).toBe("spotlight");
    expect(manifest?.showcases.map(({ type }) => type)).toEqual(["library"]);
  });

  it("keeps ownership-dependent collectible entries out of the anonymous manifest", () => {
    const defaults = resolveCurrentProfileDefaults();
    const manifest = resolvePublicProfileManifest({
      activityCounts: { favorites: 0, reviews: 0 },
      customizationEnabled: true,
      selectedConfiguration: {
        ...defaults,
        showcases: defaults.showcases.map((showcase) =>
          showcase.type === "card" ? { ...showcase, enabled: true } : showcase
        ),
      },
      visibility: {},
    });

    expect(manifest?.showcases.some(({ type }) => type === "card")).toBe(false);
  });
});
