import { describe, expect, it } from "vitest";

import {
  DAILY_STREAK_REWARD_CONFIG_VERSION,
  STREAK_CHALLENGE_REWARDS,
  getDailyStreakReward,
  getStreakChallengeReward,
} from "./streak";

describe("daily streak rewards", () => {
  it.each([
    [1, 5],
    [3, 5],
    [4, 10],
    [7, 10],
    [8, 15],
    [15, 15],
    [16, 20],
    [30, 20],
    [31, 25],
  ])("awards day %i with %i XP", (day, xp) => {
    expect(getDailyStreakReward(day)).toBe(xp);
  });

  it("keeps the initial reward configuration versioned", () => {
    expect(DAILY_STREAK_REWARD_CONFIG_VERSION).toBe("daily-streak-v1");
  });
});

it("keeps the accepted challenge targets and bonuses exact", () => {
  expect(STREAK_CHALLENGE_REWARDS).toEqual([
    { target: 10, xp: 50 },
    { target: 20, xp: 125 },
    { target: 30, xp: 250 },
  ]);
  expect(
    STREAK_CHALLENGE_REWARDS.map(({ target }) =>
      getStreakChallengeReward(target)
    )
  ).toEqual([50, 125, 250]);
});
