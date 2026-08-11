import { beforeEach, expect, test, vi } from "vitest";

import { trackStreakDayCompletion } from "./analytics";

const track = vi.fn();

beforeEach(() => {
  track.mockClear();
  window.umami = { track };
});

test("emits only an authoritative low-cardinality streak completion", () => {
  window.history.replaceState({}, "", "/comic/content-123");
  trackStreakDayCompletion({});
  trackStreakDayCompletion({
    dayCompletion: {
      outcome: "pending",
      path: "mixed_discovery",
      tier: 10,
    },
  });

  expect(track).toHaveBeenCalledOnce();
  expect(track).toHaveBeenCalledWith("streak_day_completed", {
    outcome: "pending",
    path: "/streak",
    qualificationPath: "mixed_discovery",
    tier: 10,
  });
});
