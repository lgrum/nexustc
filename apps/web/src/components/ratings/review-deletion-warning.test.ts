import { describe, expect, it } from "vitest";

import { getReviewDeletionDescription } from "./review-deletion-warning";

describe("review deletion warning", () => {
  it("states the exact settled XP and debt risk", () => {
    expect(
      getReviewDeletionDescription({
        mayCreateEterisDebt: true,
        settledXp: 175,
      })
    ).toContain("175 Account XP y puede dejar tu Billetera Eteris con deuda");
  });
});
