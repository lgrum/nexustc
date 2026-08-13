import type { PatronTier } from "@repo/shared/constants";
import { getPatronTierRank } from "@repo/shared/constants";
import {
  PROFILE_DEFAULT_LAYOUT_KEY,
  PROFILE_DEFAULT_SKIN_KEY,
} from "@repo/shared/profile-customization";
import type {
  ProfileCustomizationDraft,
  ProfileLayoutKey,
  ProfileShowcaseTypeKey,
} from "@repo/shared/profile-customization";

type CatalogLifecycle = "active" | "archived" | "disabled" | "draft";

export type ProfileEntitlementItem = {
  id: string;
  isFree: boolean;
  lifecycle: CatalogLifecycle;
  requiredTier: PatronTier | null;
};

export type ProfileEntitlementContext = {
  isActivePatron: boolean;
  items: readonly ProfileEntitlementItem[];
  ownedItemIds: readonly string[];
  role: string;
  tier: PatronTier;
};

const VIP_BYPASS_ROLES = new Set(["owner", "admin", "moderator"]);

export function satisfiesProfileVipRequirement(
  requiredTier: PatronTier | null,
  context: Pick<ProfileEntitlementContext, "isActivePatron" | "role" | "tier">
) {
  if (requiredTier === null) {
    return false;
  }
  if (requiredTier === "none") {
    return true;
  }
  if (VIP_BYPASS_ROLES.has(context.role)) {
    return true;
  }
  return (
    context.isActivePatron &&
    getPatronTierRank(context.tier) >= getPatronTierRank(requiredTier)
  );
}

export function resolveProfileEntitlements(context: ProfileEntitlementContext) {
  const owned = new Set(context.ownedItemIds);
  return {
    items: Object.fromEntries(
      context.items.map((item) => {
        const globallyAvailable = item.lifecycle !== "disabled";
        const entitled =
          globallyAvailable &&
          ((context.role === "owner" && item.lifecycle === "active") ||
            item.isFree ||
            owned.has(item.id) ||
            satisfiesProfileVipRequirement(item.requiredTier, context));
        return [
          item.id,
          {
            entitled,
            selectable: entitled && item.lifecycle === "active",
          },
        ];
      })
    ),
  };
}

export function resolveEffectiveProfileConfiguration(
  selected: ProfileCustomizationDraft,
  entitlements: {
    decorationEntitlements: Readonly<Record<string, boolean>>;
    layoutEntitlements: Partial<Record<ProfileLayoutKey, boolean>>;
    showcaseEntitlements: Partial<Record<ProfileShowcaseTypeKey, boolean>>;
    skinEntitlements: Readonly<Record<string, boolean>>;
  }
): ProfileCustomizationDraft {
  return {
    decorations: Object.fromEntries(
      Object.entries(selected.decorations).map(([slot, key]) => [
        slot,
        key && entitlements.decorationEntitlements[key] ? key : null,
      ])
    ) as ProfileCustomizationDraft["decorations"],
    layoutKey: entitlements.layoutEntitlements[selected.layoutKey]
      ? selected.layoutKey
      : PROFILE_DEFAULT_LAYOUT_KEY,
    showcases: selected.showcases.map((showcase) => ({
      ...showcase,
      enabled:
        showcase.enabled &&
        entitlements.showcaseEntitlements[showcase.type] !== false,
    })),
    skinKey: entitlements.skinEntitlements[selected.skinKey]
      ? selected.skinKey
      : PROFILE_DEFAULT_SKIN_KEY,
  };
}
