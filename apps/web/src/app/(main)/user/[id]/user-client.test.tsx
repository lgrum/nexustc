import type { EffectiveProfileShowcase } from "@repo/shared/profile-customization";
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

function renderClient(
  visibility: { favorites: boolean; reviews: boolean },
  showcases?: EffectiveProfileShowcase[],
  preview = false
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserClient
        preview={preview}
        userId="user-1"
        userName="Nexus User"
        visibility={visibility}
        showcases={showcases}
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
    vi.mocked(orpcClient.user.getUserBookmarks).mockResolvedValue({
      items: [
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
      ],
      nextCursor: null,
    });
    vi.mocked(orpcClient.rating.getByUserId).mockResolvedValue({
      nextCursor: null,
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
      userId: "user-1",
    });
    expect(orpcClient.rating.getByUserId).toHaveBeenCalledWith({
      limit: 10,
      userId: "user-1",
    });
  });

  it("renders only ordered effective showcases from the new manifest", async () => {
    vi.mocked(orpcClient.rating.getByUserId).mockResolvedValue({
      nextCursor: null,
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

    renderClient({ favorites: true, reviews: true }, [
      {
        order: 0,
        rendererKey: "reviews",
        type: "reviews",
        variant: "standard",
      },
    ]);

    expect(await screen.findByText("Reseñas cargadas: 1")).toBeTruthy();
    expect(orpcClient.user.getUserBookmarks).not.toHaveBeenCalled();
    expect(screen.queryByText("Favoritos privados")).toBeNull();
  });

  it("uses self-preview loaders for unsaved collection visibility", async () => {
    vi.mocked(orpcClient.user.getUserBookmarks).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.mocked(orpcClient.rating.getByUserId).mockResolvedValue({
      nextCursor: null,
      posts: [],
      ratings: [],
    });

    renderClient(
      { favorites: false, reviews: false },
      [
        {
          order: 0,
          rendererKey: "library",
          type: "library",
          variant: "standard",
        },
        {
          order: 1,
          rendererKey: "reviews",
          type: "reviews",
          variant: "standard",
        },
      ],
      true
    );

    await waitFor(() => {
      expect(orpcClient.user.getUserBookmarks).toHaveBeenCalledWith({
        limit: 12,
        preview: true,
        userId: "user-1",
      });
      expect(orpcClient.rating.getByUserId).toHaveBeenCalledWith({
        limit: 10,
        preview: true,
        userId: "user-1",
      });
    });
  });

  it("bounds compact previews and omits load-more controls", async () => {
    vi.mocked(orpcClient.user.getUserBookmarks).mockResolvedValue({
      items: [
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
      ],
      nextCursor: { id: "post-1", publishedAt: new Date() },
    });

    renderClient({ favorites: true, reviews: true }, [
      { order: 0, rendererKey: "library", type: "library", variant: "compact" },
    ]);

    expect(await screen.findByText("Favoritos cargados: 1")).toBeTruthy();
    expect(orpcClient.user.getUserBookmarks).toHaveBeenCalledWith({
      limit: 6,
      userId: "user-1",
    });
    expect(screen.queryByRole("button", { name: /cargar más/i })).toBeNull();
  });

  it("renders one favorite game as the featured choice", () => {
    renderClient({ favorites: true, reviews: true }, [
      {
        games: [
          {
            coverImageObjectKey: null,
            id: "game-1",
            slug: "juego-uno",
            title: "Juego Uno",
          },
        ],
        order: 0,
        rendererKey: "favorite-games",
        type: "favorite-games",
        variant: "compact",
      },
    ]);

    expect(screen.getByText("Elección principal")).toBeTruthy();
    const featuredGame = screen.getByRole("link", { name: /Juego Uno/ });
    expect(featuredGame.getAttribute("href")).toBe("/post/juego-uno");
    expect(featuredGame.className).toContain(
      "@2xl/favorite-games:grid-cols-[minmax(13rem,0.7fr)_1fr]"
    );
  });

  it("renders larger favorite selections in saved rank order", () => {
    renderClient({ favorites: true, reviews: true }, [
      {
        games: [
          { coverImageObjectKey: null, id: "b", slug: "b", title: "Segundo" },
          { coverImageObjectKey: null, id: "a", slug: "a", title: "Primero" },
        ],
        order: 0,
        rendererKey: "favorite-games",
        type: "favorite-games",
        variant: "featured",
      },
    ]);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Segundo"),
      expect.stringContaining("Primero"),
    ]);
    expect(links[0]?.closest("ol")?.className).toContain(
      "@2xl/favorite-games:grid-cols-2"
    );
  });

  it("renders privacy-safe XP, Streak, and Eteris fields", () => {
    renderClient({ favorites: true, reviews: true }, [
      {
        accountLevel: 8,
        currentLevelXp: 14,
        nextLevelRequirement: 80,
        order: 0,
        progress: 0.175,
        rendererKey: "xp",
        type: "xp",
        variant: "standard",
        xpRemaining: 66,
      },
      {
        currentStreak: 12,
        nextMilestone: 30,
        order: 1,
        rendererKey: "streak",
        type: "streak",
        variant: "compact",
      },
      {
        balance: "420",
        order: 2,
        rendererKey: "eteris",
        type: "eteris",
        variant: "standard",
      },
    ]);

    expect(screen.getByText("14 / 80 XP")).toBeTruthy();
    expect(screen.getByText("12 días")).toBeTruthy();
    expect(screen.getByText("Próximo hito: 30 días")).toBeTruthy();
    expect(screen.getByText("420")).toBeTruthy();
    expect(screen.queryByText(/historial|deuda|mejor racha/i)).toBeNull();
  });

  it("keeps both standard experience panels the same height", () => {
    const { container } = renderClient({ favorites: true, reviews: true }, [
      {
        accountLevel: 8,
        currentLevelXp: 14,
        nextLevelRequirement: 80,
        order: 0,
        progress: 0.175,
        rendererKey: "xp",
        type: "xp",
        variant: "standard",
        xpRemaining: 66,
      },
    ]);

    const panels = container.querySelectorAll(
      "[data-profile-experience-panels] > *"
    );
    expect(panels).toHaveLength(2);
    expect(
      [...panels].every((panel) => panel.className.includes("h-full"))
    ).toBe(true);
  });

  it("does not stretch standalone scalar cards beyond their showcase", () => {
    const { container } = renderClient({ favorites: true, reviews: true }, [
      {
        balance: "420",
        order: 0,
        rendererKey: "eteris",
        type: "eteris",
        variant: "standard",
      },
    ]);

    const card = container.querySelector("[data-profile-scalar-card]");
    expect(card).not.toBeNull();
    expect(card?.className).not.toContain("h-full");
  });

  it("renders collectible showcase states and complete sale links", () => {
    renderClient({ favorites: true, reviews: true }, [
      {
        cards: [
          {
            availability: "active",
            binding: "transferable",
            characterName: "Samus Aran",
            edition: "Primera",
            forSale: true,
            gameName: "Metroid Prime",
            id: "card-1",
            limited: true,
            lifetimeSupplyCeiling: 100,
            listingIsBundle: true,
            listingUrl: "/black-market/listing-1",
            mintDisplay: "#7/100",
            mintNumber: 7,
            rarity: "rare",
            seriesName: "Clásicos",
            template: {
              characterName: "Samus Aran",
              description: "Cazadora espacial",
              disabled: false,
              edition: "Primera",
              gameName: "Metroid Prime",
              id: "template-1",
              lifetimeSupplyCeiling: 100,
              placeholder: false,
              presentation: {
                accentColor: "#7c3aed",
                frameKey: "default",
                watermarkText: "NeXusTC",
              },
              rarity: "rare",
              renderedVariants: [],
              seriesName: "Clásicos",
            },
            templateId: "template-1",
          },
        ],
        order: 0,
        rendererKey: "card",
        type: "card",
        variant: "standard",
      },
      {
        order: 1,
        packs: [
          {
            availability: "active",
            binding: "account-bound",
            forSale: false,
            issuedAt: new Date("2026-08-16T12:00:00.000Z"),
            revision: 2,
            templateAssetObjectKey: "packs/rendered/pack-1.webp",
            templateId: "pack-template-1",
            templateName: "Pack Inicial",
          },
        ],
        rendererKey: "unopened-pack",
        type: "unopened-pack",
        variant: "compact",
      },
    ]);

    expect(screen.getByText("Samus Aran")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "En venta · Lote" }).getAttribute("href")
    ).toBe("/black-market/listing-1");
    expect(screen.getByText("Pack Inicial")).toBeTruthy();
    expect(screen.queryByText(/rareza del pack/i)).toBeNull();
  });
});
