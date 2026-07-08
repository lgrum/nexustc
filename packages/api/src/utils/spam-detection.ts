import { parseTokens } from "@repo/shared/token-parser";

const COMBINED_TOKEN_PATTERN = /:(\w[\w-]*):|\[sticker:(\w[\w-]*)\]/g;
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:com|net|org|io|gg|tv|me|co|app|dev|xyz|info|biz|link|site|online|store|club|cloud|art|to|ly|cc|fm|es|ar|br|mx|cl|pe|uy|de|fr|uk|us|ca|au)(?:[/?#:@]\S*)?)/iu;
const BLOCKED_DOWNLOAD_HOSTS = ["mediafire", "gofile"] as const;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const REPEATED_CHARACTER_PATTERN = /([\p{L}\p{N}!?,.;:_-])\1{9,}/u;
const MAX_IDENTICAL_EMOJI_RUN = 8;
const MAX_IDENTICAL_TOKEN_RUN = 6;
const MIN_REPEATED_SUBSTRING_LENGTH = 2;
const MAX_REPEATED_SUBSTRING_LENGTH = 24;
const MIN_REPEATED_SUBSTRING_REPETITIONS = 4;
const EXCESSIVE_BLANK_LINES_PATTERN = /\n[ \t]*\n[ \t]*\n/u;

export type SpamDetectionReason =
  | "blank_lines"
  | "low_diversity"
  | "repeated_characters"
  | "repeated_emoji"
  | "repeated_substring"
  | "repeated_tokens"
  | "repeated_words"
  | "url";

export type SpamDetectionResult =
  | { ok: true }
  | {
      message: string;
      ok: false;
      reason: SpamDetectionReason;
    };

type SpamUnit = {
  kind: "custom_emoji" | "sticker" | "unicode_emoji" | "word";
  value: string;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function block(reason: SpamDetectionReason, message: string) {
  return { message, ok: false, reason } as const;
}

function canBypassSpamDetection(role: string | null | undefined) {
  return role === "admin" || role === "owner";
}

function hasBlockedDownloadHost(content: string) {
  const compact = normalizeText(content).replaceAll(/[^\p{L}\p{N}]+/gu, "");
  return BLOCKED_DOWNLOAD_HOSTS.some((host) => compact.includes(host));
}

function getCustomTokenRanges(content: string) {
  return [...content.matchAll(COMBINED_TOKEN_PATTERN)].map((match) => ({
    end: match.index! + match[0].length,
    start: match.index!,
  }));
}

function isInsideRange(
  index: number,
  ranges: { end: number; start: number }[]
) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function getUnicodeEmojiUnits(content: string): SpamUnit[] {
  const customTokenRanges = getCustomTokenRanges(content);
  const units: SpamUnit[] = [];

  for (const match of content.matchAll(/\S/gu)) {
    const index = match.index!;
    const value = match[0]!;

    if (isInsideRange(index, customTokenRanges)) {
      continue;
    }

    if (EMOJI_PATTERN.test(value)) {
      units.push({ kind: "unicode_emoji", value });
    }
  }

  return units;
}

function getWordUnits(content: string): SpamUnit[] {
  return [...normalizeText(content).matchAll(WORD_PATTERN)].map((match) => ({
    kind: "word" as const,
    value: match[0]!,
  }));
}

function getSpamUnits(content: string): SpamUnit[] {
  const customTokenUnits = parseTokens(content).map((token) => ({
    kind:
      token.type === "emoji" ? ("custom_emoji" as const) : ("sticker" as const),
    value: token.name.toLowerCase(),
  }));

  return [
    ...customTokenUnits,
    ...getUnicodeEmojiUnits(content),
    ...getWordUnits(content),
  ];
}

function hasRepeatedUnitRun(
  units: SpamUnit[],
  maxRunLength: number,
  predicate: (unit: SpamUnit) => boolean
) {
  let previousKey: string | null = null;
  let runLength = 0;

  for (const unit of units) {
    const key = predicate(unit) ? `${unit.kind}:${unit.value}` : null;

    if (key && key === previousKey) {
      runLength += 1;
    } else {
      previousKey = key;
      runLength = key ? 1 : 0;
    }

    if (runLength >= maxRunLength) {
      return true;
    }
  }

  return false;
}

function hasDominantRepeatedWord(words: SpamUnit[]) {
  if (words.length < 8) {
    return false;
  }

  const counts = new Map<string, number>();

  for (const word of words) {
    counts.set(word.value, (counts.get(word.value) ?? 0) + 1);
  }

  return [...counts.values()].some(
    (count) => count >= 6 && count / words.length >= 0.6
  );
}

function hasRepeatedSubstring(content: string) {
  const compact = normalizeText(content)
    .replace(COMBINED_TOKEN_PATTERN, " token ")
    .replaceAll(/[^\p{L}\p{N}:_-]+/gu, "");

  if (compact.length < 16) {
    return false;
  }

  const maxLength = Math.min(
    MAX_REPEATED_SUBSTRING_LENGTH,
    Math.floor(compact.length / MIN_REPEATED_SUBSTRING_REPETITIONS)
  );

  for (let size = MIN_REPEATED_SUBSTRING_LENGTH; size <= maxLength; size += 1) {
    for (let start = 0; start <= compact.length - size * 4; start += 1) {
      const chunk = compact.slice(start, start + size);

      if (new Set(chunk).size === 1) {
        continue;
      }

      let repetitions = 1;
      let cursor = start + size;

      while (compact.slice(cursor, cursor + size) === chunk) {
        repetitions += 1;
        cursor += size;
      }

      if (
        repetitions >= MIN_REPEATED_SUBSTRING_REPETITIONS &&
        repetitions * size >= compact.length * 0.75
      ) {
        return true;
      }
    }
  }

  return false;
}

function hasLowDiversity(content: string, words: SpamUnit[]) {
  const compact = normalizeText(content)
    .replace(COMBINED_TOKEN_PATTERN, "")
    .replaceAll(/\s+/g, "");

  if (compact.length >= 40 && words.length < 8) {
    const uniqueCharacters = new Set(compact).size;

    if (uniqueCharacters / compact.length <= 0.18) {
      return true;
    }
  }

  if (words.length >= 12) {
    const uniqueWords = new Set(words.map((word) => word.value)).size;

    return uniqueWords / words.length <= 0.25;
  }

  return false;
}

export function detectSpammyText(content: string): SpamDetectionResult {
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return content.length === 0
      ? { ok: true }
      : block("blank_lines", "Tu mensaje necesita algo de texto.");
  }

  if (EXCESSIVE_BLANK_LINES_PATTERN.test(content)) {
    return block(
      "blank_lines",
      "Tu mensaje tiene demasiadas lineas vacias seguidas."
    );
  }

  if (URL_PATTERN.test(trimmedContent)) {
    return block(
      "url",
      "Tu mensaje no puede incluir enlaces. Quitalos antes de enviarlo."
    );
  }

  if (hasBlockedDownloadHost(trimmedContent)) {
    return block(
      "url",
      "Tu mensaje no puede incluir enlaces de descarga. Quitalos antes de enviarlo."
    );
  }

  if (REPEATED_CHARACTER_PATTERN.test(trimmedContent)) {
    return block(
      "repeated_characters",
      "Tu mensaje parece repetir demasiados caracteres. Ajustalo antes de enviarlo."
    );
  }

  const units = getSpamUnits(trimmedContent);
  const emojiUnits = units.filter(
    (unit) => unit.kind === "custom_emoji" || unit.kind === "unicode_emoji"
  );
  const wordUnits = units.filter((unit) => unit.kind === "word");

  if (
    hasRepeatedUnitRun(
      emojiUnits,
      MAX_IDENTICAL_EMOJI_RUN,
      (unit) => unit.kind === "custom_emoji" || unit.kind === "unicode_emoji"
    )
  ) {
    return block(
      "repeated_emoji",
      "Tu mensaje tiene demasiados emojis repetidos. Reducelos antes de enviarlo."
    );
  }

  if (
    hasRepeatedUnitRun(
      units,
      MAX_IDENTICAL_TOKEN_RUN,
      (unit) => unit.kind === "custom_emoji" || unit.kind === "sticker"
    )
  ) {
    return block(
      "repeated_tokens",
      "Tu mensaje repite demasiados emojis o stickers personalizados."
    );
  }

  if (hasDominantRepeatedWord(wordUnits)) {
    return block(
      "repeated_words",
      "Tu mensaje parece repetir la misma palabra demasiadas veces."
    );
  }

  if (hasRepeatedSubstring(trimmedContent)) {
    return block(
      "repeated_substring",
      "Tu mensaje parece repetir el mismo patrón demasiadas veces."
    );
  }

  if (hasLowDiversity(trimmedContent, wordUnits)) {
    return block(
      "low_diversity",
      "Tu mensaje parece tener muy poca variedad. Escribe algo más claro antes de enviarlo."
    );
  }

  return { ok: true };
}

export function assertTextIsNotSpammy(
  content: string,
  errors: { BAD_REQUEST: (input?: { message?: string }) => Error },
  role?: string | null
) {
  if (canBypassSpamDetection(role)) {
    return;
  }

  const spamResult = detectSpammyText(content);

  if (!spamResult.ok) {
    throw errors.BAD_REQUEST({ message: spamResult.message });
  }
}
