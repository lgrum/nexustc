import { userMeetsTierLevel } from "./constants";
import type { PatronTier } from "./constants";

export const EARLY_ACCESS_STATES = [
  "VIP12_ONLY",
  "VIP8_ONLY",
  "PUBLIC",
] as const;

export const EARLY_ACCESS_DEFAULTS = {
  enabled: true,
  vip12Hours: 24,
  vip8Hours: 48,
} as const;

export const EARLY_ACCESS_MAX_DURATION_HOURS = 24 * 30;

export type EarlyAccessState = (typeof EARLY_ACCESS_STATES)[number];

export type EarlyAccessScheduleInput = {
  enabled: boolean;
  startedAt: Date | null;
  vip12Hours: number;
  vip8Hours: number;
};

export type EarlyAccessSchedule = EarlyAccessScheduleInput & {
  vip12EndsAt: Date | null;
  publicReleaseAt: Date | null;
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
  vip12EndsAt: Date | null;
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

export function getVipTierLabel(tier: PatronTier | null): string | null {
  if (tier === "level12") {
    return "VIP 12";
  }

  if (tier === "level8") {
    return "VIP 8";
  }

  return null;
}

export function getMaskedPostLabel(postId: string): string {
  return `VIP Access #${postId.slice(0, 6).toUpperCase()}`;
}

export function buildEarlyAccessSchedule(
  input: EarlyAccessScheduleInput
): EarlyAccessSchedule {
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
      publicReleaseAt: null,
      startedAt: input.startedAt,
      vip12EndsAt: null,
      vip12Hours,
      vip8Hours,
    };
  }

  const vip12EndsAt = addHours(input.startedAt, vip12Hours);
  const publicReleaseAt = addHours(vip12EndsAt, vip8Hours);

  return {
    enabled: input.enabled,
    publicReleaseAt,
    startedAt: input.startedAt,
    vip12EndsAt,
    vip12Hours,
    vip8Hours,
  };
}

export function getEarlyAccessState(
  schedule: EarlyAccessSchedule,
  now = new Date()
): EarlyAccessState {
  if (
    !(schedule.enabled && schedule.startedAt && schedule.vip12EndsAt) ||
    !schedule.publicReleaseAt
  ) {
    return "PUBLIC";
  }

  if (now < schedule.vip12EndsAt) {
    return "VIP12_ONLY";
  }

  if (now < schedule.publicReleaseAt) {
    return "VIP8_ONLY";
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
      currentState === "VIP12_ONLY"
        ? args.schedule.vip12EndsAt
        : currentState === "VIP8_ONLY"
          ? args.schedule.publicReleaseAt
          : null,
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
    vip12EndsAt: args.schedule.vip12EndsAt,
  };
}
