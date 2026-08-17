import { blackMarketListing } from "@repo/db";
import { describe, expect, it, vi } from "vitest";

import {
  cardCursorValue,
  decodeInventoryCursor,
  encodeInventoryCursor,
  listPrivatePackInventory,
  listPrivatePackOpeningHistory,
  listPublicCardCollection,
  listPublicPackCollection,
  publicCardCollectionQuerySchema,
  publicPackCollectionQuerySchema,
  privateCardInventoryQuerySchema,
  privatePackInventoryQuerySchema,
} from "./collectible-inventory";

describe("private collectible inventory contracts", () => {
  it("round-trips stable opaque cursors with their sort tie-breaker", () => {
    const cursor = {
      id: "card-2",
      sort: "newest",
      value: "2026-08-16T00:00:00.000Z",
    };
    expect(decodeInventoryCursor(encodeInventoryCursor(cursor))).toEqual(
      cursor
    );
  });

  it("accepts the complete initial card filter contract and bounded pages", () => {
    expect(
      privateCardInventoryQuerySchema.parse({
        acquiredAfter: "2026-01-01T00:00:00.000Z",
        acquiredBefore: "2026-12-31T00:00:00.000Z",
        characterId: "character-1",
        edition: "Primera",
        forSale: false,
        gameName: "Metroid",
        limited: true,
        limit: 50,
        rarity: "rare",
        search: "samus",
        seriesId: "series-1",
        sort: "mint",
        transferability: "transferable",
      })
    ).toMatchObject({ limit: 50, sort: "mint" });
    expect(
      privatePackInventoryQuerySchema.parse({
        acquiredAfter: "2026-01-01T00:00:00.000Z",
        acquiredBefore: "2026-12-31T00:00:00.000Z",
        forSale: false,
        limit: 50,
        sort: "acquired",
        transferability: "account-bound",
      })
    ).toMatchObject({
      forSale: false,
      sort: "acquired",
      transferability: "account-bound",
    });
    expect(() =>
      privatePackInventoryQuerySchema.parse({ limit: 51 })
    ).toThrow();
  });

  it("applies the Pack for-sale predicate inside the paginated SQL query", async () => {
    const query = createSelectQuery([]);
    const db = { select: vi.fn().mockReturnValue(query) };

    await listPrivatePackInventory(db as never, "owner-1", {
      forSale: true,
      limit: 1,
    });

    expect(
      containsReference(query.where.mock.calls[0]?.[0], blackMarketListing)
    ).toBe(true);
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it("returns a stable cursor for Pack-opening history pages", async () => {
    const historyQuery = createSelectQuery([
      {
        binding: "transferable" as const,
        id: "pack-opened-2",
        issuedAt: new Date("2026-08-15T00:00:00.000Z"),
        issueSource: "grant-campaign" as const,
        openedAt: new Date("2026-08-16T00:00:00.000Z"),
        revision: 1,
        revisionId: "revision-1",
        state: "opened" as const,
        templateId: "pack-template-1",
        templateName: "Pack Inicial",
      },
      {
        binding: "transferable" as const,
        id: "pack-opened-1",
        issuedAt: new Date("2026-08-14T00:00:00.000Z"),
        issueSource: "grant-campaign" as const,
        openedAt: new Date("2026-08-15T00:00:00.000Z"),
        revision: 1,
        revisionId: "revision-1",
        state: "opened" as const,
        templateId: "pack-template-1",
        templateName: "Pack Inicial",
      },
    ]);
    const openingQuery = createSelectQuery([
      { cards: [], openingId: "opening-2" },
    ]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(historyQuery)
        .mockReturnValue(openingQuery),
    };

    const result = await listPrivatePackOpeningHistory(db as never, "owner-1", {
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(decodeInventoryCursor(result.nextCursor ?? undefined)).toEqual({
      id: "pack-opened-2",
      sort: "newest",
      value: "2026-08-16T00:00:00.000Z",
    });
    expect(historyQuery.limit).toHaveBeenCalledWith(2);
  });
});

function containsReference(value: unknown, target: unknown): boolean {
  if (value === target) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsReference(item, target));
  }
  if (
    value &&
    typeof value === "object" &&
    "queryChunks" in value &&
    Array.isArray((value as { queryChunks?: unknown }).queryChunks)
  ) {
    return (value as { queryChunks: unknown[] }).queryChunks.some((item) =>
      containsReference(item, target)
    );
  }
  return false;
}

function createSelectQuery<T>(rows: T[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function createPublicCollectionDb<T>(rows: T[], visible: boolean) {
  const query = createSelectQuery(rows);
  return {
    query: {
      profileSettings: {
        findFirst: vi.fn().mockResolvedValue({
          visibilityConfig: { publicCollection: visible },
        }),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: "owner-1" }) },
    },
    select: vi.fn().mockReturnValue(query),
  };
}

describe("public collection contracts and request-bound reads", () => {
  it("accepts bounded public filters and the same stable sort vocabulary", () => {
    expect(
      publicCardCollectionQuerySchema.parse({
        character: "Samus",
        edition: "Primera",
        forSale: false,
        gameName: "metroid",
        limit: 50,
        limited: true,
        rarity: "rare",
        search: "clásicos",
        series: "Clásicos",
        sort: "mint",
        transferability: "transferable",
        userId: "owner-1",
      })
    ).toMatchObject({ limit: 50, sort: "mint" });
    expect(
      publicPackCollectionQuerySchema.parse({
        forSale: false,
        limit: 50,
        search: "inicial",
        sort: "template",
        transferability: "account-bound",
        userId: "owner-1",
      })
    ).toMatchObject({ limit: 50, sort: "template" });
    expect(() =>
      publicCardCollectionQuerySchema.parse({ limit: 51, userId: "owner-1" })
    ).toThrow();
  });

  it("normalizes acquisition aliases before generating cursor values", () => {
    expect(
      cardCursorValue(
        {
          binding: "transferable",
          characterName: "Samus",
          edition: null,
          id: "card-1",
          issuedAt: new Date("2026-08-16T00:00:00.000Z"),
          lifetimeSupplyCeiling: null,
          mintNumber: 1,
          normalizedGameName: "metroid",
          rarity: "rare",
          seriesName: "Clásicos",
        },
        "acquired"
      )
    ).toBe("2026-08-16T00:00:00.000Z");
  });

  it("returns immediately when the owner preference is private", async () => {
    const db = createPublicCollectionDb([], false);
    await expect(
      listPublicCardCollection(db as never, {
        limit: 24,
        userId: "owner-1",
      })
    ).resolves.toEqual({ items: [], nextCursor: null, visible: false });
    await expect(
      listPublicPackCollection(db as never, {
        limit: 24,
        userId: "owner-1",
      })
    ).resolves.toEqual({ items: [], nextCursor: null, visible: false });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rechecks the current preference and shapes only public card fields", async () => {
    const query = createSelectQuery([
      {
        availability: "active" as const,
        binding: "transferable" as const,
        characterName: "Samus Aran",
        description: "Cazadora espacial",
        edition: "Primera",
        gameName: "Metroid Prime",
        id: "card-instance-1",
        instanceAvailability: "active" as const,
        issuedAt: new Date("2026-08-16T00:00:00.000Z"),
        lifetimeSupplyCeiling: 100,
        mintNumber: 7,
        normalizedGameName: "metroid prime",
        presentationMetadata: {
          accentColor: "#7c3aed",
          frameKey: "default",
          watermarkText: "NeXusTC",
        },
        rarity: "rare" as const,
        renderedVariants: [],
        seriesName: "Clásicos",
        templateId: "card-template-1",
      },
    ]);
    const db = createPublicCollectionDb([], true);
    db.select.mockReturnValue(query);

    const result = await listPublicCardCollection(db as never, {
      limit: 24,
      userId: "owner-1",
    });
    expect(result.visible).toBe(true);
    expect(result.items[0]).toMatchObject({
      id: "card-instance-1",
      mintNumber: 7,
      template: { id: "card-template-1" },
    });
    expect(result.items[0]).not.toHaveProperty("ownerUserId");
    expect(result.items[0]).not.toHaveProperty("provenance");
    expect(result.items[0]).not.toHaveProperty("mintedSupply");
    expect(db.query.profileSettings.findFirst).toHaveBeenCalledTimes(1);
  });
});
