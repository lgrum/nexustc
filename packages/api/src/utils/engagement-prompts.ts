import { normalizeEngagementPromptText } from "@repo/shared/engagement-prompts";

export type EngagementPrompt = {
  id: string;
  text: string;
  source: "manual" | "tag";
  tagTermId: string | null;
};

type ManualOverrideCandidate = {
  id: string;
  text: string;
};

type AutomaticQuestionCandidate = {
  id: string;
  text: string;
  tagTermId: string | null;
};

function dedupePromptsByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const normalizedText = normalizeEngagementPromptText(item.text);
    if (!normalizedText) {
      continue;
    }

    const key = normalizedText.toLocaleLowerCase("es");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      ...item,
      text: normalizedText,
    });
  }

  return deduped;
}

function pickRandomItems<T>(items: T[], random: () => number): T[] {
  const pool = [...items];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }

  return pool;
}

export function selectAutomaticEngagementPrompts(
  items: AutomaticQuestionCandidate[],
  random: () => number = Math.random
): EngagementPrompt[] {
  const deduped = dedupePromptsByText(items);
  if (deduped.length === 0) {
    return [];
  }

  if (deduped.length === 1) {
    const [onlyPrompt] = deduped;
    return [
      {
        id: onlyPrompt!.id,
        text: onlyPrompt!.text,
        source: "tag",
        tagTermId: onlyPrompt!.tagTermId,
      },
    ];
  }

  const promptsByGroup = new Map<string, AutomaticQuestionCandidate[]>();
  for (const item of pickRandomItems(deduped, random)) {
    const groupKey = item.tagTermId ?? "__global__";
    const group = promptsByGroup.get(groupKey) ?? [];
    group.push(item);
    promptsByGroup.set(groupKey, group);
  }

  const selected: AutomaticQuestionCandidate[] = [];
  const selectedIds = new Set<string>();

  for (const groupKey of pickRandomItems([...promptsByGroup.keys()], random)) {
    if (selected.length === 2) {
      break;
    }

    const [candidate] = promptsByGroup.get(groupKey) ?? [];
    if (!candidate) {
      continue;
    }

    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  if (selected.length < 2) {
    for (const candidate of pickRandomItems(deduped, random)) {
      if (selectedIds.has(candidate.id)) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.id);

      if (selected.length === 2) {
        break;
      }
    }
  }

  return selected.map((item) => ({
    id: item.id,
    text: item.text,
    source: "tag",
    tagTermId: item.tagTermId,
  }));
}

export function resolveEngagementPrompts(
  manualOverrides: ManualOverrideCandidate[],
  automaticQuestions: AutomaticQuestionCandidate[],
  random: () => number = Math.random
): EngagementPrompt[] {
  const normalizedManualOverrides = dedupePromptsByText(manualOverrides).map(
    (item) => ({
      id: item.id,
      text: item.text,
      source: "manual" as const,
      tagTermId: null,
    })
  );

  if (normalizedManualOverrides.length > 0) {
    return normalizedManualOverrides;
  }

  return selectAutomaticEngagementPrompts(automaticQuestions, random);
}
