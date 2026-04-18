export const TAXONOMIES = [
  "tag",
  "language",
  "engine",
  "graphics",
  "censorship",
  "status",
  "platform",
] as const;

export const TAXONOMY_DATA: Record<
  (typeof TAXONOMIES)[number],
  { label: string; mode: "single" | "multiple" }
> = {
  censorship: { label: "Censura", mode: "single" },
  engine: { label: "Motor Gráfico", mode: "single" },
  graphics: { label: "Gráficos", mode: "single" },
  language: { label: "Idiomas", mode: "multiple" },
  platform: { label: "Plataformas", mode: "multiple" },
  status: { label: "Estado", mode: "single" },
  tag: { label: "Tags", mode: "multiple" },
} as const;

export const DOCUMENT_STATUSES = [
  "publish",
  "pending",
  "draft",
  "trash",
] as const;

export const DOCUMENT_STATUS_LABELS: Record<
  (typeof DOCUMENT_STATUSES)[number],
  string
> = {
  draft: "Borrador",
  pending: "Pendiente",
  publish: "Publicado",
  trash: "Basura",
} as const;

export const RATING_REVIEW_MAX_LENGTH = 512;
export const MAX_PINNED_ITEMS_PER_POST = 3;

export const PREMIUM_LINK_ACCESS_LEVELS = [
  "auto",
  "level1",
  "level3",
  "level5",
  "level8",
  "level12",
  "level69",
  "level100",
] as const;

export type PremiumLinkAccessLevel =
  (typeof PREMIUM_LINK_ACCESS_LEVELS)[number];

export type PremiumLinksRequiredTierLabel =
  | "LvL 1"
  | "LvL 3"
  | "LvL 5"
  | "LvL 8"
  | "LvL 12"
  | "LvL 69"
  | "LvL 100";

export const PREMIUM_LINK_ACCESS_LEVEL_LABELS: Record<
  PremiumLinkAccessLevel,
  string
> = {
  auto: "Automatico por estado",
  level1: "VIP LvL 1+",
  level12: "VIP LvL 12+",
  level3: "VIP LvL 3+",
  level5: "VIP LvL 5+",
  level69: "VIP LvL 69+",
  level100: "VIP LvL 100",
  level8: "VIP LvL 8+",
} as const;

const PREMIUM_LINK_ACCESS_REQUIRED_TIER_LABELS: Record<
  Exclude<PremiumLinkAccessLevel, "auto">,
  PremiumLinksRequiredTierLabel
> = {
  level1: "LvL 1",
  level12: "LvL 12",
  level3: "LvL 3",
  level5: "LvL 5",
  level69: "LvL 69",
  level100: "LvL 100",
  level8: "LvL 8",
} as const;

export const PREMIUM_STATUS_CATEGORIES = {
  completed: ["Finalizado", "Abandonado"],
  ongoing: ["En Progreso", "En Emision", "En Emisión"],
} as const;

type PremiumStatusCategory = keyof typeof PREMIUM_STATUS_CATEGORIES;

export type PremiumLinksAccess =
  | { type: "none" }
  | { type: "category"; categories: PremiumStatusCategory[] }
  | { type: "all" };

export type PremiumLinksDescriptor =
  | { status: "no_premium_links" }
  | { status: "granted"; content: string }
  | {
      isManualAccessLevel?: boolean;
      status: "denied_need_patron" | "denied_need_upgrade";
      requiredTierLabel: PremiumLinksRequiredTierLabel;
    };

export const ROLE_LABELS: Record<string, string> = {
  shortener: "Acortador",
  admin: "Alpha⁺¹⁸",
  moderator: "BetaTC⁺¹⁸",
  owner: "AlphaNeXusTC⁺¹⁸",
  uploader: "DEALER⁺¹⁸",
  user: "Sobrino⁺¹⁸",
};

export const PATRON_TIER_KEYS = [
  "none",
  "level1",
  "level3",
  "level5",
  "level8",
  "level12",
  "level69",
  "level100",
] as const;

const PATRON_TIER_HIERARCHY = [
  "none",
  "level1",
  "level3",
  "level5",
  "level8",
  "level12",
  "level69",
  "level100",
] as const;

// Patreon tier configuration
export const PATRON_TIERS: Record<
  (typeof PATRON_TIER_KEYS)[number],
  {
    level: number;
    badge: string | null;
    adFree: boolean;
    premiumLinks: PremiumLinksAccess;
    maxBookmarks: number; // Optional: max bookmarks allowed for this tier
  }
> = {
  none: {
    adFree: false,
    badge: null,
    level: 0,
    maxBookmarks: 5,
    premiumLinks: { type: "none" },
  },
  level1: {
    adFree: false,
    badge: "LvL 1",
    level: 1,
    maxBookmarks: 10,
    premiumLinks: { categories: ["completed"], type: "category" },
  },
  level3: {
    adFree: true,
    badge: "LvL 3",
    level: 2,
    maxBookmarks: 10,
    premiumLinks: { categories: ["ongoing"], type: "category" },
  },
  level5: {
    adFree: true,
    badge: "LvL 5",
    level: 3,
    maxBookmarks: 15,
    premiumLinks: { type: "all" },
  },
  level8: {
    adFree: true,
    badge: "LvL 8",
    level: 3,
    maxBookmarks: 50,
    premiumLinks: { type: "all" },
  },
  level12: {
    adFree: true,
    badge: "LvL 12",
    level: 3,
    maxBookmarks: Number.POSITIVE_INFINITY,
    premiumLinks: { type: "all" },
  },
  level69: {
    adFree: true,
    badge: "LvL 69",
    level: 3,
    maxBookmarks: Number.POSITIVE_INFINITY,
    premiumLinks: { type: "all" },
  },
  level100: {
    adFree: true,
    badge: "LvL 100",
    level: 3,
    maxBookmarks: Number.POSITIVE_INFINITY,
    premiumLinks: { type: "all" },
  },
} as const;

