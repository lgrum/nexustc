import { z } from "zod";

import { getPatronTierRank } from "./constants";
import type { PatronTier } from "./constants";
import type { Role } from "./permissions";

type AppThemeDefinition = {
  description: string;
  id: string;
  name: string;
  premium: boolean;
  swatches: readonly [string, string, string];
};

export const APP_THEME_CATALOG = [
  {
    description: "Carbón, oro y violeta: la identidad actual de NeXusTC.",
    id: "predeterminado",
    name: "Predeterminado",
    premium: false,
    swatches: ["#f4ca64", "#c084fc", "#111016"],
  },
  {
    description: "Resplandor dorado bajo una bóveda de humo tostado.",
    id: "ceniza-solar",
    name: "Ceniza Solar",
    premium: true,
    swatches: ["#f6c65b", "#e38a50", "#15110d"],
  },
  {
    description: "Turquesa bioluminiscente en las profundidades del océano.",
    id: "marea-abisal",
    name: "Marea Abisal",
    premium: true,
    swatches: ["#5eead4", "#38bdf8", "#061418"],
  },
  {
    description: "Verde húmedo, musgo luminoso y reflejos de latón.",
    id: "bosque-umbrio",
    name: "Bosque Umbrío",
    premium: true,
    swatches: ["#86efac", "#d6b26e", "#0b140e"],
  },
  {
    description: "Carmesí mineral y rosa lunar sobre negro vino.",
    id: "eclipse-carmesi",
    name: "Eclipse Carmesí",
    premium: true,
    swatches: ["#fb7185", "#f0abfc", "#170a10"],
  },
  {
    description: "Lavanda espectral atravesada por destellos de cian.",
    id: "niebla-arcana",
    name: "Niebla Arcana",
    premium: true,
    swatches: ["#c4b5fd", "#67e8f9", "#100e19"],
  },
  {
    description: "Cobre encendido, piedra fría y sombras de taller.",
    id: "oxido-lunar",
    name: "Óxido Lunar",
    premium: true,
    swatches: ["#fdba74", "#d6d3d1", "#15100d"],
  },
  {
    description: "Azul glacial y plata sobre una noche casi inmóvil.",
    id: "hielo-negro",
    name: "Hielo Negro",
    premium: true,
    swatches: ["#bae6fd", "#7dd3fc", "#081019"],
  },
  {
    description: "Índigo tormentoso con relámpagos de malva eléctrico.",
    id: "tormenta-indigo",
    name: "Tormenta Índigo",
    premium: true,
    swatches: ["#a5b4fc", "#818cf8", "#0a0c1a"],
  },
  {
    description: "Ácido verde y mineral turquesa entre aguas estancadas.",
    id: "pantano-neon",
    name: "Pantano Neón",
    premium: true,
    swatches: ["#bef264", "#2dd4bf", "#09120b"],
  },
  {
    description: "Coral encendido flotando entre vacío, tinta y cian.",
    id: "vacio-coral",
    name: "Vacío Coral",
    premium: true,
    swatches: ["#fda4af", "#fb923c", "#140c12"],
  },
] as const satisfies readonly AppThemeDefinition[];

export type AppThemeId = (typeof APP_THEME_CATALOG)[number]["id"];
export const APP_THEME_IDS: readonly AppThemeId[] = APP_THEME_CATALOG.map(
  ({ id }) => id
);
export const DEFAULT_APP_THEME_ID: AppThemeId = "predeterminado";
export const APP_THEME_REQUIRED_TIER: PatronTier | null = null;
export const appThemeIdSchema = z.enum(APP_THEME_IDS);

export type AppThemeState = {
  catalogVisible: boolean;
  effectiveTheme: AppThemeId;
  premiumEligible: boolean;
  requiredTier: PatronTier | null;
  selectedTheme: AppThemeId;
};

export function resolveAppTheme({
  requiredTier,
  role,
  selectedTheme,
  tier,
}: {
  requiredTier: PatronTier | null;
  role?: Role | null;
  selectedTheme: string | null | undefined;
  tier: PatronTier;
}): AppThemeState {
  const hasRoleBypass = role === "admin" || role === "owner";
  const catalogVisible = requiredTier !== null || hasRoleBypass;
  const premiumEligible =
    hasRoleBypass ||
    (requiredTier !== null &&
      getPatronTierRank(tier) >= getPatronTierRank(requiredTier));
  const parsedTheme = appThemeIdSchema.safeParse(selectedTheme);
  const validSelectedTheme = parsedTheme.success
    ? parsedTheme.data
    : DEFAULT_APP_THEME_ID;

  return {
    catalogVisible,
    effectiveTheme:
      validSelectedTheme === DEFAULT_APP_THEME_ID || premiumEligible
        ? validSelectedTheme
        : DEFAULT_APP_THEME_ID,
    premiumEligible,
    requiredTier,
    selectedTheme: validSelectedTheme,
  };
}
