import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GiftsClient from "./gifts-client";

const state = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    gifts: {
      eligible: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve([
              { assetId: "card-sender", kind: "card" },
              { assetId: "pack-sender", kind: "pack" },
            ]),
          queryKey: ["gifts", "eligible"],
        }),
      },
      inbox: {
        queryOptions: () => ({
          queryFn: () => Promise.resolve({ items: [] }),
          queryKey: ["gifts", "inbox"],
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
          queryKey: ["gifts", "sent"],
        }),
      },
    },
  },
}));

function renderGifts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GiftsClient />
    </QueryClientProvider>
  );
}

describe("gift composition UI", () => {
  it("composes mixed exact assets and preserves the idempotency key on retry", async () => {
    state.send
      .mockRejectedValueOnce(new Error("La cuenta no acepta regalos."))
      .mockResolvedValueOnce({
        expiresAt: new Date("2026-08-23T12:00:00.000Z"),
        giftId: "gift-1",
        replayed: false,
        state: "sent",
        termsHash: "hash",
        version: 1,
      });
    renderGifts();
    await waitFor(() =>
      expect(screen.getByText("1/50 activos seleccionados")).toBeTruthy()
    );

    fireEvent.change(screen.getByLabelText("ID de la cuenta destinataria"), {
      target: { value: "recipient" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir activo" }));
    const assetFields = screen.getAllByLabelText("ID del activo");
    fireEvent.change(assetFields[0]!, { target: { value: "card-sender" } });
    fireEvent.change(assetFields[1]!, { target: { value: "pack-sender" } });
    const kindFields = screen.getAllByLabelText("Tipo");
    fireEvent.change(kindFields[1]!, { target: { value: "pack" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar regalo gratuito" })
    );
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar regalo gratuito" })
    );
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(2));

    const first = state.send.mock.calls[0]?.[0];
    const second = state.send.mock.calls[1]?.[0];
    expect(first).toMatchObject({
      assets: [
        { assetId: "card-sender", kind: "card" },
        { assetId: "pack-sender", kind: "pack" },
      ],
      recipientUserId: "recipient",
    });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(
      await screen.findByText(
        "Regalo enviado. Es gratuito y tus activos quedaron en custodia privada."
      )
    ).toBeTruthy();
  });
});
