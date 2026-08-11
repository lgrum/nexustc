import { describe, expect, it } from "vitest";

import {
  COMMENT_MILESTONES,
  REVIEW_MILESTONES,
  getReachedContributionMilestones,
  normalizeContributionText,
} from "./contribution-rewards";

describe("review contribution rewards", () => {
  it("publishes the approved incremental milestones", () => {
    expect(REVIEW_MILESTONES).toEqual([
      { likes: 3, xp: 25 },
      { likes: 10, xp: 50 },
      { likes: 25, xp: 100 },
      { likes: 50, xp: 200 },
      { likes: 100, xp: 400 },
    ]);
    expect(getReachedContributionMilestones(REVIEW_MILESTONES, 25)).toEqual(
      REVIEW_MILESTONES.slice(0, 3)
    );
  });

  it("normalizes only exact textual equivalents", () => {
    expect(normalizeContributionText("  Reseña\n\tÚtil  ")).toBe("reseña útil");
    expect(normalizeContributionText("reseña muy útil")).not.toBe(
      normalizeContributionText("reseña útil")
    );
  });
});

describe("comment contribution rewards", () => {
  it("publishes the approved incremental milestones", () => {
    expect(COMMENT_MILESTONES).toEqual([
      { likes: 2, xp: 10 },
      { likes: 10, xp: 20 },
      { likes: 25, xp: 40 },
      { likes: 50, xp: 80 },
      { likes: 100, xp: 160 },
    ]);
  });
});
