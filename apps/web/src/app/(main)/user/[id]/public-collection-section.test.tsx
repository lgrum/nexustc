import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";

import { PublicCollectionSection } from "./public-collection-section";

const mocks = vi.hoisted(() => ({
  cards: vi.fn(),
  packs: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpcClient: {
    cards: { publicCollection: mocks.cards },
    packs: { publicCollection: mocks.packs },
  },
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

const cardPage = {
  items: [
    {
      availability: "active" as const,
      binding: "transferable" as const,
      characterName: "Samus Aran",
      edition: "Primera",
      forSale: false,
      gameName: "Metroid Prime",
      id: "card-instance-1",
      limited: true,
      lifetimeSupplyCeiling: 100,
      mintDisplay: "#7/100",
      mintNumber: 7,
      rarity: "rare" as const,
      seriesName: "Clásicos",
      template: {
        characterName: "Samus Aran",
        description: "Cazadora espacial",
        disabled: false,
        edition: "Primera",
        gameName: "Metroid Prime",
        id: "card-template-1",
        lifetimeSupplyCeiling: 100,
        presentation: {
          accentColor: "#7c3aed",
          frameKey: "default" as const,
          watermarkText: "NeXusTC",
        },
        rarity: "rare" as const,
        renderedVariants: [],
        seriesName: "Clásicos",
      },
      templateId: "card-template-1",
    },
  ],
  nextCursor: null,
  visible: true,
};

const packPage = {
  items: [
    {
      availability: "active" as const,
      binding: "account-bound" as const,
      forSale: false,
      issuedAt: new Date("2026-08-16T12:00:00.000Z"),
      revision: 2,
      templateAssetObjectKey: "packs/rendered/pack-1.webp",
      templateId: "pack-template-1",
      templateName: "Pack Inicial",
    },
  ],
  nextCursor: null,
  visible: true,
};

function renderSection(
  initialCards: typeof cardPage | null,
  initialPacks: typeof packPage | null
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PublicCollectionSection
        initialCards={initialCards}
        initialPacks={initialPacks}
        userId="user-1"
      />
    </QueryClientProvider>
  );
}

describe(PublicCollectionSection, () => {
  beforeEach(() => {
    mocks.cards.mockReset();
    mocks.packs.mockReset();
  });

  it("renders the visitor private response without querying ownership content", () => {
    renderSection(
      { items: [], nextCursor: null, visible: false },
      { items: [], nextCursor: null, visible: false }
    );

    expect(screen.getByText("Colección privada")).toBeTruthy();
    expect(screen.getByText(/decidió mantener su colección/)).toBeTruthy();
    expect(mocks.cards).not.toHaveBeenCalled();
    expect(mocks.packs).not.toHaveBeenCalled();
  });

  it("renders public cards and unopened packs with Spanish filters", () => {
    renderSection(cardPage, packPage);

    expect(screen.getByText("Colección pública")).toBeTruthy();
    expect(screen.getByText("Samus Aran")).toBeTruthy();
    expect(screen.getByText(/#7\/100/)).toBeTruthy();
    expect(screen.queryByText("owner-1")).toBeNull();
    expect(screen.queryByText("card-instance-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Packs sin abrir" }));
    expect(screen.getByText("Pack Inicial")).toBeTruthy();
    expect(screen.getByText("Packs sin abrir")).toBeTruthy();
    expect(
      screen.getByLabelText("Buscar en la colección pública")
    ).toBeTruthy();
  });
});
