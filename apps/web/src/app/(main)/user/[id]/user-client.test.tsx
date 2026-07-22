import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";

import { orpcClient } from "@/lib/orpc";

import { UserClient } from "./user-client";

vi.mock("@/lib/orpc", () => ({
  orpcClient: {
    rating: {
      getByUserId: vi.fn(),
    },
    user: {
      getUserBookmarks: vi.fn(),
    },
  },
}));

vi.mock("@/components/profile/profile-bookmark-grid", () => ({
  ProfileBookmarkGrid: ({ items }: { items: unknown[] }) => (
    <div>Favoritos cargados: {items.length}</div>
  ),
}));

vi.mock("@/components/profile/profile-review-list", () => ({
  ProfileReviewList: ({ items }: { items: unknown[] }) => (
    <div>Reseñas cargadas: {items.length}</div>
  ),
}));

function renderClient(visibility: { favorites: boolean; reviews: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserClient
        userId="user-1"
        userName="Nexus User"
        visibility={visibility}
      />
    </QueryClientProvider>
  );
}

describe(UserClient, () => {
  beforeEach(() => {
    vi.mocked(orpcClient.user.getUserBookmarks).mockReset();
    vi.mocked(orpcClient.rating.getByUserId).mockReset();
  });

  it("shows private states without requesting hidden collections", async () => {
    renderClient({ favorites: false, reviews: false });

    expect(screen.getByText("Favoritos privados")).toBeTruthy();
    expect(screen.getByText("Reseñas privadas")).toBeTruthy();

    await waitFor(() => {
      expect(orpcClient.user.getUserBookmarks).not.toHaveBeenCalled();
      expect(orpcClient.rating.getByUserId).not.toHaveBeenCalled();
    });
  });

  it("loads both public activity collections independently", async () => {
    vi.mocked(orpcClient.user.getUserBookmarks).mockResolvedValue([
      {
        averageRating: 0,
        favorites: 1,
        id: "post-1",
        imageObjectKeys: [],
        likes: 1,
        slug: "post-one",
        terms: [],
        title: "Post one",
        type: "post",
        version: null,
        views: 1,
      },
    ]);
    vi.mocked(orpcClient.rating.getByUserId).mockResolvedValue({
      posts: [
        { id: "post-1", slug: "post-one", title: "Post one", type: "post" },
      ],
      ratings: [
        {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          postId: "post-1",
          rating: 8,
          review: "Una reseña suficientemente detallada para la prueba.",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    renderClient({ favorites: true, reviews: true });

    expect(await screen.findByText("Favoritos cargados: 1")).toBeTruthy();
    expect(await screen.findByText("Reseñas cargadas: 1")).toBeTruthy();
    expect(orpcClient.user.getUserBookmarks).toHaveBeenCalledWith({
      limit: 12,
      offset: 0,
      userId: "user-1",
    });
    expect(orpcClient.rating.getByUserId).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      userId: "user-1",
    });
  });
});
