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

export function getQueryLength(query: string | undefined) {
  return query?.trim().length ?? 0;
}
