import { manualEngagementQuestionsSchema } from "@repo/shared/schemas";
import { describe, expect, it } from "vitest";

describe("manualEngagementQuestionsSchema", () => {
  it("allows up to two normalized prompts", () => {
    const result = manualEngagementQuestionsSchema.safeParse([
      " Seamos honestos... este conflicto sostiene todo. ",
      "Nadie lo dice, pero... este giro define el post.",
    ]);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual([
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

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.message).toBe(
      "Solo se permiten hasta 2 preguntas manuales."
    );
  });
});
