export const PROFILE_BANNER_MODES = ["color", "image"] as const;

export const PROFILE_MEDIA_SLOTS = [
  "avatar",
  "banner",
  "role-icon",
  "role-overlay",
  "emblem-icon",
] as const;

export const PROFILE_MEDIA_VALIDATION_STATUSES = [
  "pending",
  "ready",
  "rejected",
] as const;

export const PROFILE_ASSIGNMENT_SOURCE_TYPES = [
  "manual",
  "seeded",
  "system",
] as const;

export type ProfileBannerMode = (typeof PROFILE_BANNER_MODES)[number];
export type ProfileMediaSlot = (typeof PROFILE_MEDIA_SLOTS)[number];
export type ProfileMediaValidationStatus =
  (typeof PROFILE_MEDIA_VALIDATION_STATUSES)[number];
export type ProfileAssignmentSourceType =
  (typeof PROFILE_ASSIGNMENT_SOURCE_TYPES)[number];

export const PROFILE_ACTIVITY_COLLECTIONS = ["favorites", "reviews"] as const;

export type ProfileActivityCollection =
  (typeof PROFILE_ACTIVITY_COLLECTIONS)[number];

export type ProfileVisibilityConfig = {
  favorites: boolean;
  reviews: boolean;
  reserved: Record<string, boolean>;
};

export type ProfileActivityVisibility = Pick<
  ProfileVisibilityConfig,
  ProfileActivityCollection
>;

export const PROFILE_VISIBILITY_DEFAULTS = {
  favorites: true,
  reviews: true,
  reserved: {},
} as const satisfies ProfileVisibilityConfig;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeProfileVisibilityConfig(
  value: unknown
): ProfileVisibilityConfig {
  const config = isRecord(value) ? value : {};
  const reserved = isRecord(config.reserved)
    ? Object.fromEntries(
        Object.entries(config.reserved).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
        )
      )
    : {};

  return {
    favorites:
      typeof config.favorites === "boolean"
        ? config.favorites
        : PROFILE_VISIBILITY_DEFAULTS.favorites,
    reviews:
      typeof config.reviews === "boolean"
        ? config.reviews
        : PROFILE_VISIBILITY_DEFAULTS.reviews,
    reserved,
  };
}

export function getProfileActivityVisibility(
  value: unknown
): ProfileActivityVisibility {
  const config = normalizeProfileVisibilityConfig(value);
  return { favorites: config.favorites, reviews: config.reviews };
}

export function isProfileActivityPublic(
  value: unknown,
  collection: ProfileActivityCollection
) {
  return normalizeProfileVisibilityConfig(value)[collection];
}

export type ProfileRoleVisualConfig = {
  baseColor: string;
  accentColor: string | null;
  textColor: string;
  glowColor: string | null;
};

export const PROFILE_DEFAULTS = {
  avatarFallbackColor: "#f59e0b",
  bannerColor: "#111827",
  maxVisibleEmblems: 4,
} as const;
