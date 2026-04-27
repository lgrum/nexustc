import { normalizeEngagementPromptText } from "@repo/shared/engagement-prompts";

export type EngagementPrompt = {
  id: string;
  text: string;
  source: "manual" | "tag";
  tagTermId: string | null;
};

const MAX_ENGAGEMENT_PROMPTS_PER_POST = 10;

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

function resolveManualEngagementPrompts(
  manualOverrides: ManualOverrideCandidate[]
): EngagementPrompt[] {
  return dedupePromptsByText(manualOverrides).map((item) => ({
    id: item.id,
    source: "manual" as const,
    tagTermId: null,
    text: item.text,
  }));
}

function resolveAutomaticEngagementPrompts(
  automaticQuestions: AutomaticQuestionCandidate[]
): EngagementPrompt[] {
  return dedupePromptsByText(automaticQuestions).map((item) => ({
    id: item.id,
    source: "tag" as const,
    tagTermId: item.tagTermId,
    text: item.text,
  }));
}

function pickRandomItems<T>(items: T[], random: () => number): T[] {
  const pool = [...items];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }

  return pool;
}

function limitEngagementPrompts(
  prompts: EngagementPrompt[]
): EngagementPrompt[] {
  return prompts.slice(0, MAX_ENGAGEMENT_PROMPTS_PER_POST);
}

function mergeEngagementPrompts(
  manualPrompts: EngagementPrompt[],
  automaticPrompts: EngagementPrompt[]
): EngagementPrompt[] {
  return limitEngagementPrompts(
    dedupePromptsByText([...manualPrompts, ...automaticPrompts])
  );
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
        source: "tag",
        tagTermId: onlyPrompt!.tagTermId,
        text: onlyPrompt!.text,
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
    if (selected.length === MAX_ENGAGEMENT_PROMPTS_PER_POST) {
      break;
    }

    const [candidate] = promptsByGroup.get(groupKey) ?? [];
    if (!candidate) {
      continue;
    }

    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  if (selected.length < MAX_ENGAGEMENT_PROMPTS_PER_POST) {
    for (const candidate of pickRandomItems(deduped, random)) {
      if (selectedIds.has(candidate.id)) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.id);

      if (selected.length === MAX_ENGAGEMENT_PROMPTS_PER_POST) {
        break;
      }
    }
  }

  return selected.map((item) => ({
    id: item.id,
    source: "tag",
    tagTermId: item.tagTermId,
    text: item.text,
  }));
}

export function resolveEngagementPrompts(
  manualOverrides: ManualOverrideCandidate[],
  automaticQuestions: AutomaticQuestionCandidate[],
  random: () => number = Math.random
): EngagementPrompt[] {
  const normalizedManualOverrides =
    resolveManualEngagementPrompts(manualOverrides);
  const automaticPrompts = selectAutomaticEngagementPrompts(
    automaticQuestions,
    random
  );

  return mergeEngagementPrompts(normalizedManualOverrides, automaticPrompts);
}

export function resolveSelectableEngagementPrompts(
  manualOverrides: ManualOverrideCandidate[],
  automaticQuestions: AutomaticQuestionCandidate[]
): EngagementPrompt[] {
  const normalizedManualOverrides =
    resolveManualEngagementPrompts(manualOverrides);
  const automaticPrompts =
    resolveAutomaticEngagementPrompts(automaticQuestions);

  return mergeEngagementPrompts(normalizedManualOverrides, automaticPrompts);
}
