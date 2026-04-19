import type { forbiddenContentRule } from "@repo/db/schema/app";

import type { Context } from "../context";

const COMBINING_MARKS_PATTERN = /[\u0300-\u036F]/g;
const HTTP_PROTOCOL_PATTERN = /^https?:\/\//;
const HTTP_PROTOCOL_GLOBAL_PATTERN = /https?:\/\//g;
const MULTIPLE_WHITESPACE_PATTERN = /\s+/g;
const TRAILING_SLASH_PATTERN = /\/+$/;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;
const WWW_PREFIX_PATTERN = /^www\./;
const WWW_PREFIX_GLOBAL_PATTERN = /\bwww\./g;

type ForbiddenContentRule = Pick<
  typeof forbiddenContentRule.$inferSelect,
  "kind" | "normalizedValue" | "value"
>;

type ForbiddenContentMatch = {
  values: string[];
};

export function normalizeForbiddenContentValue(value: string, kind: string) {
  const normalized = normalizeForMatching(value);

  if (kind === "url") {
    return normalized
      .replace(HTTP_PROTOCOL_PATTERN, "")
      .replace(WWW_PREFIX_PATTERN, "")
      .replace(TRAILING_SLASH_PATTERN, "");
  }

  return normalized;
}

export async function assertContentHasNoForbiddenTerms(params: {
  content: string;
  db: Context["db"];
  errors: {
    BAD_REQUEST: (error?: { message?: string }) => Error;
  };
}) {
  const rules = await params.db.query.forbiddenContentRule.findMany({
    columns: {
      kind: true,
      normalizedValue: true,
      value: true,
    },
    where: (rule, { eq }) => eq(rule.isActive, true),
  });

  const match = findForbiddenContentMatch(params.content, rules);

  if (!match) {
    return;
  }

  throw params.errors.BAD_REQUEST({
    message: createForbiddenContentMessage(match.values),
  });
}

export function findForbiddenContentMatch(
  content: string,
  rules: readonly ForbiddenContentRule[]
): ForbiddenContentMatch | null {
  const normalizedContent = normalizeForMatching(content);
  const normalizedUrlContent = normalizedContent
    .replace(HTTP_PROTOCOL_GLOBAL_PATTERN, "")
    .replace(WWW_PREFIX_GLOBAL_PATTERN, "");
  const values: string[] = [];

  for (const rule of rules) {
    if (rule.normalizedValue.length === 0) {
      continue;
    }

    const hasMatch =
      rule.kind === "word"
        ? containsForbiddenWord(normalizedContent, rule.normalizedValue)
        : rule.kind === "url"
          ? normalizedUrlContent.includes(rule.normalizedValue)
          : normalizedContent.includes(rule.normalizedValue);

    if (hasMatch) {
      values.push(rule.value);
    }

    if (values.length >= 3) {
      break;
    }
  }

  return values.length > 0 ? { values } : null;
}

function createForbiddenContentMessage(values: readonly string[]) {
  const list = values.join(", ");

  return `No pudimos publicar tu contenido porque incluye terminos no permitidos: ${list}. Editalo y vuelve a intentarlo.`;
}

function normalizeForMatching(value: string) {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replace(MULTIPLE_WHITESPACE_PATTERN, " ")
    .trim();
}

function containsForbiddenWord(content: string, word: string) {
  let startIndex = content.indexOf(word);

  while (startIndex !== -1) {
    const previousCharacter = content[startIndex - 1] ?? "";
    const nextCharacter = content[startIndex + word.length] ?? "";
    const startsAtBoundary =
      previousCharacter === "" ||
      !WORD_CHARACTER_PATTERN.test(previousCharacter);
    const endsAtBoundary =
      nextCharacter === "" || !WORD_CHARACTER_PATTERN.test(nextCharacter);

    if (startsAtBoundary && endsAtBoundary) {
      return true;
    }

    startIndex = content.indexOf(word, startIndex + 1);
  }

  return false;
}
