import {
  officialCardShopOffer,
  officialCardShopPurchase,
  officialCardShopPurchaseItem,
  officialCardShopOfferUsage,
  user,
} from "@repo/db";
import { normalizeCollectiblePayload } from "@repo/shared/collectibles";
import { describe, expect, it, vi } from "vitest";

import {
  purchaseOfficialCardShopOffer,
  reduceOfficialCardShopOfferQuota,
  restockOfficialCardShopOffer,
} from "./official-card-shop";

const flags = vi.hoisted(() => ({
  collectibles: true,
  economy: true,
  spending: true,
}));
const ledger = vi.hoisted(() => ({
  issue: vi.fn(),
  notification: vi.fn(),
  post: vi.fn(),
  wallet: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.collectibles;
    },
    get ETERIS_SPENDING_ENABLED() {
      return flags.spending;
    },
    get XP_ECONOMY_ENABLED() {
      return flags.economy;
    },
  },
}));

vi.mock("./collectible-issuance", () => ({
  CollectibleIssuanceError: class CollectibleIssuanceError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "CollectibleIssuanceError";
      this.code = code;
    }
  },
  issuePackInTransaction: ledger.issue,
  runCollectibleIssuanceInTransaction: (
    tx: unknown,
    callback: (nestedTx: unknown) => Promise<unknown>
  ) => callback(tx),
}));
vi.mock("./eteris", () => ({
  getOrCreateUserWalletInTransaction: ledger.wallet,
  lockEterisWalletsInTransaction: vi.fn().mockResolvedValue([
    {
      balance: 1000n,
      status: "active",
      walletId: "wallet-user-1",
    },
  ]),
  postEterisTransactionInTransaction: ledger.post,
}));
vi.mock("./notification", () => ({
  createUserNotification: ledger.notification,
}));

type StoreOptions = {
  account?: Partial<{
    banExpires: Date | null;
    banned: boolean;
    emailVerified: boolean;
  }>;
  offer?: Partial<{
    enabled: boolean;
    endsAt: Date | null;
    perAccountLimit: number | null;
    price: bigint;
    remainingSales: number | null;
    startsAt: Date | null;
    totalSold: number;
    version: number;
  }>;
  replay?: Record<string, unknown> | null;
  usage?: number;
};

