import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TradesClient from "./trades-client";

const state = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    trades: {
      eligible: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve([
              { assetId: "card-proposer", kind: "card" },
              { assetId: "card-proposer-2", kind: "card" },
            ]),
          queryKey: ["trades", "eligible"],
        }),
      },
      inbox: {
        queryOptions: () => ({
          queryFn: () => Promise.resolve({ items: [] }),
          queryKey: ["trades", "inbox"],
        }),
      },
      send: {
        mutationOptions: (options: Record<string, unknown>) => ({
          ...options,
          mutationFn: state.send,
        }),
      },
      sent: {
        queryOptions: () => ({
          queryFn: () => Promise.resolve({ items: [] }),
          queryKey: ["trades", "sent"],
        }),
      },
    },
  },
}));

function renderTrades() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TradesClient />
    </QueryClientProvider>
  );
}

describe("trades bundle UI", () => {
  it("composes 50-per-side bundles and preserves the idempotency key on retry", async () => {
    state.send
      .mockRejectedValueOnce(new Error("La cuenta no acepta ofertas."))
      .mockResolvedValueOnce({
        expiresAt: new Date("2026-08-23T12:00:00.000Z"),
        offerId: "offer-1",
        replayed: false,
        state: "sent",
        termsHash: "hash",
        version: 1,
      });
    renderTrades();
    await waitFor(() =>
      expect(screen.getAllByText("1/50 activos seleccionados")).toHaveLength(2)
    );

    fireEvent.change(screen.getByLabelText("ID de la cuenta destinataria"), {
      target: { value: "recipient" },
    });
    const addButtons = screen.getAllByRole("button", { name: "Añadir activo" });
    fireEvent.click(addButtons[0]!);
    fireEvent.click(addButtons[1]!);
    const assetFields = screen.getAllByLabelText("ID del activo");
    fireEvent.change(assetFields[0]!, { target: { value: "card-proposer" } });
    fireEvent.change(assetFields[1]!, { target: { value: "card-proposer-2" } });
    fireEvent.change(assetFields[2]!, { target: { value: "card-recipient" } });
    fireEvent.change(assetFields[3]!, { target: { value: "pack-recipient" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar oferta inmutable" })
    );
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar oferta inmutable" })
    );
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(2));

    const first = state.send.mock.calls[0]?.[0];
    const second = state.send.mock.calls[1]?.[0];
    expect(first).toMatchObject({
      proposerAssets: [
        { assetId: "card-proposer", kind: "card" },
        { assetId: "card-proposer-2", kind: "card" },
      ],
      recipientAssets: [
        { assetId: "card-recipient", kind: "card" },
        { assetId: "pack-recipient", kind: "card" },
      ],
    });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(
      await screen.findByText(
        "Oferta enviada. Todos tus activos quedaron en custodia privada."
      )
    ).toBeTruthy();
  });
});
