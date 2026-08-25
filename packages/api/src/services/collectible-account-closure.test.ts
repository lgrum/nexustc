import { describe, expect, it, vi } from "vitest";

import { reconcileCollectiblesForAccountClosureInTransaction } from "./collectible-account-closure";
import type { CollectibleAccountClosureDependencies } from "./collectible-account-closure";

type FakeTransaction = Parameters<
  typeof reconcileCollectiblesForAccountClosureInTransaction
>[0];

function createDependencies(log: string[]) {
  return {
    closeGift: vi.fn((_tx, offer, input) => {
      log.push(`gift:${offer.id}:${input.idempotencyKey}`);
      return Promise.resolve({ replayed: false });
    }),
    closeListing: vi.fn((_tx, listing, input) => {
      log.push(`listing:${listing.id}:${input.idempotencyKey}`);
      return Promise.resolve({ replayed: false });
    }),
    closeTrade: vi.fn((_tx, offer, input) => {
      log.push(`trade:${offer.id}:${input.idempotencyKey}`);
      return Promise.resolve({ replayed: false });
    }),
    listActiveListings: vi.fn(() => Promise.resolve([{ id: "listing-1" }])),
    listSentGifts: vi.fn(() => Promise.resolve([{ id: "gift-1" }])),
    listSentTrades: vi.fn(() =>
      Promise.resolve([{ id: "trade-1" }, { id: "trade-2" }])
    ),
    pseudonymize: vi.fn((_tx, input) => {
      log.push(`pseudonymize:${input.walletId}`);
      return Promise.resolve();
    }),
    suppressPublicProfile: vi.fn(() => {
      log.push("suppress");
      return Promise.resolve();
    }),
  } satisfies CollectibleAccountClosureDependencies;
}

describe("collectible account closure", () => {
  it("suppresses public output, closes ordinary custody seams, then pseudonymizes durable history", async () => {
    const log: string[] = [];
    const dependencies = createDependencies(log);
    const tx = {} as FakeTransaction;
    const input = {
      now: new Date("2026-08-17T04:00:00.000Z"),
      userId: "user-1",
      walletId: "wallet-opaque-1",
    };

    const result = await reconcileCollectiblesForAccountClosureInTransaction(
      tx,
      input,
      dependencies
    );

    expect(result).toEqual({
      closedGiftIds: ["gift-1"],
      closedListingIds: ["listing-1"],
      closedTradeIds: ["trade-1", "trade-2"],
    });
    expect(log).toEqual([
      "suppress",
      "trade:trade-1:account-closure:trade:trade-1",
      "trade:trade-2:account-closure:trade:trade-2",
      "gift:gift-1:account-closure:gift:gift-1",
      "listing:listing-1:account-closure:listing:listing-1",
      "pseudonymize:wallet-opaque-1",
    ]);
    expect(dependencies.closeListing).toHaveBeenCalledWith(
      tx,
      { id: "listing-1" },
      expect.objectContaining({
        actorUserId: "user-1",
        reverseFee: false,
      })
    );
  });

  it("uses stable keys on retries and never pseudonymizes after a failed terminal transition", async () => {
    const firstLog: string[] = [];
    const first = createDependencies(firstLog);
    const tx = {} as FakeTransaction;
    const input = {
      now: new Date("2026-08-17T04:00:00.000Z"),
      userId: "user-1",
      walletId: "wallet-opaque-1",
    };

    await reconcileCollectiblesForAccountClosureInTransaction(tx, input, first);
    const secondLog: string[] = [];
    const second = createDependencies(secondLog);
    await reconcileCollectiblesForAccountClosureInTransaction(
      tx,
      input,
      second
    );
    expect(secondLog).toEqual(firstLog);

    const failingLog: string[] = [];
    const failing = createDependencies(failingLog);
    failing.closeGift.mockRejectedValueOnce(new Error("custody changed"));
    await expect(
      reconcileCollectiblesForAccountClosureInTransaction(tx, input, failing)
    ).rejects.toThrow("custody changed");
    expect(failing.pseudonymize).not.toHaveBeenCalled();
  });
});
