import { describe, expect, it } from "vitest";

import {
  assertCollectiblesAccess,
  assertCollectiblesMutationAllowed,
  createCollectibleApplicationService,
  getCollectibleGatePolicy,
  orderCollectibleLocks,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import type { CollectibleTransaction } from "./collectibles";
import { createCollectibleTransactionHarness } from "./collectibles-test-harness";

const flags = vi.hoisted(() => ({ enabled: false }));
vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.enabled;
    },
  },
}));

describe("Collectibles Gate", () => {
  it("keeps reads available while the mutation policy is disabled", () => {
    expect(getCollectibleGatePolicy()).toEqual({
      enabled: false,
      mutationAllowed: false,
      readAllowed: true,
    });
    expect(() => assertCollectiblesMutationAllowed()).toThrowError(
      expect.objectContaining({ code: "GATE_DISABLED" })
    );
    expect(() => assertCollectiblesAccess({ kind: "read" })).not.toThrow();
  });

  it("requires the gate and rejects every impersonated mutation", () => {
    flags.enabled = true;
    expect(getCollectibleGatePolicy()).toEqual({
      enabled: true,
      mutationAllowed: true,
      readAllowed: true,
    });
    expect(() =>
      assertCollectiblesMutationAllowed({ impersonated: true })
    ).toThrowError(expect.objectContaining({ code: "POLICY_BLOCKED" }));
    expect(() =>
      assertCollectiblesAccess({
        authorized: true,
        impersonated: true,
        kind: "audit",
      })
    ).not.toThrow();
  });
});

describe("collectible lock plan", () => {
  it("uses the one global lock order and stable IDs within each phase", () => {
    expect(
      orderCollectibleLocks({
        cardInstanceIds: ["card-2", "card-1"],
        cardTemplateSupplyIds: ["template-2", "template-1"],
        gachaponMachineIds: ["machine-2", "machine-1"],
        listingIds: ["listing-1"],
        offerIds: ["offer-1"],
        packInstanceIds: ["pack-2", "pack-1"],
        quotaProjectionIds: ["quota-1"],
        walletIds: ["wallet-2", "wallet-1"],
      })
    ).toEqual([
      { id: "wallet-1", kind: "wallet" },
      { id: "wallet-2", kind: "wallet" },
      { id: "template-1", kind: "card-template-supply" },
      { id: "template-2", kind: "card-template-supply" },
      { id: "machine-1", kind: "gachapon-machine" },
      { id: "machine-2", kind: "gachapon-machine" },
      { id: "pack-1", kind: "pack-instance" },
      { id: "pack-2", kind: "pack-instance" },
      { id: "card-1", kind: "card-instance" },
      { id: "card-2", kind: "card-instance" },
      { id: "offer-1", kind: "offer" },
      { id: "listing-1", kind: "listing" },
      { id: "quota-1", kind: "quota-projection" },
    ]);
  });
});

