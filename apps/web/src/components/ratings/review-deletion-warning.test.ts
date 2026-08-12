import { describe, expect, it } from "vitest";

import {
  getReviewDeletionDescription,
  getReviewRemovalDescription,
} from "./review-deletion-warning";

describe("review deletion warning", () => {
  it("states the exact settled XP and debt risk", () => {
    expect(
      getReviewDeletionDescription({
        mayCreateEterisDebt: true,
        settledXp: 175,
      })
    ).toContain("175 Account XP y puede dejar tu Billetera Eteris con deuda");
  });

  it("keeps the star rating while warning about review reward reversal", () => {
    expect(
      getReviewRemovalDescription({
        mayCreateEterisDebt: true,
        settledXp: 175,
      })
    ).toBe(
      "Quitar esta reseña revertirá 175 Account XP y puede dejar tu Billetera Eteris con deuda. Tu puntuación se conservará."
    );
  });
});
