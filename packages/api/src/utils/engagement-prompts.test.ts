import { describe, expect, it } from "vitest";
import {
  resolveEngagementPrompts,
  selectAutomaticEngagementPrompts,
} from "./engagement-prompts";

function createDeterministicRandom(...values: number[]) {
  let index = 0;

  return () => {
    const value = values[index] ?? values.at(-1) ?? 0;
    index += 1;
    return value;
  };
}

describe("resolveEngagementPrompts", () => {
  it("prioritizes manual overrides over automatic prompts", () => {
    const prompts = resolveEngagementPrompts(
      [
        {
          id: "manual-1",
          text: "Seamos honestos... que sostiene de verdad este post?",
        },
      ],
      [
        {
          id: "auto-1",
          text: "Nadie lo dice, pero... este tag ya no sorprende.",
          tagTermId: "tag-1",
        },
      ]
    );

    expect(prompts).toEqual([
      {
        id: "manual-1",
        text: "Seamos honestos... que sostiene de verdad este post?",
        source: "manual",
        tagTermId: null,
      },
    ]);
  });

  it("returns an empty array when there are no eligible prompts", () => {
    expect(resolveEngagementPrompts([], [])).toEqual([]);
  });
});

describe("selectAutomaticEngagementPrompts", () => {
  it("returns a single prompt without rotation when only one is eligible", () => {
    const prompts = selectAutomaticEngagementPrompts([
      {
        id: "auto-1",
        text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
        tagTermId: "tag-1",
      },
    ]);

    expect(prompts).toEqual([
      {
        id: "auto-1",
        text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
        source: "tag",
        tagTermId: "tag-1",
      },
    ]);
  });

  it("prefers different groups when two compatible prompts are available", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          text: "Seamos honestos... el diseno aca pesa mas que el guion.",
          tagTermId: "tag-1",
        },
        {
          id: "auto-2",
          text: "Nadie lo dice, pero... este protagonista estorba mas de lo que suma.",
          tagTermId: null,
        },
        {
          id: "auto-3",
          text: "Quitando el morbo... el conflicto acompana al tag o solo lo decora?",
          tagTermId: "tag-2",
        },
      ],
      createDeterministicRandom(0, 0, 0, 0)
    );

    expect(prompts).toHaveLength(2);
    expect(
      new Set(prompts.map((prompt) => prompt.tagTermId ?? "global")).size
    ).toBe(2);
  });

  it("can return a global prompt when a post has no matching tag-specific bank", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          text: "Seamos honestos... este post vive o muere por la primera impresion.",
          tagTermId: null,
        },
      ],
      createDeterministicRandom(0)
    );

    expect(prompts).toEqual([
      {
        id: "auto-1",
        text: "Seamos honestos... este post vive o muere por la primera impresion.",
        source: "tag",
        tagTermId: null,
      },
    ]);
  });

  it("falls back to the same group when there is no second compatible group", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          text: "Seamos honestos... este tag ya hace la mitad del trabajo solo.",
          tagTermId: "tag-1",
        },
        {
          id: "auto-2",
          text: "Nadie lo dice, pero... si quitas este detalle, el post pierde casi todo.",
          tagTermId: "tag-1",
        },
      ],
      createDeterministicRandom(0, 0, 0)
    );

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.tagTermId === "tag-1")).toBe(true);
  });

  it("deduplicates prompts by normalized text before selecting", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          text: "  Seamos honestos... este tag define todo.  ",
          tagTermId: "tag-1",
        },
        {
          id: "auto-2",
          text: "seamos honestos... este tag define todo.",
          tagTermId: null,
        },
      ],
      createDeterministicRandom(0)
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.text).toBe("Seamos honestos... este tag define todo.");
  });
});
