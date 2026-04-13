import type {
  BadgeStage,
  FeatureDefinition,
  FeatureDiffStatus,
  FeatureValue,
  MembershipTier,
  MembershipUpgradeConfig,
  SurveyQuestion,
} from "@/features/vip-upgrade/types";

export type SurveyAnswers = Record<string, string>;

export type FeatureComparison = {
  currentValue: FeatureValue | null;
  definition: FeatureDefinition;
  scoreDelta: number;
  status: FeatureDiffStatus;
  targetValue: FeatureValue | null;
};

export function sortTiers(config: MembershipUpgradeConfig): MembershipTier[] {
  return [...config.tiers].toSorted((left, right) => left.order - right.order);
}

export function getTierById(
  config: MembershipUpgradeConfig,
  tierId: string
): MembershipTier {
  const tier = config.tiers.find((current) => current.id === tierId);

  if (!tier) {
    throw new Error(`Unknown tier: ${tierId}`);
  }

  return tier;
}

export function resolveTierIdFromSource(
  config: MembershipUpgradeConfig,
  sourceTierKey: string | null | undefined
): string | null {
  if (!sourceTierKey) {
    return null;
  }

  return (
    config.tiers.find((tier) => tier.sourceTierKey === sourceTierKey)?.id ??
    null
  );
}

function getFeatureValueScore(value: FeatureValue | null): number {
  if (!value) {
    return 0;
  }

  switch (value.kind) {
    case "ad-preview": {
      return value.adFree ? value.slots + 5 : value.slots;
    }
    case "assets": {
      return value.items.length;
    }
    case "boolean": {
      return value.enabled ? 1 : 0;
    }
    case "counter": {
      return value.value;
    }
    case "palette": {
      return value.palettes.length;
    }
    case "timeline": {
      return value.phases.reduce(
        (total, phase, index) => total + phase.hours * (index + 1),
        0
      );
    }
    default: {
      return 0;
    }
  }
}

function areFeatureValuesEqual(
  currentValue: FeatureValue | null,
  targetValue: FeatureValue | null
): boolean {
  return JSON.stringify(currentValue) === JSON.stringify(targetValue);
}

export function compareFeatureValues(
  definition: FeatureDefinition,
  currentValue: FeatureValue | null,
  targetValue: FeatureValue | null
): FeatureComparison | null {
  const currentScore = getFeatureValueScore(currentValue);
  const targetScore = getFeatureValueScore(targetValue);
  const scoreDelta = targetScore - currentScore;

  if (currentScore === 0 && targetScore === 0) {
    return null;
  }

  const status: FeatureDiffStatus = areFeatureValuesEqual(
    currentValue,
    targetValue
  )
    ? "shared"
    : scoreDelta > 0
      ? "unlocked"
      : "missing";

  return {
    currentValue,
    definition,
    scoreDelta,
    status,
    targetValue,
  };
}

export function buildFeatureComparisons(
  config: MembershipUpgradeConfig,
  currentTier: MembershipTier,
  targetTier: MembershipTier
): FeatureComparison[] {
  return config.features
    .map((definition) =>
      compareFeatureValues(
        definition,
        currentTier.featureValues[definition.id] ?? null,
        targetTier.featureValues[definition.id] ?? null
      )
    )
    .filter((comparison) => comparison !== null);
}

export function getRecommendedTierId(
  config: MembershipUpgradeConfig,
  answers: SurveyAnswers,
  currentTierId: string
): string {
  const currentTier = getTierById(config, currentTierId);
  const eligibleTiers = sortTiers(config).filter(
    (tier) => tier.order >= currentTier.order
  );

  const scores = new Map(
    eligibleTiers.map((tier) => [tier.id, tier.recommendationBonus])
  );

  for (const question of config.recommendation.questions) {
    const answerId = answers[question.id];

    if (!answerId) {
      continue;
    }

    const option = question.options.find((item) => item.id === answerId);

    if (!option) {
      continue;
    }

    for (const [tierId, weight] of Object.entries(option.weights)) {
      if (!scores.has(tierId)) {
        continue;
      }

      scores.set(tierId, (scores.get(tierId) ?? 0) + weight);
    }
  }

  const fallbackTierId = eligibleTiers.some(
    (tier) => tier.id === config.recommendation.fallbackTierId
  )
    ? config.recommendation.fallbackTierId
    : (eligibleTiers.at(-1)?.id ?? currentTier.id);

  let winnerTierId = fallbackTierId;
  let winnerScore = Number.NEGATIVE_INFINITY;

  for (const tier of eligibleTiers) {
    const score = scores.get(tier.id) ?? 0;

    if (score > winnerScore) {
      winnerScore = score;
      winnerTierId = tier.id;
    }
  }

  return winnerTierId;
}

export function getSelectedSurveySummary(
  question: SurveyQuestion,
  answerId: string | undefined
): string | null {
  return (
    question.options.find((option) => option.id === answerId)?.summary ?? null
  );
}

export function getActiveBadgeStage(
  stages: BadgeStage[],
  months: number
): BadgeStage {
  return (
    [...stages]
      .toSorted((left, right) => left.monthsRequired - right.monthsRequired)
      .findLast((stage) => stage.monthsRequired <= months) ?? stages[0]
  );
}

export function getNextBadgeStage(
  stages: BadgeStage[],
  months: number
): BadgeStage | null {
  return (
    [...stages]
      .toSorted((left, right) => left.monthsRequired - right.monthsRequired)
      .find((stage) => stage.monthsRequired > months) ?? null
  );
}

export function getBadgeProgressPercent(
  stages: BadgeStage[],
  months: number
): number {
  const currentStage = getActiveBadgeStage(stages, months);
  const nextStage = getNextBadgeStage(stages, months);

  if (!nextStage) {
    return 100;
  }

  const range = nextStage.monthsRequired - currentStage.monthsRequired;

  if (range <= 0) {
    return 100;
  }

  return Math.min(
    100,
    Math.max(0, ((months - currentStage.monthsRequired) / range) * 100)
  );
}
