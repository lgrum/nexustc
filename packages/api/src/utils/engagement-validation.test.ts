import { manualEngagementQuestionsSchema } from "@repo/shared/schemas";

describe("manual engagement questions schema", () => {
  it("allows up to two normalized prompts", () => {
    const result = manualEngagementQuestionsSchema.safeParse([
      " Seamos honestos... este conflicto sostiene todo. ",
      "Nadie lo dice, pero... este giro define el post.",
    ]);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toStrictEqual([
      "Seamos honestos... este conflicto sostiene todo.",
      "Nadie lo dice, pero... este giro define el post.",
    ]);
  });

  it("rejects more than two manual prompts after normalization", () => {
    const result = manualEngagementQuestionsSchema.safeParse([
      "Uno",
      "Dos",
      "Tres",
    ]);

    console.log(result);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.message).toBe(
      "Solo se permiten hasta 2 preguntas manuales."
    );
  });
});
