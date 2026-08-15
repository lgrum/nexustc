import { purchaseProfileCatalogItem } from "./profile-catalog-purchase";

const flags = vi.hoisted(() => ({
  customization: true,
  economy: true,
  spending: true,
}));
const ledger = vi.hoisted(() => ({ post: vi.fn(), wallet: vi.fn() }));

vi.mock("@repo/env", () => ({
  env: {
    get ETERIS_SPENDING_ENABLED() {
      return flags.spending;
    },
    get PROFILE_CUSTOMIZATION_ENABLED() {
      return flags.customization;
    },
    get XP_ECONOMY_ENABLED() {
      return flags.economy;
    },
  },
}));
vi.mock("./eteris", () => ({
  EterisError: class EterisError extends Error {
    override readonly name = "EterisError";
  },
  getOrCreateUserWalletInTransaction: ledger.wallet,
  postEterisTransactionInTransaction: ledger.post,
}));

function createDatabase(options?: {
  item?: Record<string, unknown>;
  ownership?: Record<string, unknown> | null;
  replay?: Record<string, unknown> | null;
}) {
  const ownerships: Record<string, unknown>[] = [];
  const item = {
    currentPublishedRevisionId: "revision-id-3",
    eterisPrice: 75n,
    id: "item-grid",
    isFree: false,
    kind: "layout",
    lifecycle: "active",
    revision: 3,
    stableKey: "layout.grid",
    ...options?.item,
  };
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        ownerships.push(value);
        return Promise.resolve();
      }),
    })),
    query: {
      eterisTransaction: {
        findFirst: vi.fn().mockResolvedValue(options?.replay ?? null),
      },
      profileCatalogOwnership: {
        findFirst: vi.fn().mockResolvedValue(options?.ownership ?? null),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([item]),
          })),
        })),
      })),
    })),
  };
  return {
    db: { transaction: (work: (executor: typeof tx) => unknown) => work(tx) },
    ownerships,
  };
}

const command = {
  expectedPrice: 75n,
  expectedRevision: 3,
  idempotencyKey: "purchase-profile-item-1",
  itemId: "item-grid",
  userId: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.customization = true;
  flags.economy = true;
  flags.spending = true;
  ledger.wallet.mockResolvedValue({
    balance: 100n,
    id: "wallet-user-1",
    status: "active",
  });
  ledger.post.mockResolvedValue({ id: "transaction-1", replayed: false });
});

it("settles a balanced User-to-Sink purchase and creates permanent ownership", async () => {
  const store = createDatabase();

  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).resolves.toEqual({
    itemId: "item-grid",
    ownershipId: expect.any(String),
    price: "75",
    replayed: false,
    revision: 3,
    transactionId: "transaction-1",
  });
  expect(ledger.post).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      idempotencyKey: command.idempotencyKey,
      kind: "purchase",
      postings: [
        { amount: -75n, walletId: "wallet-user-1" },
        { amount: 75n, walletId: "eteris-system-sink" },
      ],
      sourceModule: "commerce",
      spending: true,
    })
  );
  expect(store.ownerships).toEqual([
    expect.objectContaining({
      catalogItemId: "item-grid",
      sourceReference: "transaction-1",
      sourceType: "purchase",
      userId: "user-1",
    }),
  ]);
});

it("commits a projection freeze before reporting a settlement mismatch", async () => {
  ledger.post.mockResolvedValueOnce({ mismatched: ["wallet-user-1"] });
  const store = createDatabase();

  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).rejects.toMatchObject({ code: "PROJECTION_MISMATCH" });
  expect(store.ownerships).toHaveLength(0);
});

it("returns a matching replay without charging or creating ownership again", async () => {
  const store = createDatabase({
    item: { lifecycle: "archived", revision: 4 },
    ownership: {
      id: "ownership-1",
      sourceReference: "transaction-1",
    },
    replay: {
      actorUserId: "user-1",
      id: "transaction-1",
      kind: "purchase",
      metadata: {
        catalogItemId: "item-grid",
        price: "75",
        publishedRevision: 3,
      },
      sourceModule: "commerce",
    },
  });

  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).resolves.toMatchObject({
    ownershipId: "ownership-1",
    replayed: true,
    transactionId: "transaction-1",
  });
  expect(ledger.post).not.toHaveBeenCalled();
  expect(store.ownerships).toHaveLength(0);
});

it.each([
  [{ lifecycle: "archived" }, "ITEM_UNAVAILABLE"],
  [{ currentPublishedRevisionId: null }, "ITEM_UNAVAILABLE"],
  [{ eterisPrice: null }, "NOT_PURCHASABLE"],
  [{ eterisPrice: 80n }, "PRICE_CHANGED"],
  [{ isFree: true }, "NOT_PURCHASABLE"],
  [{ revision: 4 }, "REVISION_CHANGED"],
])("rejects catalog drift without charging", async (item, code) => {
  const store = createDatabase({ item });
  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).rejects.toMatchObject({ code });
  expect(ledger.post).not.toHaveBeenCalled();
  expect(store.ownerships).toHaveLength(0);
});

it("allows VIP-accessible items to be converted but rejects permanent ownership", async () => {
  const store = createDatabase();
  await purchaseProfileCatalogItem(store.db as never, command);
  expect(ledger.post).toHaveBeenCalledOnce();

  const ownedStore = createDatabase({ ownership: { id: "grant-1" } });
  await expect(
    purchaseProfileCatalogItem(ownedStore.db as never, command)
  ).rejects.toMatchObject({ code: "ALREADY_OWNED" });
  expect(ledger.post).toHaveBeenCalledOnce();
});

it.each([
  ["customization", "CUSTOMIZATION_DISABLED"],
  ["economy", "SPENDING_DISABLED"],
  ["spending", "SPENDING_DISABLED"],
] as const)("honors the %s gate", async (flag, code) => {
  flags[flag] = false;
  const store = createDatabase();
  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).rejects.toMatchObject({ code });
  expect(ledger.post).not.toHaveBeenCalled();
});

it.each([
  [{ balance: -1n, id: "wallet-user-1", status: "active" }, "WALLET_DEBT"],
  [{ balance: 100n, id: "wallet-user-1", status: "frozen" }, "WALLET_BLOCKED"],
  [{ balance: 100n, id: "wallet-user-1", status: "closed" }, "WALLET_BLOCKED"],
])("rejects blocked wallet state before settlement", async (wallet, code) => {
  ledger.wallet.mockResolvedValue(wallet);
  const store = createDatabase();
  await expect(
    purchaseProfileCatalogItem(store.db as never, command)
  ).rejects.toMatchObject({ code });
  expect(ledger.post).not.toHaveBeenCalled();
});
