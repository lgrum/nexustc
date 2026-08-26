import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CardShopClient } from "./shop-client";

const state = vi.hoisted(() => ({
  purchase: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    cardShop: {
      list: {
        queryOptions: () => ({
          queryFn: () => Promise.resolve([]),
          queryKey: ["card-shop", "list"],
        }),
      },
      purchase: {
        mutationOptions: () => ({ mutationFn: state.purchase }),
      },
    },
  },
}));

const offer = {
  binding: "transferable" as const,
  cardCount: 2,
  description: "Un Pack de prueba",
  endsAt: null,
  guarantees: [],
  id: "offer-1",
  latestRevision: {
    bindingPolicy: "either" as const,
    cardCount: 2,
    duplicatePolicy: "allow" as const,
    guarantees: [],
    possiblePool: [
      {
        characterName: "Carta pública",
        disabled: false,
        gameName: "Juego",
        id: "card-1",
        rarity: "common" as const,
        seriesName: "Serie",
      },
    ],
    publishedAt: null,
    revision: 3,
    unavailableCards: [],
  },
  name: "Pack de prueba",
  perAccountLimit: 10,
  possiblePool: [
    {
      characterName: "Carta pública",
      disabled: false,
      gameName: "Juego",
      id: "card-1",
      rarity: "common" as const,
      seriesName: "Serie",
    },
  ],
  price: "75",
  remainingSales: 5,
  startsAt: null,
  unavailableCards: [],
  version: 2,
};

function renderShop(initialOffers = [offer]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardShopClient initialOffers={initialOffers} />
    </QueryClientProvider>
  );
}

describe("Official Shop UI", () => {
  it("shows Spanish empty state", async () => {
    renderShop([]);
    expect(
      await screen.findByText(
        "No hay ofertas disponibles en este momento. Vuelve pronto."
      )
    ).toBeTruthy();
  });

  it("requires confirmation and displays a receipt after a bounded purchase", async () => {
    state.purchase.mockResolvedValueOnce({
      offerId: offer.id,
      packInstanceIds: ["pack-1", "pack-2"],
      purchaseId: "purchase-1",
      quantity: 2,
      totalPrice: "150",
      transactionId: "transaction-1",
      unitPrice: "75",
    });
    renderShop();
    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("Carta pública")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Comprar Packs" }));
    expect(screen.getByText("Confirma tu compra")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cantidad (1–10)"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar compra" }));
    expect(await screen.findByText("Compra confirmada")).toBeTruthy();
    expect(state.purchase).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOfferVersion: 2,
        expectedUnitPrice: "75",
        offerId: "offer-1",
        quantity: 2,
      }),
      expect.anything()
    );
  });
});
