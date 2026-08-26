import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InventoryClient from "./inventory-client";

const state = vi.hoisted(() => ({
  cards: { items: [], nextCursor: null },
  packs: { items: [], nextCursor: null },
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    cards: {
      inventory: {
        // Mirrors the real infiniteOptions contract: input is a pageParam
        // function and the remaining TanStack options pass through untouched.
        infiniteOptions: ({
          input,
          ...rest
        }: {
          input: (pageParam?: unknown) => unknown;
        }) => ({
          ...rest,
          queryFn: () => Promise.resolve(state.cards),
          queryKey: ["cards", "inventory", input()],
        }),
      },
    },
    packs: {
      inventory: {
        infiniteOptions: ({
          input,
          ...rest
        }: {
          input: (pageParam?: unknown) => unknown;
        }) => ({
          ...rest,
          queryFn: () => Promise.resolve(state.packs),
          queryKey: ["packs", "inventory", input()],
        }),
      },
    },
  },
}));

function renderInventory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryClient />
    </QueryClientProvider>
  );
}

describe("private inventory UI", () => {
  it("shows Spanish empty states for cards and unopened Packs", async () => {
    renderInventory();
    expect(await screen.findByText("Todavía no tienes cartas.")).toBeTruthy();
    expect(
      await screen.findByText("Todavía no tienes packs sin abrir.")
    ).toBeTruthy();
  });
});
