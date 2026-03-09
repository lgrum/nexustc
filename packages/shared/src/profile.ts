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

export type ProfileCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
};

export type ProfileVisibilityConfig = {
  reserved: Record<string, boolean>;
};

export type ProfileRoleVisualConfig = {
  baseColor: string;
  accentColor: string | null;
  textColor: string;
  glowColor: string | null;
};

export type ProfileEmblemVisualConfig = {
  glowColor: string | null;
  backgroundColor: string | null;
};

export const PROFILE_DEFAULTS = {
  avatarFallbackColor: "#f59e0b",
  bannerColor: "#111827",
  maxVisibleEmblems: 4,
} as const;
