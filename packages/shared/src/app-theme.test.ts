import { describe, expect, it } from "vitest";

import {
  APP_THEME_CATALOG,
  APP_THEME_REQUIRED_TIER,
  appThemeIdSchema,
  DEFAULT_APP_THEME_ID,
  resolveAppTheme,
} from "./app-theme";

describe("App Theme", () => {
  it("defines the initial catalog with one default and one premium theme", () => {
    expect(APP_THEME_CATALOG).toEqual([
      expect.objectContaining({ id: "predeterminado", premium: false }),
      expect.objectContaining({ id: "ceniza-solar", premium: true }),
    ]);
    expect(new Set(APP_THEME_CATALOG.map(({ id }) => id)).size).toBe(2);
    expect(DEFAULT_APP_THEME_ID).toBe("predeterminado");
    expect(APP_THEME_REQUIRED_TIER).toBeNull();
    expect(appThemeIdSchema.safeParse("inventado").success).toBe(false);
  });

  it.each(["admin", "owner"] as const)(
    "grants %s the staff-only catalog and premium theme",
    (role) => {
      expect(
        resolveAppTheme({
          requiredTier: null,
          role,
          selectedTheme: "ceniza-solar",
          tier: "none",
        })
      ).toEqual({
        catalogVisible: true,
        effectiveTheme: "ceniza-solar",
        premiumEligible: true,
        requiredTier: null,
        selectedTheme: "ceniza-solar",
      });
    }
  );

  it.each(["user", "moderator"] as const)(
    "keeps the unset-threshold catalog hidden from %s",
    (role) => {
      expect(
        resolveAppTheme({
          requiredTier: null,
          role,
          selectedTheme: "ceniza-solar",
          tier: "level100",
        })
      ).toEqual(
        expect.objectContaining({
          catalogVisible: false,
          effectiveTheme: "predeterminado",
          premiumEligible: false,
          selectedTheme: "ceniza-solar",
        })
      );
    }
  );

  it("uses the canonical Patron hierarchy once a threshold is configured", () => {
    expect(
      resolveAppTheme({
        requiredTier: "level5",
        role: "user",
        selectedTheme: "ceniza-solar",
        tier: "level3",
      }).effectiveTheme
    ).toBe("predeterminado");
    expect(
      resolveAppTheme({
        requiredTier: "level5",
        role: "user",
        selectedTheme: "ceniza-solar",
        tier: "level5",
      }).effectiveTheme
    ).toBe("ceniza-solar");
  });

  it("falls back from an unknown stored ID without retaining it", () => {
    expect(
      resolveAppTheme({
        requiredTier: null,
        role: "owner",
        selectedTheme: "eliminado",
        tier: "none",
      })
    ).toEqual(
      expect.objectContaining({
        effectiveTheme: "predeterminado",
        selectedTheme: "predeterminado",
      })
    );
  });
});
