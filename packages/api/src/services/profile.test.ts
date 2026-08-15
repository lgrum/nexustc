import {
  getProfileActivityVisibility,
  isProfileActivityPublic,
  normalizeProfileVisibilityConfig,
  PROFILE_DEFAULTS,
  PROFILE_VISIBILITY_DEFAULTS,
} from "@repo/shared/profile";

import {
  getProfileEntitlements,
  getProfileEntitlementsForTier,
  getProfileSettingsForRead,
  getPublicCurrentStreak,
  getPublicProfileActivityCounts,
  resolveIsolatedScalarProfileShowcases,
  resolveScalarProfileShowcases,
  resolveProfileVisibility,
} from "./profile";
import { resolveCurrentProfileDefaults } from "./profile-customization-manifest";

function resolveEnabledScalarProfileConfiguration() {
  const defaults = resolveCurrentProfileDefaults();
  return {
    ...defaults,
    showcases: defaults.showcases.map((showcase) => ({
      ...showcase,
      enabled: ["xp", "streak", "eteris"].includes(showcase.type),
    })),
  };
}

describe(resolveScalarProfileShowcases, () => {
  it("exposes only the public scalar field sets and derives streak milestones", () => {
    const result = resolveScalarProfileShowcases(
      resolveEnabledScalarProfileConfiguration(),
      {
        currentStreak: 12,
        progression: {
          currentLevelXp: 14,
          level: 8,
          nextLevelRequirement: 80,
          progress: 0.175,
          xpRemaining: 66,
        },
        publicWallet: { balance: "420" },
      }
    );

    expect(
      result.filter(({ type }) => ["xp", "streak", "eteris"].includes(type))
    ).toEqual([
      {
        accountLevel: 8,
        currentLevelXp: 14,
        nextLevelRequirement: 80,
        order: 3,
        progress: 0.175,
        rendererKey: "xp",
        type: "xp",
        variant: "standard",
        xpRemaining: 66,
      },
      {
        currentStreak: 12,
        nextMilestone: 30,
        order: 4,
        rendererKey: "streak",
        type: "streak",
        variant: "standard",
      },
      {
        balance: "420",
        order: 5,
        rendererKey: "eteris",
        type: "eteris",
        variant: "standard",
      },
    ]);
  });

  it("omits disabled or unavailable scalar sources instead of returning error cards", () => {
    const defaults = resolveEnabledScalarProfileConfiguration();
    const configuration = {
      ...defaults,
      showcases: defaults.showcases.map((showcase) =>
        showcase.type === "xp" ? { ...showcase, enabled: false } : showcase
      ),
    };
    expect(
      resolveScalarProfileShowcases(configuration, {
        currentStreak: null,
        progression: {
          currentLevelXp: 0,
          level: 1,
          nextLevelRequirement: 67,
          progress: 0,
          xpRemaining: 67,
        },
        publicWallet: null,
      })
    ).toEqual([]);
  });
});

describe(resolveIsolatedScalarProfileShowcases, () => {
  it("omits a failed source without blocking unrelated scalar showcases", async () => {
    await expect(
      resolveIsolatedScalarProfileShowcases(
        Promise.resolve(resolveEnabledScalarProfileConfiguration()),
        {
          currentStreak: Promise.resolve(12),
          progression: Promise.reject(new Error("progression unavailable")),
          publicWallet: Promise.resolve({ balance: "420" }),
        }
      )
    ).resolves.toEqual([
      expect.objectContaining({ currentStreak: 12, type: "streak" }),
      expect.objectContaining({ balance: "420", type: "eteris" }),
    ]);
  });

  it("returns no scalar data when effective configuration cannot be resolved", async () => {
    await expect(
      resolveIsolatedScalarProfileShowcases(
        Promise.reject(new Error("configuration unavailable")),
        {
          currentStreak: Promise.resolve(12),
          progression: Promise.resolve({
            currentLevelXp: 14,
            level: 8,
            nextLevelRequirement: 80,
            progress: 0.175,
            xpRemaining: 66,
          }),
          publicWallet: Promise.resolve({ balance: "420" }),
        }
      )
    ).resolves.toEqual([]);
  });
});

