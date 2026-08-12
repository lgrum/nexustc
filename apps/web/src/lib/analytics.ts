import { DAILY_STREAK_REWARDS } from "@repo/shared/streak";

type AnalyticsValue = boolean | number | string | null | undefined;

export type AnalyticsData = Record<string, AnalyticsValue>;

type UmamiTracker = {
  track: (
    eventName: string,
    data?: Record<string, boolean | number | string>
  ) => void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

function normalizeData(data: AnalyticsData = {}) {
  const normalized: Record<string, boolean | number | string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

export function trackEvent(eventName: string, data?: AnalyticsData) {
  if (typeof window === "undefined" || !window.umami) {
    return;
  }

  window.umami.track(eventName, {
    path: window.location.pathname,
    ...normalizeData(data),
  });
}

export function trackStreakDayCompletion(result: unknown) {
  if (!(typeof result === "object" && result && "dayCompletion" in result)) {
    return;
  }
  const completion = result.dayCompletion;
  if (!(typeof completion === "object" && completion)) {
    return;
  }
  const { outcome, path, tier } = completion as Record<string, unknown>;
  if (
    !(outcome === "immediate" || outcome === "pending") ||
    !(
      path === "contribution" ||
      path === "mixed_discovery" ||
      path === "reading"
    ) ||
    typeof tier !== "number" ||
    !DAILY_STREAK_REWARDS.some((reward) => reward.xp === tier)
  ) {
    return;
  }
  trackEvent("streak_day_completed", {
    outcome,
    path: "/streak",
    qualificationPath: path,
    tier,
  });
}

export function getQueryLength(query: string | undefined) {
  return query?.trim().length ?? 0;
}
