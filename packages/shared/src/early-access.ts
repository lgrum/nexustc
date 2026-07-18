import { userMeetsTierLevel } from "./constants";
import type { PatronTier } from "./constants";

export const EARLY_ACCESS_STATES = [
  "VIP12_ONLY",
  "VIP8_ONLY",
  "VIP5_ONLY",
  "PUBLIC",
] as const;

export const EARLY_ACCESS_POLICIES = {
  comic: {
    enabled: true,
    firstPhaseHours: 24,
    firstPhaseTier: "level8",
    secondPhaseHours: 24,
    secondPhaseTier: "level5",
  },
  post: {
    enabled: true,
    firstPhaseHours: 24,
    firstPhaseTier: "level12",
    secondPhaseHours: 48,
    secondPhaseTier: "level8",
  },
} as const;

export const EARLY_ACCESS_DEFAULTS = {
  enabled: EARLY_ACCESS_POLICIES.post.enabled,
  vip12Hours: EARLY_ACCESS_POLICIES.post.firstPhaseHours,
  vip8Hours: EARLY_ACCESS_POLICIES.post.secondPhaseHours,
} as const;

export const COMIC_EARLY_ACCESS_DEFAULTS = {
  enabled: EARLY_ACCESS_POLICIES.comic.enabled,
  vip12Hours: EARLY_ACCESS_POLICIES.comic.firstPhaseHours,
  vip8Hours: EARLY_ACCESS_POLICIES.comic.secondPhaseHours,
} as const;

export const EARLY_ACCESS_MAX_DURATION_HOURS = 24 * 30;

export type EarlyAccessState = (typeof EARLY_ACCESS_STATES)[number];
export type EarlyAccessContentType = keyof typeof EARLY_ACCESS_POLICIES;
export type EarlyAccessPhaseTier = "level5" | "level8" | "level12";

export type EarlyAccessScheduleInput = {
  enabled: boolean;
  firstPhaseTier?: EarlyAccessPhaseTier;
  secondPhaseTier?: EarlyAccessPhaseTier;
  startedAt: Date | null;
  vip12Hours: number;
  vip8Hours: number;
};

export type EarlyAccessSchedule = EarlyAccessScheduleInput & {
  firstPhaseEndsAt: Date | null;
  firstPhaseTier: EarlyAccessPhaseTier;
  publicReleaseAt: Date | null;
  secondPhaseTier: EarlyAccessPhaseTier;
};

export type EarlyAccessView = {
  enabled: boolean;
  currentPhaseEndsAt: Date | null;
  currentState: EarlyAccessState;
  hideComments: boolean;
  hideCreatorSupport: boolean;
  isActive: boolean;
  isRestrictedView: boolean;
  publicReleaseAt: Date | null;
  requiredTier: PatronTier | null;
  requiredTierLabel: string | null;
  startedAt: Date | null;
  viewerCanAccess: boolean;
  viewerTier: PatronTier;
  firstPhaseEndsAt: Date | null;
};

const HOUR_IN_MS = 60 * 60 * 1000;

function clampHours(hours: number, fallback: number): number {
  if (!Number.isFinite(hours)) {
    return fallback;
  }

  return Math.min(
    Math.max(Math.round(hours), 0),
    EARLY_ACCESS_MAX_DURATION_HOURS
  );
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_IN_MS);
}

export function getEarlyAccessPolicy(type: EarlyAccessContentType) {
  return EARLY_ACCESS_POLICIES[type];
}

export function getVipTierLabel(tier: PatronTier | null): string | null {
  if (tier === "level12") {
    return "VIP 12";
  }

  if (tier === "level8") {
    return "VIP 8";
  }

  if (tier === "level5") {
    return "VIP 5";
  }

  return null;
}

export function getMaskedPostLabel(postId: string): string {
  return `VIP Access #${postId.slice(0, 6).toUpperCase()}`;
}

