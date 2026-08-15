import { render, screen } from "@testing-library/react";

import type { ProfileReviewItem } from "./profile-review-list";
import { ProfileReviewList } from "./profile-review-list";

const reviews: ProfileReviewItem[] = [
  {
    createdAt: "2026-01-10T12:00:00.000Z",
    postId: "comic-1",
    postSlug: "comic-one",
    postTitle: "Comic uno",
    postType: "comic",
    rating: 9,
    review: "Una reseña **excelente** con suficiente detalle.",
    updatedAt: "2026-01-11T12:00:00.000Z",
  },
];

describe(ProfileReviewList, () => {
  it("links reviews to the correct content route and renders markdown", () => {
    render(<ProfileReviewList items={reviews} />);

    expect(
      screen.getByRole("link", { name: "Comic uno" }).getAttribute("href")
    ).toBe("/comic/comic-one");
    expect(screen.getByText("excelente").tagName).toBe("STRONG");
    expect(screen.getByText("9/10")).toBeTruthy();
    expect(screen.getByText("· Editada")).toBeTruthy();
  });

  it("adds private management actions only when supplied", () => {
    const { rerender } = render(<ProfileReviewList items={reviews} />);

    expect(screen.queryByRole("button", { name: "Editar reseña" })).toBeNull();

    rerender(
      <ProfileReviewList
        items={reviews}
        renderOwnerActions={() => (
          <button aria-label="Editar reseña" type="button" />
        )}
      />
    );

    expect(screen.getByRole("button", { name: "Editar reseña" })).toBeTruthy();
  });
});
