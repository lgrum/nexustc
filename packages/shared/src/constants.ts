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

export const ALLOWED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "msn.com",
  "live.com",
]);

export const RATING_REVIEW_MAX_LENGTH = 2000;
export const RATING_REVIEW_MIN_LENGTH = 100;
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

export const ROLE_PROFILE_STYLES: Record<
  string,
  { badge: string; gradient: string }
> = {
  uploader: {
    badge: "DEALER⁺¹⁸",
    gradient: "linear-gradient(135deg, #ff0090 0%, #ff5bfa 100%)",
  },
  owner: {
    badge: "AlphaNeXusTC⁺¹⁸",
    gradient: "linear-gradient(135deg, #ff2559 0%, #ff0090 100%)",
  },
} as const;

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
    maxBookmarks: 7,
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

export const PATRON_TIER_GRADIENTS: Record<PatronTier, string> = {
  none: "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
  level1: "linear-gradient(135deg, #00c590 0%, #58d2b2 100%)",
  level3: "linear-gradient(135deg, #ffe800 0%, #f3a200 100%)",
  level5: "linear-gradient(135deg, #00c5ff 0%, #2767de 100%)",
  level8: "linear-gradient(135deg, #de5aa5 0%, #e300be 100%)",
  level12: "linear-gradient(135deg, #e32346 0%, #dd0081 100%)",
  level69: "linear-gradient(135deg, #a644ec 0%, #17fdc7 100%)",
  level100: "linear-gradient(135deg, #A9C9FF 10%, #FFC3A0 50%, #FFBBEC 90%)",
} as const;

export const PATRON_TIER_PROFILE_BADGES: Record<PatronTier, string | null> = {
  none: null,
  level1: "VipTC⁺¹⁸ LvL 1",
  level3: "VipTC⁺¹⁸ LvL 3",
  level5: "VipTC⁺¹⁸ LvL 5",
  level8: "VipTC⁺¹⁸ LvL 8",
  level12: "VipTC⁺¹⁸ LvL 12",
  level69: "VipTC⁺¹⁸ LvL 69 PERMA OG",
  level100: "VipTC⁺¹⁸ LvL 100 PERMA",
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

const PERMANENT_PATRON_TIERS = ["level69", "level100"] as const;

function isPermanentPatronTier(
  tier: PatronTier | undefined
): tier is (typeof PERMANENT_PATRON_TIERS)[number] {
  return tier === "level69" || tier === "level100";
}

export function resolvePermanentPatronTierStatus<
  TUpdate extends PatronStatusUpdate,
>(
  existing: { patronSince?: Date | null; tier: PatronTier } | null | undefined,
  next: TUpdate
): TUpdate {
  if (!isPermanentPatronTier(existing?.tier)) {
    return next;
  }

  return {
    ...next,
    isActivePatron: true,
    patronSince: existing.patronSince ?? next.patronSince,
    tier: existing.tier,
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

export function canFollow(
  user: { role?: string; tier: PatronTier },
  currentFollows: number
): boolean {
  return canBookmark(user, currentFollows);
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
