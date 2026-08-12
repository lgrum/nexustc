import {
  getProfileActivityVisibility,
  isProfileActivityPublic,
  normalizeProfileVisibilityConfig,
  PROFILE_VISIBILITY_DEFAULTS,
} from "@repo/shared/profile";

import {
  getProfileEntitlements,
  getProfileEntitlementsForTier,
  getPublicCurrentStreak,
  getPublicProfileActivityCounts,
  resolveProfileVisibility,
} from "./profile";

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
