const SPANISH_LOCALE = "es";
const NEWLINE_SPLIT_REGEX = /\r?\n/;

export function normalizeEngagementPromptText(text: string): string {
  return text.trim();
}

export function normalizeEngagementPromptList(prompts: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const prompt of prompts) {
    const trimmed = normalizeEngagementPromptText(prompt);

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLocaleLowerCase(SPANISH_LOCALE);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function engagementPromptListFromTextarea(text: string): string[] {
  return normalizeEngagementPromptList(text.split(NEWLINE_SPLIT_REGEX));
}

export function engagementPromptListToTextarea(prompts: string[]): string {
  return normalizeEngagementPromptList(prompts).join("\n");
}
