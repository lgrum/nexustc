import {
  resolveEngagementPrompts,
  resolveSelectableEngagementPrompts,
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

describe(resolveEngagementPrompts, () => {
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
          tagTermId: "tag-1",
          text: "Nadie lo dice, pero... este tag ya no sorprende.",
        },
      ]
    );

    expect(prompts).toStrictEqual([
      {
        id: "manual-1",
        source: "manual",
        tagTermId: null,
        text: "Seamos honestos... que sostiene de verdad este post?",
      },
    ]);
  });

  it("returns an empty array when there are no eligible prompts", () => {
    expect(resolveEngagementPrompts([], [])).toStrictEqual([]);
  });
});

describe(resolveSelectableEngagementPrompts, () => {
  it("keeps every eligible automatic prompt selectable", () => {
    const prompts = resolveSelectableEngagementPrompts(
      [],
      [
        {
          id: "auto-1",
          tagTermId: null,
          text: "Seamos honestos... este post vive o muere por la primera impresion.",
        },
        {
          id: "auto-2",
          tagTermId: "tag-1",
          text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
        },
        {
          id: "auto-3",
          tagTermId: "tag-2",
          text: "Nadie lo dice, pero... este giro suma tension o solo ruido?",
        },
      ]
    );

    expect(prompts).toStrictEqual([
      {
        id: "auto-1",
        source: "tag",
        tagTermId: null,
        text: "Seamos honestos... este post vive o muere por la primera impresion.",
      },
      {
        id: "auto-2",
        source: "tag",
        tagTermId: "tag-1",
        text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
      },
      {
        id: "auto-3",
        source: "tag",
        tagTermId: "tag-2",
        text: "Nadie lo dice, pero... este giro suma tension o solo ruido?",
      },
    ]);
  });

  it("keeps manual overrides as the only selectable prompts when present", () => {
    const prompts = resolveSelectableEngagementPrompts(
      [
        {
          id: "manual-1",
          text: "Seamos honestos... que sostiene de verdad este post?",
        },
      ],
      [
        {
          id: "auto-1",
          tagTermId: null,
          text: "Nadie lo dice, pero... este prompt global no deberia aplicar.",
        },
      ]
    );

    expect(prompts).toStrictEqual([
      {
        id: "manual-1",
        source: "manual",
        tagTermId: null,
        text: "Seamos honestos... que sostiene de verdad este post?",
      },
    ]);
  });
});

describe(selectAutomaticEngagementPrompts, () => {
  it("returns a single prompt without rotation when only one is eligible", () => {
    const prompts = selectAutomaticEngagementPrompts([
      {
        id: "auto-1",
        tagTermId: "tag-1",
        text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
      },
    ]);

    expect(prompts).toStrictEqual([
      {
        id: "auto-1",
        source: "tag",
        tagTermId: "tag-1",
        text: "Quitando el morbo... que vende mejor este tag: tension o fantasia?",
      },
    ]);
  });

  it("prefers different groups when two compatible prompts are available", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          tagTermId: "tag-1",
          text: "Seamos honestos... el diseno aca pesa mas que el guion.",
        },
        {
          id: "auto-2",
          tagTermId: null,
          text: "Nadie lo dice, pero... este protagonista estorba mas de lo que suma.",
        },
        {
          id: "auto-3",
          tagTermId: "tag-2",
          text: "Quitando el morbo... el conflicto acompana al tag o solo lo decora?",
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
          tagTermId: null,
          text: "Seamos honestos... este post vive o muere por la primera impresion.",
        },
      ],
      createDeterministicRandom(0)
    );

    expect(prompts).toStrictEqual([
      {
        id: "auto-1",
        source: "tag",
        tagTermId: null,
        text: "Seamos honestos... este post vive o muere por la primera impresion.",
      },
    ]);
  });

  it("falls back to the same group when there is no second compatible group", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          tagTermId: "tag-1",
          text: "Seamos honestos... este tag ya hace la mitad del trabajo solo.",
        },
        {
          id: "auto-2",
          tagTermId: "tag-1",
          text: "Nadie lo dice, pero... si quitas este detalle, el post pierde casi todo.",
        },
      ],
      createDeterministicRandom(0, 0, 0)
    );

    expect(prompts).toHaveLength(2);
    expect(
      prompts.every((prompt) => prompt.tagTermId === "tag-1")
    ).toBeTruthy();
  });

  it("deduplicates prompts by normalized text before selecting", () => {
    const prompts = selectAutomaticEngagementPrompts(
      [
        {
          id: "auto-1",
          tagTermId: "tag-1",
          text: "  Seamos honestos... este tag define todo.  ",
        },
        {
          id: "auto-2",
          tagTermId: null,
          text: "seamos honestos... este tag define todo.",
        },
      ],
      createDeterministicRandom(0)
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.text).toBe("Seamos honestos... este tag define todo.");
  });
});
