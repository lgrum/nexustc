import { fireEvent, render, screen } from "@testing-library/react";

import type { PostProps } from "@/components/landing/post-card";

import { ProfileBookmarkGrid } from "./profile-bookmark-grid";

vi.mock("@/components/landing/post-card", () => ({
  PostCard: ({ post }: { post: PostProps }) => <div>{post.title}</div>,
}));

const items: PostProps[] = [
  {
    averageRating: 0,
    favorites: 1,
    id: "game-1",
    imageObjectKeys: [],
    likes: 2,
    slug: "game-one",
    terms: [],
    title: "Juego uno",
    type: "post",
    version: "1.0",
    views: 3,
  },
  {
    averageRating: 0,
    favorites: 1,
    id: "comic-1",
    imageObjectKeys: [],
    likes: 2,
    slug: "comic-one",
    terms: [],
    title: "Comic uno",
    type: "comic",
    version: null,
    views: 3,
  },
];

describe(ProfileBookmarkGrid, () => {
  it("filters the shared collection by content type", () => {
    render(<ProfileBookmarkGrid items={items} />);

    expect(screen.getByText("Juego uno")).toBeTruthy();
    expect(screen.queryByText("Comic uno")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Comics" }));

    expect(screen.queryByText("Juego uno")).toBeNull();
    expect(screen.getByText("Comic uno")).toBeTruthy();
  });

  it("renders owner actions only when supplied", () => {
    const { rerender } = render(<ProfileBookmarkGrid items={items} />);

    expect(screen.queryByRole("button", { name: /quitar/i })).toBeNull();

    rerender(
      <ProfileBookmarkGrid
        items={items}
        renderOwnerAction={(item) => (
          <button aria-label={`Quitar ${item.title}`} type="button" />
        )}
      />
    );

    expect(
      screen.getByRole("button", { name: "Quitar Juego uno" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Quitar Comic uno" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Comics" }));

    expect(
      screen.getByRole("button", { name: "Quitar Comic uno" })
    ).toBeTruthy();
  });

  it("shows contextual empty copy for an empty content type", () => {
    render(<ProfileBookmarkGrid items={[items[0]!]} />);

    fireEvent.click(screen.getByRole("tab", { name: "Comics" }));

    expect(
      screen.getByText("No hay comics favoritos en esta colección.")
    ).toBeTruthy();
  });
});
