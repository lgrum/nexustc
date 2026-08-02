import { z } from "zod";

import { getPatronTierRank } from "./constants";
import type { PatronTier } from "./constants";
import type { Role } from "./permissions";

export const APP_THEME_IDS = ["predeterminado", "ceniza-solar"] as const;
export type AppThemeId = (typeof APP_THEME_IDS)[number];

type AppThemeDefinition = {
  description: string;
  id: AppThemeId;
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
] as const satisfies readonly AppThemeDefinition[];

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