describe(getProfileSettingsForRead, () => {
  it("returns virtual defaults without creating a profile settings row", async () => {
    const insert = vi.fn();
    const db = {
      insert,
      query: {
        profileSettings: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };

    await expect(
      getProfileSettingsForRead(db as never, "user-1")
    ).resolves.toMatchObject({
      bannerAssetId: null,
      bannerColor: PROFILE_DEFAULTS.bannerColor,
      bannerMode: "color",
      visibilityConfig: PROFILE_VISIBILITY_DEFAULTS,
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

const streak = vi.hoisted(() => ({ getStreakState: vi.fn() }));
vi.mock("./streak", () => ({ getStreakState: streak.getStreakState }));

function createCountQuery(rows: { count: number }[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  return query;
}

describe(normalizeProfileVisibilityConfig, () => {
  it("keeps legacy profile rows public by default", () => {
    expect(normalizeProfileVisibilityConfig({ reserved: {} })).toEqual(
      PROFILE_VISIBILITY_DEFAULTS
    );
    expect(resolveProfileVisibility(null)).toEqual(PROFILE_VISIBILITY_DEFAULTS);
  });

  it("preserves explicit privacy choices and valid reserved flags", () => {
    expect(
      normalizeProfileVisibilityConfig({
        favorites: false,
        reserved: { futureFlag: true, invalid: "yes" },
      })
    ).toEqual({
      favorites: false,
      reserved: { futureFlag: true },
      reviews: true,
      streak: false,
    });
  });

  it("keeps streaks private for missing and malformed legacy values", () => {
    expect(normalizeProfileVisibilityConfig({}).streak).toBe(false);
    expect(normalizeProfileVisibilityConfig({ streak: "yes" }).streak).toBe(
      false
    );
    expect(normalizeProfileVisibilityConfig({ streak: true }).streak).toBe(
      true
    );
  });

  it("exposes only resolved activity fields to public profile callers", () => {
    const stored = {
      favorites: true,
      reserved: { futureFlag: false },
      reviews: false,
    };

    expect(getProfileActivityVisibility(stored)).toEqual({
      favorites: true,
      reviews: false,
    });
    expect(isProfileActivityPublic(stored, "favorites")).toBe(true);
    expect(isProfileActivityPublic(stored, "reviews")).toBe(false);
  });
});

describe(getPublicProfileActivityCounts, () => {
  it("does not calculate or expose counts for hidden collections", async () => {
    const select = vi.fn();

    await expect(
      getPublicProfileActivityCounts({ select } as never, "user-1", {
        favorites: false,
        reviews: false,
      })
    ).resolves.toEqual({ favorites: null, reviews: null });
    expect(select).not.toHaveBeenCalled();
  });

  it("returns only public-catalog counts for visible collections", async () => {
    const favoriteQuery = createCountQuery([{ count: 3 }]);
    const reviewQuery = createCountQuery([{ count: 2 }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(favoriteQuery)
      .mockReturnValueOnce(reviewQuery);

    await expect(
      getPublicProfileActivityCounts(
        { select } as never,
        "user-1",
        { favorites: true, reviews: true },
        new Date("2026-07-19T00:00:00.000Z")
      )
    ).resolves.toEqual({ favorites: 3, reviews: 2 });
    expect(select).toHaveBeenCalledTimes(2);
    expect(favoriteQuery.innerJoin).toHaveBeenCalledTimes(2);
    expect(reviewQuery.innerJoin).toHaveBeenCalledTimes(2);
    expect(favoriteQuery.where).toHaveBeenCalledOnce();
    expect(reviewQuery.where).toHaveBeenCalledOnce();
  });
});

describe(getPublicCurrentStreak, () => {
  it("does not expose streaks for actively banned accounts", async () => {
    const db = {
      query: { user: { findFirst: vi.fn().mockResolvedValue(null) } },
    };

    await expect(
      getPublicCurrentStreak(
        db as never,
        "user-1",
        { favorites: true, reserved: {}, reviews: true, streak: true },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toBeNull();
    expect(streak.getStreakState).not.toHaveBeenCalled();
  });
});

describe(getProfileEntitlementsForTier, () => {
  it("keeps uploaded and animated banner thresholds distinct", () => {
    const level3 = getProfileEntitlementsForTier("level3");
    const level5 = getProfileEntitlementsForTier("level5");
    const level8 = getProfileEntitlementsForTier("level8");

    expect(level3.canUseAnimatedAvatar).toBe(true);
    expect(level3.canUseUploadedBanner).toBe(false);

    expect(level5.canUseUploadedBanner).toBe(true);
    expect(level5.canUseAnimatedBanner).toBe(false);

    expect(level8.canUseUploadedBanner).toBe(true);
    expect(level8.canUseAnimatedBanner).toBe(true);
  });
});

describe(getProfileEntitlements, () => {
  it("treats herald as unrestricted staff for profile customization", async () => {
    const entitlements = await getProfileEntitlements(
      {} as Parameters<typeof getProfileEntitlements>[0],
      "user_123",
      "herald"
    );

    expect(entitlements).toMatchObject({
      canUseAnimatedAvatar: true,
      canUseAnimatedBanner: true,
      canUseUploadedBanner: true,
      overrideSource: "staff",
    });
  });
});
