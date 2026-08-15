import {
  grantProfileCatalogItem,
  revokeProfileCatalogGrant,
} from "./profile-catalog-grant";

function createDatabase(options?: {
  activeGrant?: Record<string, unknown> | null;
  item?: Record<string, unknown>;
  ownershipSequence?: (Record<string, unknown> | null)[];
  sourceGrant?: Record<string, unknown> | null;
}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const ownershipFindFirst = vi.fn();
  for (const value of options?.ownershipSequence ?? [
    options?.sourceGrant ?? null,
    options?.activeGrant ?? null,
  ]) {
    ownershipFindFirst.mockResolvedValueOnce(value);
  }
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserts.push(value);
        return Promise.resolve();
      }),
    })),
    query: {
      profileCatalogOwnership: { findFirst: ownershipFindFirst },
      user: { findFirst: vi.fn().mockResolvedValue({ id: "user-1" }) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn().mockResolvedValue([
            {
              currentPublishedRevisionId: "revision-1",
              id: "item-grid",
              lifecycle: "active",
              stableKey: "layout.grid",
              ...options?.item,
            },
          ]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            updates.push(value);
            return Promise.resolve([
              {
                catalogItemId: "item-grid",
                grantedAt: new Date("2026-08-01T00:00:00Z"),
                grantedByUserId: "owner-1",
                grantReason: "Caso de soporte",
                id: "grant-1",
                revokedAt: value.revokedAt,
                revokedByUserId: value.revokedByUserId,
                revokeReason: value.revokeReason,
                sourceReference: "support-123",
                sourceType: "grant",
                userId: "user-1",
              },
            ]);
          }),
        })),
      })),
    })),
  };
  return {
    db: { transaction: (work: (executor: typeof tx) => unknown) => work(tx) },
    inserts,
    ownershipFindFirst,
    updates,
  };
}

it("creates a separately sourced grant and a complete owner audit record", async () => {
  const store = createDatabase();

  await expect(
    grantProfileCatalogItem(store.db as never, {
      actorUserId: "owner-1",
      itemId: "item-grid",
      reason: "Caso de soporte",
      sourceReference: "support-123",
      userId: "user-1",
    })
  ).resolves.toMatchObject({
    effectivePermanentEntitlement: true,
    itemId: "item-grid",
    replayed: false,
    userId: "user-1",
  });
  expect(store.inserts).toEqual([
    expect.objectContaining({
      catalogItemId: "item-grid",
      grantedByUserId: "owner-1",
      grantReason: "Caso de soporte",
      sourceReference: "support-123",
      sourceType: "grant",
      userId: "user-1",
    }),
    expect.objectContaining({
      action: "grant-permanent-access",
      actorUserId: "owner-1",
      after: expect.objectContaining({
        itemId: "item-grid",
        reason: "Caso de soporte",
        sourceReference: "support-123",
        userId: "user-1",
      }),
      before: null,
      note: "Caso de soporte",
      targetKind: "profile-catalog-ownership",
    }),
  ]);
});

it("replays the same active source and rejects an ambiguous second grant", async () => {
  const existing = {
    catalogItemId: "item-grid",
    id: "grant-1",
    revokedAt: null,
    sourceReference: "support-123",
    sourceType: "grant",
    userId: "user-1",
  };
  const replay = createDatabase({ sourceGrant: existing });
  await expect(
    grantProfileCatalogItem(replay.db as never, {
      actorUserId: "owner-1",
      itemId: "item-grid",
      reason: "Caso de soporte",
      sourceReference: "support-123",
      userId: "user-1",
    })
  ).resolves.toMatchObject({ grantId: "grant-1", replayed: true });
  expect(replay.inserts).toHaveLength(0);

  const duplicate = createDatabase({ activeGrant: existing });
  await expect(
    grantProfileCatalogItem(duplicate.db as never, {
      actorUserId: "owner-1",
      itemId: "item-grid",
      reason: "Segundo caso",
      sourceReference: "support-456",
      userId: "user-1",
    })
  ).rejects.toMatchObject({ code: "ACTIVE_GRANT_EXISTS" });

  const purchaseCollision = createDatabase({
    sourceGrant: { ...existing, sourceType: "purchase" },
  });
  await expect(
    grantProfileCatalogItem(purchaseCollision.db as never, {
      actorUserId: "owner-1",
      itemId: "item-grid",
      reason: "Caso de soporte",
      sourceReference: "support-123",
      userId: "user-1",
    })
  ).rejects.toMatchObject({ code: "SOURCE_REFERENCE_CONFLICT" });
});

it("revokes only the selected grant and preserves another effective source", async () => {
  const store = createDatabase({
    ownershipSequence: [{ id: "purchase-1", sourceType: "purchase" }],
  });

  await expect(
    revokeProfileCatalogGrant(store.db as never, {
      actorUserId: "owner-1",
      grantId: "grant-1",
      reason: "Corrección confirmada",
    })
  ).resolves.toMatchObject({
    effectivePermanentEntitlement: true,
    grantId: "grant-1",
    itemId: "item-grid",
    userId: "user-1",
  });
  expect(store.updates).toEqual([
    expect.objectContaining({
      revokedAt: expect.any(Date),
      revokedByUserId: "owner-1",
      revokeReason: "Corrección confirmada",
    }),
  ]);
  expect(store.inserts).toEqual([
    expect.objectContaining({
      action: "revoke-permanent-access",
      actorUserId: "owner-1",
      before: expect.objectContaining({ revokedAt: null }),
      after: expect.objectContaining({
        revokeReason: "Corrección confirmada",
        revokedByUserId: "owner-1",
      }),
      targetId: "grant-1",
    }),
  ]);
});

it("reports fallback when revocation removes the final permanent source", async () => {
  const store = createDatabase({ ownershipSequence: [null] });

  await expect(
    revokeProfileCatalogGrant(store.db as never, {
      actorUserId: "owner-1",
      grantId: "grant-1",
      reason: "Corrección confirmada",
    })
  ).resolves.toMatchObject({ effectivePermanentEntitlement: false });
});

it.each(["archived", "disabled"])(
  "does not grant a new %s catalog item",
  async (lifecycle) => {
    const store = createDatabase({ item: { lifecycle } });

    await expect(
      grantProfileCatalogItem(store.db as never, {
        actorUserId: "owner-1",
        itemId: "item-grid",
        reason: "Caso de soporte",
        sourceReference: "support-123",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ code: "ITEM_UNAVAILABLE" });
    expect(store.inserts).toHaveLength(0);
  }
);

it("replays an exact grant even after the catalog item is archived", async () => {
  const store = createDatabase({
    item: { lifecycle: "archived" },
    sourceGrant: {
      catalogItemId: "item-grid",
      id: "grant-1",
      revokedAt: null,
      sourceReference: "support-123",
      sourceType: "grant",
      userId: "user-1",
    },
  });

  await expect(
    grantProfileCatalogItem(store.db as never, {
      actorUserId: "owner-1",
      itemId: "item-grid",
      reason: "Caso de soporte",
      sourceReference: "support-123",
      userId: "user-1",
    })
  ).resolves.toMatchObject({ grantId: "grant-1", replayed: true });
  expect(store.inserts).toHaveLength(0);
});
