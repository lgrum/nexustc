import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BlackMarketDetailClient from "./[id]/black-market-detail-client";
import BlackMarketClient from "./black-market-client";

const state = vi.hoisted(() => ({
  detailCalls: 0,
  purchase: vi.fn(),
  publish: vi.fn(),
  searchCalls: 0,
  searchInputs: [] as unknown[],
  searchPages: [] as { items: unknown[]; nextCursor: string | null }[],
}));

const listing = {
  askingPrice: "100",
  assetCount: 1,
  assetKinds: ["card" as const],
  expiresAt: new Date("2026-08-30T00:00:00.000Z"),
  id: "listing-1",
  isBundle: false,
  publishedAt: new Date("2026-08-01T00:00:00.000Z"),
  state: "active" as const,
  version: 1,
};

vi.mock("@/lib/orpc", () => ({
  orpc: {
    blackMarket: {
      detail: {
        queryOptions: () => ({
          queryFn: () => {
            state.detailCalls += 1;
            return Promise.resolve({
              ...listing,
              askingPrice: state.detailCalls > 1 ? "101" : "100",
              assets: [
                {
                  assetId: "card-1",
                  characterName: "Samus",
                  kind: "card" as const,
                  mintNumber: 1,
                  rarity: "rare",
                },
              ],
              termsImmutable: true as const,
            });
          },
          queryKey: ["black-market", "detail", "listing-1"],
        }),
      },
      eligible: {
        key: () => ["black-market", "eligible"],
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve({
              cards: [{ assetId: "card-1", kind: "card" as const }],
              packs: [],
            }),
          queryKey: ["black-market", "eligible"],
        }),
      },
      purchase: {
        mutationOptions: (options: Record<string, unknown>) => ({
          ...options,
          mutationFn: state.purchase,
        }),
      },
      publish: {
        mutationOptions: (options: Record<string, unknown>) => ({
          ...options,
          mutationFn: state.publish,
        }),
      },
      search: {
        key: () => ["black-market", "search"],
        // Mirrors the real infiniteOptions contract: the RPC input is rebuilt
        // from pageParam, so page 2 requests carry the server cursor.
        infiniteOptions: ({
          input,
          ...rest
        }: {
          input: (pageParam?: unknown) => unknown;
        }) => ({
          ...rest,
          queryFn: ({ pageParam }: { pageParam?: unknown }) => {
            state.searchCalls += 1;
            state.searchInputs.push(input(pageParam));
            return Promise.resolve(
              state.searchPages.shift() ?? {
                items: [listing],
                nextCursor: null,
              }
            );
          },
          queryKey: ["black-market", "search", input()],
        }),
      },
    },
  },
}));

function renderWithClient(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
  );
}

beforeEach(() => {
  state.detailCalls = 0;
  state.searchCalls = 0;
  state.searchInputs = [];
  state.searchPages = [];
  state.purchase.mockReset();
  state.publish.mockReset();
});

describe("Mercado Negro retry commands", () => {
  it("sends the returned cursor when loading more market listings", async () => {
    state.searchPages = [
      { items: [listing], nextCursor: "cursor-1" },
      { items: [], nextCursor: null },
    ];
    renderWithClient(<BlackMarketClient />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver más" }));
    await waitFor(() => expect(state.searchCalls).toBe(2));
    expect(state.searchInputs[1]).toMatchObject({ cursor: "cursor-1" });
  });

  it("reuses one publish key after a network error and rotates it when terms change", async () => {
    state.publish
      .mockRejectedValueOnce(new Error("Red interrumpida"))
      .mockRejectedValueOnce(new Error("Red interrumpida"))
      .mockResolvedValueOnce({ listingId: "listing-new", replayed: false });
    renderWithClient(<BlackMarketClient />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Carta coleccionable/ })
    );
    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(2));
    expect(state.publish.mock.calls[1]?.[0].idempotencyKey).toBe(
      state.publish.mock.calls[0]?.[0].idempotencyKey
    );

    fireEvent.change(screen.getByLabelText("Precio"), {
      target: { value: "101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(3));
    expect(state.publish.mock.calls[2]?.[0].idempotencyKey).not.toBe(
      state.publish.mock.calls[1]?.[0].idempotencyKey
    );
  });

  it("keeps purchase retries idempotent and refetches after a stale price", async () => {
    state.purchase
      .mockRejectedValueOnce(
        Object.assign(new Error("Precio obsoleto"), { code: "STALE_PRICE" })
      )
      .mockResolvedValueOnce({ replayed: false });
    renderWithClient(<BlackMarketClient />);

    const buy = await screen.findByRole("button", { name: "Comprar" });
    fireEvent.click(buy);
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe(
      "purchase-confirmation"
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y pagar" }));
    await waitFor(() => expect(state.purchase).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Comprar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y pagar" }));
    await waitFor(() => expect(state.purchase).toHaveBeenCalledTimes(2));
    expect(state.purchase.mock.calls[1]?.[0].idempotencyKey).not.toBe(
      state.purchase.mock.calls[0]?.[0].idempotencyKey
    );
    expect(state.searchCalls).toBeGreaterThan(1);
  });

  it("requires a fresh confirmation after a detail price refresh", async () => {
    state.purchase
      .mockRejectedValueOnce(
        Object.assign(new Error("Precio obsoleto"), { code: "STALE_PRICE" })
      )
      .mockResolvedValueOnce({ replayed: false });
    renderWithClient(<BlackMarketDetailClient listingId="listing-1" />);

    await screen.findByRole("button", { name: "Comprar lote completo" });
    fireEvent.click(
      screen.getByRole("button", { name: "Comprar lote completo" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y pagar" }));
    await waitFor(() => expect(state.purchase).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state.detailCalls).toBeGreaterThan(1));
    expect(screen.getByText(/101 Eteris/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Comprar lote completo" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y pagar" }));
    await waitFor(() => expect(state.purchase).toHaveBeenCalledTimes(2));
    expect(state.purchase.mock.calls[1]?.[0].expectedPrice).toBe("101");
    expect(state.purchase.mock.calls[1]?.[0].idempotencyKey).not.toBe(
      state.purchase.mock.calls[0]?.[0].idempotencyKey
    );
  });
});
