import { getCommentDeletionDescription } from "./comment-deletion-warning";

describe("comment deletion warning", () => {
  it("states the exact settled XP and debt risk", () => {
    expect(
      getCommentDeletionDescription({
        mayCreateEterisDebt: true,
        settledXp: 310,
      })
    ).toContain("310 Account XP y puede dejar tu Billetera Eteris con deuda");
  });
});
