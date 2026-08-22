import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TradeDetailClient from "./trade-detail-client";

const state = vi.hoisted(() => ({
  accept: vi.fn(),
}));

function mutationOptions(
  mutationFn: (...args: never[]) => unknown,
  options: Record<string, unknown>
) {
  return { ...options, mutationFn };
}

vi.mock("@/lib/orpc", () => ({
  orpc: {
    trades: {
      accept: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(state.accept, options),
      },
      block: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
      cancel: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
      counteroffer: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
      detail: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve({
              assets: [
                { assetId: "card-1", kind: "card", side: "proposer" },
                { assetId: "pack-1", kind: "pack", side: "recipient" },
              ],
              expiresAt: new Date("2026-08-23T12:00:00.000Z"),
              history: [],
              offerId: "offer-1",
              proposerUserId: "proposer",
              recipientUserId: "recipient",
              sentAt: new Date("2026-08-16T12:00:00.000Z"),
              state: "sent",
              termsHash: "hash",
              version: 1,
            }),
          queryKey: ["trades", "detail", "offer-1"],
        }),
      },
      eligible: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve([
              { assetId: "card-counter", characterName: "Samus", kind: "card" },
            ]),
          queryKey: ["trades", "eligible"],
        }),
      },
      eligibleForParticipant: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve([
              { assetId: "pack-counter", kind: "pack", templateName: "Pack" },
            ]),
          queryKey: ["trades", "eligible-for-participant"],
        }),
      },
      reject: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
    },
  },
}));

describe("trade detail retry behavior", () => {
  it("reuses the same accept idempotency key after a retry", async () => {
    state.accept
      .mockRejectedValueOnce(new Error("Reintenta"))
      .mockResolvedValueOnce({
        expiresAt: new Date("2026-08-23T12:00:00.000Z"),
        offerId: "offer-1",
        replayed: false,
        state: "accepted",
        termsHash: "hash",
        version: 2,
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TradeDetailClient offerId="offer-1" />
      </QueryClientProvider>
    );
    const acceptButton = await screen.findByRole("button", {
      name: "Aceptar intercambio",
    });
    fireEvent.click(acceptButton);
    await waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1));
    fireEvent.click(acceptButton);
    await waitFor(() => expect(state.accept).toHaveBeenCalledTimes(2));

    expect(state.accept.mock.calls[1]?.[0].idempotencyKey).toBe(
      state.accept.mock.calls[0]?.[0].idempotencyKey
    );
  });
});
