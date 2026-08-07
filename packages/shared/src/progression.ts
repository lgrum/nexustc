export const ACCOUNT_LEVEL_CURVE_VERSION = "v1";
export const ACCOUNT_LEVEL_REWARD_CONFIG_VERSION = "v1";
export const ACCOUNT_LEVEL_XP_CAP = 365_000;
export const MAX_ACCOUNT_LEVEL = 1000;

export function getAccountLevelReward(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_ACCOUNT_LEVEL) {
    throw new RangeError("Account Level esta fuera del rango publicado.");
  }
  if (level === 1) {
    return 0;
  }
  return (
    10 +
    (level % 10 === 0 ? 25 : 0) +
    (level % 50 === 0 ? 100 : 0) +
    (level % 100 === 0 ? 250 : 0)
  );
}

export const ACCOUNT_LEVEL_REWARD_TOTAL = Array.from(
  { length: MAX_ACCOUNT_LEVEL },
  (_, index) => getAccountLevelReward(index + 1)
).reduce((total, reward) => total + reward, 0);

const ACCOUNT_LEVEL_ANCHORS = [
  [1, 0],
  [10, 600],
  [50, 4200],
  [100, 12_000],
  [250, 48_000],
  [500, 146_000],
  [1000, ACCOUNT_LEVEL_XP_CAP],
] as const;

function buildAccountLevelThresholds(): readonly number[] {
  const thresholds = Array.from({ length: MAX_ACCOUNT_LEVEL }, () => 0);

  for (
    let anchorIndex = 0;
    anchorIndex < ACCOUNT_LEVEL_ANCHORS.length - 1;
    anchorIndex += 1
  ) {
    const [startLevel, startXp] = ACCOUNT_LEVEL_ANCHORS[anchorIndex]!;
    const [endLevel, endXp] = ACCOUNT_LEVEL_ANCHORS[anchorIndex + 1]!;

    for (let level = startLevel; level <= endLevel; level += 1) {
      thresholds[level - 1] = Math.round(
        startXp +
          ((endXp - startXp) * (level - startLevel)) / (endLevel - startLevel)
      );
    }
  }

  assertValidAccountLevelThresholds(thresholds);
  return Object.freeze(thresholds);
}

function assertValidAccountLevelThresholds(thresholds: readonly number[]) {
  if (
    thresholds.length !== MAX_ACCOUNT_LEVEL ||
    thresholds[0] !== 0 ||
    thresholds.at(-1) !== ACCOUNT_LEVEL_XP_CAP
  ) {
    throw new Error("La curva de Account Level no coincide con sus limites.");
  }

  for (let index = 1; index < thresholds.length; index += 1) {
    if (thresholds[index]! <= thresholds[index - 1]!) {
      throw new Error(`El umbral del nivel ${index + 1} no es creciente.`);
    }
  }
}

export const ACCOUNT_LEVEL_THRESHOLDS = buildAccountLevelThresholds();
export const ACCOUNT_LEVEL_CURVES: Readonly<Record<string, readonly number[]>> =
  Object.freeze({ v1: ACCOUNT_LEVEL_THRESHOLDS });

export function getAccountLevelProgress(totalXp: number) {
  if (
    !Number.isInteger(totalXp) ||
    totalXp < 0 ||
    totalXp > ACCOUNT_LEVEL_XP_CAP
  ) {
    throw new RangeError(
      "Account XP debe ser un entero dentro del rango permitido."
    );
  }

  let low = 0;
  let high = ACCOUNT_LEVEL_THRESHOLDS.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (ACCOUNT_LEVEL_THRESHOLDS[middle]! <= totalXp) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const level = high + 1;
  if (level === MAX_ACCOUNT_LEVEL) {
    return {
      level,
      nextLevelTotalXp: null,
      progress: 1,
      xpForNextLevel: null,
    };
  }

  const currentLevelTotalXp = ACCOUNT_LEVEL_THRESHOLDS[level - 1]!;
  const nextLevelTotalXp = ACCOUNT_LEVEL_THRESHOLDS[level]!;
  return {
    level,
    nextLevelTotalXp,
    progress:
      (totalXp - currentLevelTotalXp) /
      (nextLevelTotalXp - currentLevelTotalXp),
    xpForNextLevel: nextLevelTotalXp - totalXp,
  };
}

export function assertCompatibleAccountLevelThresholds(
  previous: readonly number[],
  current: readonly number[],
  highestReachedLevel: number
) {
  if (
    !Number.isInteger(highestReachedLevel) ||
    highestReachedLevel < 1 ||
    highestReachedLevel > MAX_ACCOUNT_LEVEL
  ) {
    throw new RangeError("El nivel alcanzado esta fuera del rango permitido.");
  }

  assertValidAccountLevelThresholds(previous);
  assertValidAccountLevelThresholds(current);

  for (let index = 0; index < highestReachedLevel; index += 1) {
    if (current[index]! > previous[index]!) {
      throw new Error(`No se puede elevar el umbral del nivel ${index + 1}.`);
    }
  }
}
