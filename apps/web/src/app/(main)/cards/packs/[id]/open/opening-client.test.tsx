import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OpeningClient from "./opening-client";

const state = vi.hoisted(() => ({
  open: vi.fn(),
  result: {
    cards: [
      {
        cardInstanceId: "card-1",
        mintDisplay: "#1",
        mintNumber: 1,
        revealOrder: 1,
        template: {
          characterName: "Carta Uno",
          description: "Descripción",
          disabled: false,
          edition: null,
          gameName: "Juego",
          id: "template-1",
          lifetimeSupplyCeiling: null,
          placeholder: false,
          presentation: {
            accentColor: "#7c3aed",
            frameKey: "default",
            watermarkText: "NeXusTC",
          },
          rarity: "common",
          renderedVariants: [],
          seriesName: "Serie",
        },
      },
      {
        cardInstanceId: "card-2",
        mintDisplay: "#2/100",
        mintNumber: 2,
        revealOrder: 2,
        template: {
          characterName: "Carta Dos",
          description: "Descripción",
          disabled: false,
          edition: null,
          gameName: "Juego",
          id: "template-2",
          lifetimeSupplyCeiling: 100,
          placeholder: false,
          presentation: {
            accentColor: "#7c3aed",
            frameKey: "default",
            watermarkText: "NeXusTC",
          },
          rarity: "rare",
          renderedVariants: [],
          seriesName: "Serie",
        },
      },
    ],
    openedAt: "2026-08-16T12:00:00.000Z",
    openingId: "opening-1",
    packInstanceId: "pack-1",
    replayed: false,
    revision: 1,
    revisionId: "revision-1",
    source: "grant",
    templateId: "template-1",
  },
  view: {
    assetObjectKey: "media/packs/pack-1.webp",
    cardCount: 2,
    id: "pack-1",
    openedAt: null,
    openingId: null,
    revision: 1,
    revisionId: "revision-1",
    result: null,
    source: "grant",
    state: "unopened" as const,
    templateId: "template-1",
    templateName: "Pack Inicial",
  },
}));

vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => (
    <img {...props} />
  ),
}));

vi.mock("@/lib/orpc", () => ({
  getClientErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "No pudimos abrir el Pack.",
  orpc: {
    packs: {
      open: {
        mutationOptions: () => ({ mutationFn: state.open }),
      },
      opening: {
        queryOptions: () => ({
          queryFn: () => Promise.resolve(state.view),
          queryKey: ["packs", "opening", "pack-1"],
        }),
      },
    },
  },
}));

function renderOpening() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OpeningClient packInstanceId="pack-1" />
    </QueryClientProvider>
  );
}

describe("pack opening reveal", () => {
  it("requires the authoritative open command before revealing and supports touch slicing", async () => {
    state.open.mockResolvedValueOnce(state.result);
    renderOpening();

    const packButton = await screen.findByRole("button", {
      name: "Abrir Pack Inicial",
    });
    expect(screen.queryByText("Carta Uno")).toBeNull();
    fireEvent.pointerDown(packButton, {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerUp(packButton, {
      clientX: 120,
      clientY: 120,
      pointerId: 1,
    });

    expect(
      await screen.findByRole("heading", { name: "Resultado confirmado" })
    ).toBeTruthy();
    expect(state.open.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ packInstanceId: "pack-1" })
    );
    expect(screen.queryByText("Carta Uno")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Saltar revelado" }));
    const firstCards = await screen.findAllByText("Carta Uno");
    expect(firstCards.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Carta Dos").length).toBeGreaterThan(0);
  });

  it("keeps the keyboard path on a semantic Open button", async () => {
    state.view = {
      ...state.view,
      openedAt: null,
      openingId: null,
      result: null,
      state: "unopened",
    };
    state.open.mockResolvedValueOnce(state.result);
    renderOpening();
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir Pack", exact: true })
    );
    expect(
      await screen.findByRole("heading", { name: "Resultado confirmado" })
    ).toBeTruthy();
    expect(state.open.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ packInstanceId: "pack-1" })
    );
  });

  it("recovers an opened result on refresh and exposes keyboard and sound controls", async () => {
    state.view = {
      ...state.view,
      openedAt: "2026-08-16T12:00:00.000Z",
      openingId: "opening-1",
      result: state.result.cards,
      state: "opened",
    };
    renderOpening();

    expect(
      await screen.findByRole("heading", { name: "Resultado confirmado" })
    ).toBeTruthy();
    const soundButton = screen.getByRole("button", { name: /Sonido:/ });
    expect(soundButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(soundButton);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Sonido:/ })
          .getAttribute("aria-pressed")
      ).toBe("true")
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Resultado confirmado" })
      )
    );
  });

  it("uses a complete static result when reduced motion is preferred", async () => {
    state.view = {
      ...state.view,
      openedAt: "2026-08-16T12:00:00.000Z",
      openingId: "opening-1",
      result: state.result.cards,
      state: "opened",
    };
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    });
    try {
      renderOpening();
      expect(
        await screen.findByText("Todas las cartas están visibles.")
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Saltar revelado" })
      ).toBeNull();
      expect(screen.getAllByText("Carta Uno").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Carta Dos").length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: previousMatchMedia,
      });
    }
  });
});
