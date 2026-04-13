import { resolveCommentEngagementSelection } from "./comment-engagement";

const prompts = [
  {
    id: "manual-1",
    source: "manual" as const,
    tagTermId: null,
    text: "Seamos honestos... esta quimica sostiene todo el post?",
  },
  {
    id: "tag-1",
    source: "tag" as const,
    tagTermId: "tag-romance",
    text: "Nadie lo dice, pero... este giro suma tension o solo ruido?",
  },
];

describe(resolveCommentEngagementSelection, () => {
  it("returns null when no prompt was selected", () => {
    expect(resolveCommentEngagementSelection(prompts)).toBeNull();
  });

  it("returns the matching prompt metadata for a valid selection", () => {
    expect(
      resolveCommentEngagementSelection(prompts, {
        id: "tag-1",
        source: "tag",
      })
    ).toStrictEqual(prompts[1]);
  });

  it("rejects selections whose id exists under a different source", () => {
    expect(
      resolveCommentEngagementSelection(prompts, {
        id: "manual-1",
        source: "tag",
      })
    ).toBeNull();
  });
});
