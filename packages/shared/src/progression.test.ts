import { describe, expect, it } from "vitest";

import {
  ACCOUNT_LEVEL_THRESHOLDS,
  ACCOUNT_LEVEL_XP_CAP,
  ACCOUNT_LEVEL_REWARD_TOTAL,
  assertCompatibleAccountLevelThresholds,
  getAccountLevelProgress,
  getAccountLevelReward,
} from "./progression";

const APPROVED_ANCHORS = new Map([
  [1, 0],
  [10, 600],
  [50, 4200],
  [100, 12_000],
  [250, 48_000],
  [500, 146_000],
  [1000, 365_000],
]);

describe("Account Level thresholds", () => {
  it("generates the complete approved 1,000-level curve", () => {
    expect(ACCOUNT_LEVEL_THRESHOLDS).toHaveLength(1000);
    expect(ACCOUNT_LEVEL_THRESHOLDS.at(-1)).toBe(ACCOUNT_LEVEL_XP_CAP);

    for (const [level, totalXp] of APPROVED_ANCHORS) {
      expect(ACCOUNT_LEVEL_THRESHOLDS[level - 1]).toBe(totalXp);
    }

    for (let index = 1; index < ACCOUNT_LEVEL_THRESHOLDS.length; index += 1) {
      expect(ACCOUNT_LEVEL_THRESHOLDS[index]).toBeGreaterThan(
        ACCOUNT_LEVEL_THRESHOLDS[index - 1]!
      );
    }
  });

  it("looks up levels and progress at boundaries and at the cap", () => {
    expect(getAccountLevelProgress(0)).toEqual({
      level: 1,
      nextLevelTotalXp: 67,
      progress: 0,
      xpForNextLevel: 67,
    });
    expect(getAccountLevelProgress(66)).toEqual({
      level: 1,
      nextLevelTotalXp: 67,
      progress: 66 / 67,
      xpForNextLevel: 1,
    });
    expect(getAccountLevelProgress(67)).toEqual({
      level: 2,
      nextLevelTotalXp: 133,
      progress: 0,
      xpForNextLevel: 66,
    });
    expect(getAccountLevelProgress(ACCOUNT_LEVEL_XP_CAP)).toEqual({
      level: 1000,
      nextLevelTotalXp: null,
      progress: 1,
      xpForNextLevel: null,
    });
  });

  it("rejects XP totals outside the stored account range", () => {
    expect(() => getAccountLevelProgress(-1)).toThrow(RangeError);
    expect(() => getAccountLevelProgress(ACCOUNT_LEVEL_XP_CAP + 1)).toThrow(
      RangeError
    );
  });

  it("rejects raising a threshold for a level already reached", () => {
    const changed = [...ACCOUNT_LEVEL_THRESHOLDS];
    changed[99] = ACCOUNT_LEVEL_THRESHOLDS[99]! + 1;

    expect(() =>
      assertCompatibleAccountLevelThresholds(
        ACCOUNT_LEVEL_THRESHOLDS,
        changed,
        100
      )
    ).toThrow(/nivel 100/i);

    expect(() =>
      assertCompatibleAccountLevelThresholds(
        ACCOUNT_LEVEL_THRESHOLDS,
        changed,
        99
      )
    ).not.toThrow();
  });
});

describe("automatic Account Level rewards", () => {
  it("uses the approved stacking rewards and complete track total", () => {
    expect(getAccountLevelReward(1)).toBe(0);
    expect(getAccountLevelReward(2)).toBe(10);
    expect(getAccountLevelReward(10)).toBe(35);
    expect(getAccountLevelReward(50)).toBe(135);
    expect(getAccountLevelReward(100)).toBe(385);
    expect(ACCOUNT_LEVEL_REWARD_TOTAL).toBe(16_990);
  });

  it("rejects levels outside the published track", () => {
    expect(() => getAccountLevelReward(0)).toThrow(RangeError);
    expect(() => getAccountLevelReward(1001)).toThrow(RangeError);
  });
});
