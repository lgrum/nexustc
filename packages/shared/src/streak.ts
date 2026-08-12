import { z } from "zod";

export const DAILY_STREAK_REWARD_CONFIG_VERSION = "daily-streak-v1";
export const STREAK_CONTRIBUTION_MIN_LENGTH = 40;
export const STREAK_DISCOVERY_ACTION_REQUIREMENT = 2;
export const STREAK_READING_PAGE_REQUIREMENT = 3;

export const DAILY_STREAK_REWARDS = [
  { fromDay: 1, xp: 5 },
  { fromDay: 4, xp: 10 },
  { fromDay: 8, xp: 15 },
  { fromDay: 16, xp: 20 },
  { fromDay: 31, xp: 25 },
] as const;

export const STREAK_CHALLENGE_REWARDS = [
  { target: 10, xp: 50 },
  { target: 20, xp: 125 },
  { target: 30, xp: 250 },
] as const;

export const streakChallengeTargetSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
]);

export type StreakChallengeTarget = z.infer<typeof streakChallengeTargetSchema>;

export function getDailyStreakReward(streak: number) {
  if (!Number.isInteger(streak) || streak < 1) {
    throw new RangeError("El dia de racha debe ser un entero positivo.");
  }

  return DAILY_STREAK_REWARDS.findLast(({ fromDay }) => fromDay <= streak)!.xp;
}

export function getStreakChallengeReward(target: StreakChallengeTarget) {
  return STREAK_CHALLENGE_REWARDS.find((reward) => reward.target === target)!
    .xp;
}
