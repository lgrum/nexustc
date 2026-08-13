import { correctProfileCatalogPurchase } from "./profile-catalog-purchase-correction";

const ledger = vi.hoisted(() => ({ reverse: vi.fn() }));

vi.mock("./eteris", () => ({
  reverseEterisTransaction: ledger.reverse,
}));

const original = {
  actorUserId: "user-1",
  id: "transaction-purchase-1",
  kind: "purchase",
  metadata: { catalogItemId: "item-grid", price: "75", publishedRevision: 3 },
  sourceModule: "commerce",
};

const purchaseOwnership = {
  catalogItemId: "item-grid",
  grantedAt: new Date("2026-08-12T10:00:00.000Z"),
  id: "ownership-purchase-1",
  sourceReference: original.id,
  userId: "user-1",
};

function createDatabase(options?: {
  existingOwnership?: Record<string, unknown> | null;
  original?: Record<string, unknown> | null;
  remainingOwnership?: Record<string, unknown> | null;
  reversal?: Record<string, unknown> | null;
  revokedOwnership?: Record<string, unknown> | null;
}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const ownershipSequence =
    options && "revokedOwnership" in options
      ? [options.existingOwnership ?? null, options.remainingOwnership ?? null]
      : [options?.remainingOwnership ?? null];
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserts.push(value);
        return Promise.resolve();
      }),
    })),
    query: {
      eterisTransaction: {
        findFirst: vi.fn().mockResolvedValue(options?.reversal ?? null),
      },
      profileCatalogOwnership: {
        findFirst: vi.fn(() => Promise.resolve(ownershipSequence.shift())),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi
            .fn()
            .mockResolvedValue(
              [
                options && "original" in options ? options.original : original,
              ].filter(Boolean)
            ),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: Record<string, unknown>) => {
        updates.push(value);
        return {
          where: vi.fn(() => ({
            returning: vi
              .fn()
              .mockResolvedValue(
                options && "revokedOwnership" in options
                  ? options.revokedOwnership
                    ? [options.revokedOwnership]
                    : []
                  : [purchaseOwnership]
              ),
          })),
        };
      }),
    })),
  };
  return {
    db: { transaction: (work: (executor: typeof tx) => unknown) => work(tx) },
    inserts,
    updates,
  };
}

const command = {
  actorUserId: "owner-1",
  purchaseTransactionId: original.id,
  reason: "Compra duplicada confirmada por soporte",
};

beforeEach(() => {
  vi.clearAllMocks();
  ledger.reverse.mockResolvedValue({
    id: "transaction-reversal-1",
    replayed: false,
  });
});

it("reverses the exact purchase and revokes only its linked ownership atomically", async () => {
  const store = createDatabase();

  await expect(
    correctProfileCatalogPurchase(store.db as never, command)
  ).resolves.toMatchObject({
    effectivePermanentEntitlement: false,
    itemId: "item-grid",
    ownershipId: "ownership-purchase-1",
    replayed: false,
    reversalTransactionId: "transaction-reversal-1",
    userId: "user-1",
  });
  expect(ledger.reverse).toHaveBeenCalledWith(expect.anything(), {
    actorUserId: "owner-1",
    idempotencyKey: "profile-catalog-correction:transaction-purchase-1",
    reason: command.reason,
    transactionId: "transaction-purchase-1",
  });
  expect(store.updates).toEqual([
    expect.objectContaining({
      revokedAt: expect.any(Date),
      revokedByUserId: "owner-1",
      revokeReason: command.reason,
    }),
  ]);
  expect(store.inserts).toEqual([
    expect.objectContaining({
      action: "correct-purchase",
      actorUserId: "owner-1",
      before: expect.objectContaining({
        effectivePermanentEntitlement: true,
        originalTransactionId: "transaction-purchase-1",
        userId: "user-1",
      }),
      after: expect.objectContaining({
        effectivePermanentEntitlement: false,
        reversalTransactionId: "transaction-reversal-1",
      }),
      note: command.reason,
    }),
  ]);
});

it("preserves effective entitlement when another active purchase or grant remains", async () => {
  const store = createDatabase({
    remainingOwnership: { id: "ownership-grant-1", sourceType: "grant" },
  });

  await expect(
    correctProfileCatalogPurchase(store.db as never, command)
  ).resolves.toMatchObject({ effectivePermanentEntitlement: true });
});

it("replays an existing correction without another reversal or audit", async () => {
  const store = createDatabase({
    existingOwnership: { ...purchaseOwnership, revokedAt: new Date() },
    remainingOwnership: null,
    reversal: {
      id: "transaction-reversal-1",
      reversesTransactionId: original.id,
    },
    revokedOwnership: null,
  });

  await expect(
    correctProfileCatalogPurchase(store.db as never, command)
  ).resolves.toMatchObject({
    effectivePermanentEntitlement: false,
    replayed: true,
    reversalTransactionId: "transaction-reversal-1",
  });
  expect(ledger.reverse).not.toHaveBeenCalled();
  expect(store.inserts).toHaveLength(0);
});

it.each([
  [{ original: null }, "PURCHASE_NOT_FOUND"],
  [
    { original: { ...original, kind: "admin_adjustment" } },
    "NOT_PROFILE_CATALOG_PURCHASE",
  ],
  [{ revokedOwnership: null }, "PURCHASE_NOT_FOUND"],
])(
  "rejects an invalid correction without touching the ledger",
  async (options, code) => {
    const store = createDatabase(options);

    await expect(
      correctProfileCatalogPurchase(store.db as never, command)
    ).rejects.toMatchObject({ code });
    expect(ledger.reverse).not.toHaveBeenCalled();
  }
);

it("requires a non-empty reason at the service boundary", async () => {
  const store = createDatabase();

  await expect(
    correctProfileCatalogPurchase(store.db as never, {
      ...command,
      reason: "  ",
    })
  ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  expect(ledger.reverse).not.toHaveBeenCalled();
});

it("rolls back ownership when the ledger projection is inconsistent", async () => {
  ledger.reverse.mockResolvedValue({ mismatched: ["wallet-user-1"] });
  const store = createDatabase();

  await expect(
    correctProfileCatalogPurchase(store.db as never, command)
  ).rejects.toMatchObject({ code: "PROJECTION_MISMATCH" });
  expect(store.inserts).toHaveLength(0);
});