export function buildEarlyAccessSchedule(
  input: EarlyAccessScheduleInput
): EarlyAccessSchedule {
  const firstPhaseTier =
    input.firstPhaseTier ?? EARLY_ACCESS_POLICIES.post.firstPhaseTier;
  const secondPhaseTier =
    input.secondPhaseTier ?? EARLY_ACCESS_POLICIES.post.secondPhaseTier;
  const vip12Hours = clampHours(
    input.vip12Hours,
    EARLY_ACCESS_DEFAULTS.vip12Hours
  );
  const vip8Hours = clampHours(
    input.vip8Hours,
    EARLY_ACCESS_DEFAULTS.vip8Hours
  );

  if (!(input.enabled && input.startedAt)) {
    return {
      enabled: input.enabled,
      firstPhaseEndsAt: null,
      firstPhaseTier,
      publicReleaseAt: null,
      secondPhaseTier,
      startedAt: input.startedAt,
      vip12Hours,
      vip8Hours,
    };
  }

  const firstPhaseEndsAt = addHours(input.startedAt, vip12Hours);
  const publicReleaseAt = addHours(firstPhaseEndsAt, vip8Hours);

  return {
    enabled: input.enabled,
    firstPhaseEndsAt,
    firstPhaseTier,
    publicReleaseAt,
    secondPhaseTier,
    startedAt: input.startedAt,
    vip12Hours,
    vip8Hours,
  };
}

function getEarlyAccessStateForTier(
  tier: EarlyAccessPhaseTier
): EarlyAccessState {
  if (tier === "level12") {
    return "VIP12_ONLY";
  }

  if (tier === "level8") {
    return "VIP8_ONLY";
  }

  return "VIP5_ONLY";
}

export function getEarlyAccessState(
  schedule: EarlyAccessSchedule,
  now = new Date()
): EarlyAccessState {
  if (
    !(schedule.enabled && schedule.startedAt && schedule.firstPhaseEndsAt) ||
    !schedule.publicReleaseAt
  ) {
    return "PUBLIC";
  }

  if (now < schedule.firstPhaseEndsAt) {
    return getEarlyAccessStateForTier(schedule.firstPhaseTier);
  }

  if (now < schedule.publicReleaseAt) {
    return getEarlyAccessStateForTier(schedule.secondPhaseTier);
  }

  return "PUBLIC";
}

export function getRequiredTierForEarlyAccessState(
  state: EarlyAccessState
): PatronTier | null {
  if (state === "VIP12_ONLY") {
    return "level12";
  }

  if (state === "VIP8_ONLY") {
    return "level8";
  }

  if (state === "VIP5_ONLY") {
    return "level5";
  }

  return null;
}

export function getEarlyAccessView(args: {
  role?: string;
  schedule: EarlyAccessSchedule;
  viewerTier: PatronTier;
  now?: Date;
}): EarlyAccessView {
  const now = args.now ?? new Date();
  const currentState = getEarlyAccessState(args.schedule, now);
  const requiredTier = getRequiredTierForEarlyAccessState(currentState);
  const isActive = currentState !== "PUBLIC";
  const viewerCanAccess =
    !requiredTier ||
    userMeetsTierLevel(
      { role: args.role, tier: args.viewerTier },
      requiredTier
    );

  return {
    enabled: args.schedule.enabled,
    currentPhaseEndsAt:
      currentState === getEarlyAccessStateForTier(args.schedule.firstPhaseTier)
        ? args.schedule.firstPhaseEndsAt
        : currentState === "PUBLIC"
          ? null
          : args.schedule.publicReleaseAt,
    currentState,
    hideComments: isActive,
    hideCreatorSupport: isActive,
    isActive,
    isRestrictedView: isActive && !viewerCanAccess,
    publicReleaseAt: args.schedule.publicReleaseAt,
    requiredTier,
    requiredTierLabel: getVipTierLabel(requiredTier),
    startedAt: args.schedule.startedAt,
    viewerCanAccess,
    viewerTier: args.viewerTier,
    firstPhaseEndsAt: args.schedule.firstPhaseEndsAt,
  };
}
