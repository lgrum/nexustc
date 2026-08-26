import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GiftDetailClient from "./gift-detail-client";

const state = vi.hoisted(() => ({ accept: vi.fn() }));

function mutationOptions(
  mutationFn: (...args: never[]) => unknown,
  options: Record<string, unknown>
) {
  return { ...options, mutationFn };
}

vi.mock("@/lib/orpc", () => ({
  orpc: {
    gifts: {
      key: () => ["gifts"],
      accept: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(state.accept, options),
      },
      cancel: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
      detail: {
        queryOptions: () => ({
          queryFn: () =>
            Promise.resolve({
              assets: [{ assetId: "card-1", kind: "card", side: "sender" }],
              expiresAt: new Date("2026-08-23T12:00:00.000Z"),
              giftId: "gift-1",
              history: [],
              recipientUserId: "recipient",
              senderUserId: "sender",
              sentAt: new Date("2026-08-16T12:00:00.000Z"),
              state: "sent",
              termsHash: "hash",
              version: 1,
            }),
          queryKey: ["gifts", "detail", "gift-1"],
        }),
      },
      reject: {
        mutationOptions: (options: Record<string, unknown>) =>
          mutationOptions(vi.fn(), options),
      },
    },
  },
}));

describe("gift detail confirmation and retry", () => {
  it("requires explicit irreversible confirmation and preserves the action key", async () => {
    state.accept
      .mockRejectedValueOnce(new Error("Reintenta"))
      .mockResolvedValueOnce({
        expiresAt: new Date("2026-08-23T12:00:00.000Z"),
        giftId: "gift-1",
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
        <GiftDetailClient giftId="gift-1" />
      </QueryClientProvider>
    );
    const acceptButton = await screen.findByRole("button", {
      name: "Aceptar regalo irreversible",
    });
    expect(acceptButton).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /irreversible/i }));
    fireEvent.click(acceptButton);
    await waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1));
    fireEvent.click(acceptButton);
    await waitFor(() => expect(state.accept).toHaveBeenCalledTimes(2));
    expect(state.accept.mock.calls[1]?.[0].idempotencyKey).toBe(
      state.accept.mock.calls[0]?.[0].idempotencyKey
    );
  });
});
