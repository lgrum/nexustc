import { describe, expect, it } from "vitest";

import {
  APP_THEME_CATALOG,
  APP_THEME_REQUIRED_TIER,
  appThemeIdSchema,
  DEFAULT_APP_THEME_ID,
  resolveAppTheme,
} from "./app-theme";

describe("App Theme", () => {
  it("defines the accepted catalog with one default and ten premium themes", () => {
    expect(
      APP_THEME_CATALOG.map(({ description, id, name, premium }) => ({
        description,
        id,
        name,
        premium,
      }))
    ).toEqual([
      {
        description: "Carbón, oro y violeta: la identidad actual de NeXusTC.",
        id: "predeterminado",
        name: "Predeterminado",
        premium: false,
      },
      {
        description: "Resplandor dorado bajo una bóveda de humo tostado.",
        id: "ceniza-solar",
        name: "Ceniza Solar",
        premium: true,
      },
      {
        description:
          "Turquesa bioluminiscente en las profundidades del océano.",
        id: "marea-abisal",
        name: "Marea Abisal",
        premium: true,
      },
      {
        description: "Verde húmedo, musgo luminoso y reflejos de latón.",
        id: "bosque-umbrio",
        name: "Bosque Umbrío",
        premium: true,
      },
      {
        description: "Carmesí mineral y rosa lunar sobre negro vino.",
        id: "eclipse-carmesi",
        name: "Eclipse Carmesí",
        premium: true,
      },
      {
        description: "Lavanda espectral atravesada por destellos de cian.",
        id: "niebla-arcana",
        name: "Niebla Arcana",
        premium: true,
      },
      {
        description: "Cobre encendido, piedra fría y sombras de taller.",
        id: "oxido-lunar",
        name: "Óxido Lunar",
        premium: true,
      },
      {
        description: "Azul glacial y plata sobre una noche casi inmóvil.",
        id: "hielo-negro",
        name: "Hielo Negro",
        premium: true,
      },
      {
        description: "Índigo tormentoso con relámpagos de malva eléctrico.",
        id: "tormenta-indigo",
        name: "Tormenta Índigo",
        premium: true,
      },
      {
        description: "Ácido verde y mineral turquesa entre aguas estancadas.",
        id: "pantano-neon",
        name: "Pantano Neón",
        premium: true,
      },
      {
        description: "Coral encendido flotando entre vacío, tinta y cian.",
        id: "vacio-coral",
        name: "Vacío Coral",
        premium: true,
      },
    ]);
    expect(new Set(APP_THEME_CATALOG.map(({ id }) => id)).size).toBe(11);
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

  it.each([
    ["none", false],
    ["level3", false],
    ["level5", true],
    ["level8", true],
  ] as const)(
    "resolves configured level5 entitlement for %s",
    (tier, premiumEligible) => {
      expect(
        resolveAppTheme({
          requiredTier: "level5",
          role: "user",
          selectedTheme: "ceniza-solar",
          tier,
        })
      ).toMatchObject({
        catalogVisible: true,
        effectiveTheme: premiumEligible ? "ceniza-solar" : "predeterminado",
        premiumEligible,
        selectedTheme: "ceniza-solar",
      });
    }
  );

  it("does not grant moderators the configured entitlement", () => {
    expect(
      resolveAppTheme({
        requiredTier: "level5",
        role: "moderator",
        selectedTheme: "ceniza-solar",
        tier: "level3",
      })
    ).toMatchObject({
      catalogVisible: true,
      effectiveTheme: "predeterminado",
      premiumEligible: false,
      selectedTheme: "ceniza-solar",
    });
  });

  it("restores a retained premium selection when entitlement returns", () => {
    const lapsed = resolveAppTheme({
      requiredTier: "level5",
      role: "user",
      selectedTheme: "ceniza-solar",
      tier: "none",
    });
    expect(lapsed).toMatchObject({
      effectiveTheme: "predeterminado",
      selectedTheme: "ceniza-solar",
    });

    expect(
      resolveAppTheme({
        requiredTier: "level5",
        role: "user",
        selectedTheme: lapsed.selectedTheme,
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