function createStore(options: StoreOptions = {}) {
  const offer = {
    binding: "transferable" as const,
    createdAt: new Date("2026-08-16T00:00:00.000Z"),
    createdByUserId: "admin-1",
    enabled: true,
    endsAt: null,
    id: "offer-1",
    packTemplateId: "pack-template-1",
    perAccountLimit: null,
    price: 75n,
    remainingSales: 10,
    startsAt: null,
    totalSold: 0,
    updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    updatedByUserId: "admin-1",
    version: 4,
    ...options.offer,
  };
  const account = {
    banExpires: null,
    banned: false,
    emailVerified: true,
    id: "user-1",
    ...options.account,
  };
  const inserted: { table: unknown; value: unknown }[] = [];
  let replayRead = 0;
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: unknown) => {
        inserted.push({ table, value });
        return [];
      }),
    })),
    query: {
      officialCardShopOffer: {
        findFirst: vi.fn(() => Promise.resolve(offer)),
      },
      officialCardShopPurchase: {
        findFirst: vi.fn(() => {
          if (replayRead === 0) {
            replayRead += 1;
            return options.replay ?? null;
          }
          replayRead += 1;
          return null;
        }),
      },
    },
    select: vi.fn(() => {
      let table: unknown;
      const builder = {
        for: vi.fn(() => {
          if (table === user) {
            return Promise.resolve([account]);
          }
          if (table === officialCardShopOffer) {
            return Promise.resolve([offer]);
          }
          if (table === officialCardShopOfferUsage) {
            return Promise.resolve(
              options.usage === undefined
                ? []
                : [
                    {
                      offerId: offer.id,
                      purchasedQuantity: options.usage,
                      updatedAt: new Date(),
                      userId: account.id,
                    },
                  ]
            );
          }
          if (table === officialCardShopPurchaseItem) {
            return Promise.resolve([
              { ordinal: 1, packInstanceId: "pack-replay-1" },
            ]);
          }
          return Promise.resolve([]);
        }),
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        orderBy() {
          return table === officialCardShopPurchaseItem
            ? Promise.resolve([{ ordinal: 1, packInstanceId: "pack-replay-1" }])
            : builder;
        },
        where() {
          return builder;
        },
      };
      return builder;
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  };
  const purchase = {
    buyerUserId: account.id,
    eterisTransactionId: "transaction-1",
    fingerprint: "unused",
    id: "purchase-1",
    idempotencyKey: "shop-replay-key-1",
    offerId: offer.id,
    offerVersion: offer.version,
    packTemplateId: offer.packTemplateId,
    quantity: 1,
    revisionId: "revision-latest",
    totalPrice: offer.price,
    unitPrice: offer.price,
  };
  const db = {
    query: {
      officialCardShopPurchase: {
        findFirst: vi.fn(() => Promise.resolve(purchase)),
      },
    },
    transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
  return { db, inserted, offer, purchase, tx };
}

const baseCommand = {
  expectedOfferVersion: 4,
  expectedUnitPrice: 75n,
  idempotencyKey: "shop-purchase-key-1",
  offerId: "offer-1",
  quantity: 1,
  userId: "user-1",
};

describe("Official Shop purchase", () => {
  beforeEach(() => {
    flags.collectibles = true;
    flags.economy = true;
    flags.spending = true;
    vi.clearAllMocks();
    ledger.wallet.mockResolvedValue({ id: "wallet-user-1" });
    ledger.post.mockResolvedValue({ id: "transaction-1", replayed: false });
    ledger.issue.mockImplementation(
      (_tx: unknown, input: { issueReference: string }) => ({
        packInstanceId: input.issueReference.endsWith(":10")
          ? "pack-10"
          : `pack-${ledger.issue.mock.calls.length}`,
        revisionId: "revision-latest",
      })
    );
    ledger.notification.mockResolvedValue({ id: "notification-1" });
  });

  it.each([1, 10])(
    "issues and settles quantity %s in one purchase",
    async (quantity) => {
      const store = createStore({ offer: { remainingSales: 20 } });
      const result = await purchaseOfficialCardShopOffer(store.db as never, {
        ...baseCommand,
        idempotencyKey: `shop-purchase-key-${quantity}`,
        quantity,
      });

      expect(result).toMatchObject({
        quantity,
        revisionId: "revision-latest",
        totalPrice: String(75 * quantity),
        transactionId: "transaction-1",
        unitPrice: "75",
      });
      expect(ledger.issue).toHaveBeenCalledTimes(quantity);
      expect(ledger.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: "purchase",
          postings: [
            { amount: -75n * BigInt(quantity), walletId: "wallet-user-1" },
            { amount: 75n * BigInt(quantity), walletId: "eteris-system-sink" },
          ],
          sourceModule: "commerce",
        })
      );
      expect(
        store.inserted.some(({ table }) => table === officialCardShopPurchase)
      ).toBe(true);
      expect(ledger.notification).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [{ expectedUnitPrice: 76n }, "STALE_PRICE"],
    [{ expectedOfferVersion: 3 }, "STALE_VERSION"],
    [{ offer: { remainingSales: 1 }, quantity: 2 }, "QUOTA_EXHAUSTED"],
    [{ offer: { perAccountLimit: 1 }, usage: 1 }, "LIMIT_REACHED"],
  ] as const)(
    "rejects drift or quota before settlement (%s)",
    async (change, code) => {
      const { offer, ...options } = "offer" in change ? change : {};
      const store = createStore({
        ...options,
        ...(offer ? { offer } : {}),
      });
      await expect(
        purchaseOfficialCardShopOffer(store.db as never, {
          ...baseCommand,
          ...("expectedUnitPrice" in change
            ? { expectedUnitPrice: change.expectedUnitPrice }
            : {}),
          ...("expectedOfferVersion" in change
            ? { expectedOfferVersion: change.expectedOfferVersion }
            : {}),
          ...("quantity" in change ? { quantity: change.quantity } : {}),
        })
      ).rejects.toMatchObject({ code });
      expect(ledger.post).not.toHaveBeenCalled();
      expect(store.inserted).toHaveLength(0);
    }
  );

  it("rolls back issuance before posting if a requested Pack cannot issue", async () => {
    ledger.issue.mockRejectedValueOnce(new Error("supply failure"));
    const store = createStore();

    await expect(
      purchaseOfficialCardShopOffer(store.db as never, baseCommand)
    ).rejects.toThrow("supply failure");
    expect(ledger.post).not.toHaveBeenCalled();
    expect(ledger.notification).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it("keeps notification delivery outside settlement and deduplicated", async () => {
    ledger.notification.mockRejectedValueOnce(new Error("notification down"));

    const result = await purchaseOfficialCardShopOffer(
      createStore().db as never,
      baseCommand
    );
    expect(result).toMatchObject({ replayed: false });
    expect(ledger.post).toHaveBeenCalledOnce();
    expect(ledger.notification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: `card-shop-purchase:${result.purchaseId}`,
      })
    );
  });

  it("restocks and reduces quota through monotonic expected-version audits", async () => {
    let current = { ...createStore().offer, remainingSales: 5, version: 4 };
    const audits: unknown[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          audits.push(value);
          return [];
        }),
      })),
      select: vi.fn(() => {
        let table: unknown;
        const builder = {
          for: vi.fn(() => Promise.resolve([current])),
          from(nextTable: unknown) {
            table = nextTable;
            return builder;
          },
          where() {
            return builder;
          },
        };
        void table;
        return builder;
      }),
      update: vi.fn(() => ({
        set: vi.fn((values: typeof current) => ({
          where: vi.fn(() => {
            current = { ...current, ...values };
            return {
              returning: vi.fn(() => Promise.resolve([current])),
            };
          }),
        })),
      })),
    };
    const db = {
      transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx)
      ),
    };

    await expect(
      restockOfficialCardShopOffer(db as never, {
        amount: 3,
        expectedVersion: 4,
        offerId: "offer-1",
        reason: "Reposición de lanzamiento",
        actorUserId: "owner-1",
      })
    ).resolves.toMatchObject({ remainingSales: 8, version: 5 });
    await expect(
      reduceOfficialCardShopOfferQuota(db as never, {
        amount: 8,
        expectedVersion: 5,
        offerId: "offer-1",
        reason: "Ajuste de cupo aprobado",
        actorUserId: "owner-1",
      })
    ).resolves.toMatchObject({ remainingSales: 0, version: 6 });
    await expect(
      reduceOfficialCardShopOfferQuota(db as never, {
        amount: 1,
        expectedVersion: 6,
        offerId: "offer-1",
        reason: "Intento fuera de cupo",
        actorUserId: "owner-1",
      })
    ).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" });
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "restock", version: 5 }),
        expect.objectContaining({ action: "reduce_quota", version: 6 }),
      ])
    );
  });

  it("returns exact replayed Pack IDs without a second ledger entry", async () => {
    const replay = {
      ...createStore().purchase,
      fingerprint: normalizeCollectiblePayload({
        expectedOfferVersion: baseCommand.expectedOfferVersion,
        expectedUnitPrice: baseCommand.expectedUnitPrice,
        offerId: baseCommand.offerId,
        quantity: baseCommand.quantity,
        userId: baseCommand.userId,
      }),
      idempotencyKey: baseCommand.idempotencyKey,
    };
    const store = createStore({ replay });
    await expect(
      purchaseOfficialCardShopOffer(store.db as never, baseCommand)
    ).resolves.toMatchObject({
      packInstanceIds: ["pack-replay-1"],
      replayed: true,
      transactionId: "transaction-1",
    });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it.each(["collectibles", "economy", "spending"] as const)(
    "honors the %s gate",
    async (flag) => {
      flags[flag] = false;
      const store = createStore();
      await expect(
        purchaseOfficialCardShopOffer(store.db as never, baseCommand)
      ).rejects.toMatchObject({
        code: flag === "collectibles" ? "GATE_DISABLED" : "SPENDING_DISABLED",
      });
      expect(ledger.post).not.toHaveBeenCalled();
    }
  );
});