describe("collectible application service", () => {
  it("replays a matching command without another posting", async () => {
    flags.enabled = true;
    const store = createCollectibleTransactionHarness({
      balances: { buyer: 10n, sink: 0n },
    });
    const service = createCollectibleApplicationService(store);
    const input = {
      idempotencyKey: "shop-purchase-1",
      locks: { walletIds: ["buyer", "sink"] },
      payload: { packTemplateId: "pack-1", price: 5n },
      scope: "shop.purchase",
      run: (tx: CollectibleTransaction) => {
        tx.transfer("buyer", "sink", 5n);
        return { purchaseId: "purchase-1" };
      },
    };

    const first = await service.execute(input);
    const replay = await service.execute(input);

    expect(first).toEqual({ purchaseId: "purchase-1", replayed: false });
    expect(replay).toEqual({ purchaseId: "purchase-1", replayed: true });
    expect(store.getBalance("buyer")).toBe(5n);
    expect(store.postings).toHaveLength(2);
  });

  it("rejects a mismatched replay and rolls back a failed command", async () => {
    flags.enabled = true;
    const store = createCollectibleTransactionHarness({
      balances: { buyer: 10n, sink: 0n },
    });
    const service = createCollectibleApplicationService(store);

    await service.execute({
      idempotencyKey: "shop-purchase-2",
      payload: { price: 5 },
      scope: "shop.purchase",
      run: (tx: CollectibleTransaction) => {
        tx.transfer("buyer", "sink", 5n);
        return { purchaseId: "purchase-2" };
      },
    });
    await expect(
      service.execute({
        idempotencyKey: "shop-purchase-2",
        payload: { price: 6 },
        scope: "shop.purchase",
        run: (_tx: CollectibleTransaction) => ({ purchaseId: "different" }),
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    await expect(
      service.execute({
        idempotencyKey: "shop-purchase-failure",
        payload: { price: 4 },
        scope: "shop.purchase",
        run: (tx: CollectibleTransaction) => {
          tx.transfer("buyer", "sink", 4n);
          throw new Error("issuance failed");
        },
      })
    ).rejects.toThrow("issuance failed");
    expect(store.getBalance("buyer")).toBe(5n);
    expect(store.postings).toHaveLength(2);
  });

  it("serializes competing custody commands and permits only one reservation", async () => {
    flags.enabled = true;
    const store = createCollectibleTransactionHarness();
    const service = createCollectibleApplicationService(store);
    const command = (key: string) =>
      service.execute({
        idempotencyKey: key,
        locks: { cardInstanceIds: ["card-1"] },
        payload: { assetId: "card-1" },
        scope: "listing.publish",
        run: (tx: CollectibleTransaction) => {
          tx.reserveAsset("card-1");
          return { listingId: key };
        },
      });

    const results = await Promise.allSettled([
      command("listing-1"),
      command("listing-2"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected")
    ).toMatchObject({
      reason: expect.objectContaining({ code: "ACTIVE_CUSTODY" }),
    });
  });

  it.each([
    "opening",
    "trading",
    "gifting",
    "listing",
    "buying",
    "freezing",
    "expiring",
    "cancelling",
    "correcting",
  ] as const)(
    "keeps one owner and custody row when %s races on the same asset",
    async (operation) => {
      flags.enabled = true;
      const store = createCollectibleTransactionHarness();
      const service = createCollectibleApplicationService(store);
      const command = (key: string) =>
        service.execute({
          idempotencyKey: key,
          locks: { cardInstanceIds: ["card-race"] },
          payload: { assetId: "card-race", operation },
          scope: `race.${operation}`,
          run: (tx: CollectibleTransaction) => {
            tx.reserveAsset("card-race");
            tx.insertUnique("owner", "card-race", {
              location: "custody",
              userId: "user-1",
            });
            return { assetId: "card-race", ownerUserId: "user-1" };
          },
        });

      const results = await Promise.allSettled([
        command(`${operation}-race-1`),
        command(`${operation}-race-2`),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected")
      ).toHaveLength(1);
      expect(store.hasCustody("card-race")).toBe(true);
      expect(store.getUnique("owner", "card-race")).toEqual({
        location: "custody",
        userId: "user-1",
      });
      expect(
        results.find((result) => result.status === "rejected")
      ).toMatchObject({
        reason: expect.objectContaining({ code: "ACTIVE_CUSTODY" }),
      });
    }
  );

  it("serializes competing last-copy supply commands", async () => {
    flags.enabled = true;
    const store = createCollectibleTransactionHarness();
    const service = createCollectibleApplicationService(store);
    const command = (key: string) =>
      service.execute({
        idempotencyKey: key,
        locks: { cardTemplateSupplyIds: ["template-1"] },
        payload: { templateId: "template-1" },
        scope: "card.issue",
        run: (tx: CollectibleTransaction) => {
          tx.insertUnique("mint", "template-1:1", { mintNumber: 1 });
          return { templateId: "template-1", mintNumber: 1 };
        },
      });

    const results = await Promise.allSettled([
      command("issue-last-copy-1"),
      command("issue-last-copy-2"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
    expect(store.getUnique("mint", "template-1:1")).toEqual({
      mintNumber: 1,
    });
  });

  it("retries deadlocks through the same command boundary and emits safe metrics", async () => {
    const metrics: unknown[] = [];
    let attempts = 0;
    const result = await withCollectibleDeadlockRetry(
      () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("deadlock"), { code: "40P01" });
        }
        return Promise.resolve("committed");
      },
      {
        metrics: (event) => {
          metrics.push(event);
        },
        operation: "grant.execute",
      }
    );
    expect(result).toBe("committed");
    expect(metrics).toEqual([
      expect.objectContaining({
        name: "deadlock_retry",
        operation: "grant.execute",
        retry: 1,
      }),
    ]);
    expect(JSON.stringify(metrics)).not.toContain("random");
  });

  it("rolls back nested issuance work while allowing an outer marker to commit", async () => {
    const store = createCollectibleTransactionHarness();
    await expect(
      store.transaction(async (tx) => {
        await expect(
          tx.transaction((nestedTx) => {
            nestedTx.insertUnique("pack", "partial", { created: true });
            throw new Error("impossible guarantee");
          })
        ).rejects.toThrow("impossible guarantee");
        tx.insertUnique("revision", "revision-1", {
          availability: "exhausted",
        });
      })
    ).resolves.toBeUndefined();
    expect(store.getUnique("pack", "partial")).toBeUndefined();
    expect(store.getUnique("revision", "revision-1")).toEqual({
      availability: "exhausted",
    });
  });
});