export function getPatronTierRank(tier: PatronTier): number {
  return PATRON_TIER_HIERARCHY.indexOf(tier);
}

export function getHighestPatronTier(tiers: PatronTier[]): PatronTier {
  let highestTier: PatronTier = "none";
  let highestRank = getPatronTierRank(highestTier);

  for (const tier of tiers) {
    const tierRank = getPatronTierRank(tier);

    if (tierRank > highestRank) {
      highestRank = tierRank;
      highestTier = tier;
    }
  }

  return highestTier;
}

export function getHighestPatronTierFromIds(tierIds: string[]): PatronTier {
  const mappedTiers: PatronTier[] = [];

  for (const tierId of tierIds) {
    const mappedTier = PATREON_TIER_MAPPING[tierId];

    if (mappedTier) {
      mappedTiers.push(mappedTier);
    }
  }

  return getHighestPatronTier(mappedTiers);
}

type PatronStatusUpdate = {
  isActivePatron: boolean;
  patronSince?: Date | null;
  tier: PatronTier;
};

export function resolvePermanentPatronTierStatus<
  TUpdate extends PatronStatusUpdate,
>(
  existing: { patronSince?: Date | null; tier: PatronTier } | null | undefined,
  next: TUpdate
): TUpdate {
  if (existing?.tier !== "level100") {
    return next;
  }

  return {
    ...next,
    isActivePatron: true,
    patronSince: existing.patronSince ?? next.patronSince,
    tier: "level100",
  };
}

export function userMeetsTierLevel(
  user: { role?: string; tier: PatronTier },
  requiredTier: PatronTier
): boolean {
  if (
    user.role === "owner" ||
    user.role === "admin" ||
    user.role === "moderator"
  ) {
    return true;
  }

  return getPatronTierRank(user.tier) >= getPatronTierRank(requiredTier);
}

export function canAccessPremiumLinks(
  user: { role?: string; tier: PatronTier },
  postStatusName: string | undefined,
  accessLevel: PremiumLinkAccessLevel = "auto"
): boolean {
  if (
    user.role === "owner" ||
    user.role === "admin" ||
    user.role === "moderator"
  ) {
    return true;
  }

  if (accessLevel !== "auto") {
    return userMeetsTierLevel(user, accessLevel);
  }

  const access = PATRON_TIERS[user.tier].premiumLinks;
  if (access.type === "none") {
    return false;
  }
  if (access.type === "all") {
    return true;
  }
  if (!postStatusName) {
    return false;
  }
  return access.categories.some((cat) =>
    (PREMIUM_STATUS_CATEGORIES[cat] as readonly string[]).includes(
      postStatusName
    )
  );
}

export function canBookmark(
  user: { role?: string; tier: PatronTier },
  currentBookmarks: number
): boolean {
  if (user.role && user.role !== "user") {
    return true;
  }

  const { maxBookmarks } = PATRON_TIERS[user.tier];
  return currentBookmarks < maxBookmarks;
}

export function getRequiredTierLabel(
  userTier: PatronTier,
  postStatusName: string | undefined,
  accessLevel: PremiumLinkAccessLevel = "auto"
): PremiumLinksRequiredTierLabel {
  if (accessLevel !== "auto") {
    return PREMIUM_LINK_ACCESS_REQUIRED_TIER_LABELS[accessLevel];
  }

  if (!postStatusName) {
    return "LvL 5";
  }

  const userLevel = PATRON_TIERS[userTier].level;
  const isCompleted = (
    PREMIUM_STATUS_CATEGORIES.completed as readonly string[]
  ).includes(postStatusName);
  const isOngoing = (
    PREMIUM_STATUS_CATEGORIES.ongoing as readonly string[]
  ).includes(postStatusName);

  if (isCompleted) {
    return userLevel >= 1 ? "LvL 5" : "LvL 1";
  }
  if (isOngoing) {
    return userLevel >= 2 ? "LvL 5" : "LvL 3";
  }
  return "LvL 5";
}

export type PatronTier = keyof typeof PATRON_TIERS;

// Map Patreon tier IDs to our tiers - fill these after fetching from Patreon API
// Example: "12345678": "tier1"
export const PATREON_TIER_MAPPING: Record<string, PatronTier> = {
  // TODO: Add your Patreon tier IDs here after fetching them
  // Use: curl "https://www.patreon.com/api/oauth2/v2/campaigns/{CAMPAIGN_ID}?include=tiers&fields[tier]=title,amount_cents"
  "25898614": "none",
  "25898677": "level1",
  "25898697": "level3",
  "25898760": "level5",
  "25898792": "level8",
  "25898869": "level12",
  "25899010": "level69",
  "28365176": "level100",
};
