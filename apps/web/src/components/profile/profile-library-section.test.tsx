import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";

import { ProfileLibrarySection } from "./profile-library-section";

const mocks = vi.hoisted(() => ({
  getBookmarksFull: vi.fn(),
  getMyReviews: vi.fn(),
  toggleBookmark: vi.fn(),
  updateVisibility: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    profile: {
      getMySettings: {
        queryOptions: () => ({ queryKey: ["profile", "settings"] }),
      },
    },
    user: {
      getBookmarks: {
        queryOptions: () => ({ queryKey: ["bookmarks"] }),
      },
      getBookmarksFull: {
        queryOptions: () => ({
          queryFn: mocks.getBookmarksFull,
          queryKey: ["bookmarks", "full"],
        }),
      },
    },
  },
  orpcClient: {
    profile: {
      updateVisibility: mocks.updateVisibility,
    },
    rating: {
      delete: vi.fn(),
      getMyReviews: mocks.getMyReviews,
    },
    user: {
      toggleBookmark: mocks.toggleBookmark,
    },
  },
}));

vi.mock("@/components/landing/post-card", () => ({
  PostCard: ({ post }: { post: { title: string } }) => <div>{post.title}</div>,
}));

vi.mock("@/components/ratings/rating-dialog", () => ({
  RatingDialog: () => null,
}));

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <ProfileLibrarySection
          visibility={{ favorites: true, reviews: true }}
        />
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
}

describe(ProfileLibrarySection, () => {
  beforeEach(() => {
    mocks.getBookmarksFull.mockReset();
    mocks.getMyReviews.mockReset();
    mocks.toggleBookmark.mockReset();
    mocks.updateVisibility.mockReset();
    mocks.getBookmarksFull.mockResolvedValue([]);
    mocks.getMyReviews.mockResolvedValue({ posts: [], ratings: [] });
    mocks.updateVisibility.mockResolvedValue({
      visibility: { favorites: false, reserved: {}, reviews: true },
    });
  });

  it("updates public activity visibility from accessible switches", async () => {
    renderLibrary();

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Mostrar mis favoritos públicamente",
      })
    );

    await waitFor(() => {
      expect(mocks.updateVisibility).toHaveBeenCalledWith({ favorites: false });
    });
  });

  it("removes a favorite through the owner action", async () => {
    mocks.getBookmarksFull.mockResolvedValue([
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
    mocks.toggleBookmark.mockResolvedValue({ bookmarked: false });

    renderLibrary();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Quitar Post one de favoritos",
      })
    );

    await waitFor(() => {
      expect(mocks.toggleBookmark).toHaveBeenCalledWith({
        bookmarked: false,
        postId: "post-1",
      });
    });
  });
});
