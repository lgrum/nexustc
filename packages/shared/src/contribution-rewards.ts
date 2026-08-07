export type ContributionMilestone = {
  likes: number;
  xp: number;
};

export const REVIEW_MILESTONES = [
  { likes: 3, xp: 25 },
  { likes: 10, xp: 50 },
  { likes: 25, xp: 100 },
  { likes: 50, xp: 200 },
  { likes: 100, xp: 400 },
] as const satisfies readonly ContributionMilestone[];

export const COMMENT_MILESTONES = [
  { likes: 2, xp: 10 },
  { likes: 10, xp: 20 },
  { likes: 25, xp: 40 },
  { likes: 50, xp: 80 },
  { likes: 100, xp: 160 },
] as const satisfies readonly ContributionMilestone[];

export function normalizeContributionText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("es")
    .replaceAll(/\s+/g, " ");
}

export function getReachedContributionMilestones<
  T extends readonly ContributionMilestone[],
>(milestones: T, eligibleLikes: number) {
  return milestones.filter(({ likes }) => likes <= eligibleLikes);
}
