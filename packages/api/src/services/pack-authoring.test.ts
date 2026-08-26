import { describe, expect, it, vi } from "vitest";

import {
  buildPackPublicationImpact,
  listPackTemplateGrantCampaigns,
  publishPackRevision,
  savePackRevisionDraft,
} from "./pack-authoring";

const revision = (cardTemplateId: string, guarantee = false) => ({
  bindingPolicy: "either" as const,
  cardCount: 1,
  duplicatePolicy: "allow" as const,
  drawGroups: [
    {
      cardWeights: [{ cardTemplateId, rarity: "rare" as const, weight: 1 }],
      drawCount: 1,
      guarantees: guarantee
        ? [{ minimumCount: 1, rarity: "rare" as const }]
        : [],
      order: 1,
      rarityWeights: [{ rarity: "rare" as const, weight: 1 }],
    },
  ],
});

describe("Pack publication impact", () => {
  it("enumerates future channels without requiring not-yet-created channel tables", () => {
    const impact = buildPackPublicationImpact(
      revision("card-old"),
      revision("card-new", true),
      ["card-unavailable"],
      {
        gachaponMachines: [
          {
            binding: "transferable",
            cost: "25",
            id: "machine-1",
            name: "Machine 1",
            packTemplateId: "pack-1",
            state: "active",
            version: 1,
            warning: "warning",
          },
        ],
        grantCampaigns: [
          {
            endsAt: null,
            id: "campaign-1",
            packTemplateId: "pack-1",
            quantityCeiling: 100,
            quantityIssued: 10,
            startsAt: null,
            state: "active",
            version: 2,
            warning: "warning",
          },
        ],
        shopOffers: [
          {
            enabled: true,
            id: "offer-1",
            packTemplateId: "pack-1",
            price: "100",
            version: 3,
            warning: "warning",
          },
        ],
      }
    );
    expect(impact.activeShopOffers).toEqual([
      {
        enabled: true,
        id: "offer-1",
        packTemplateId: "pack-1",
        price: "100",
        version: 3,
        warning: "warning",
      },
    ]);
    expect(impact.activeGachaponMachines.length).toBe(1);
    expect(impact.activeGachaponMachines[0]?.id).toBe("machine-1");
    expect(impact.activeGrantCampaigns.length).toBe(1);
    expect(impact.activeGrantCampaigns[0]?.id).toBe("campaign-1");
    expect(impact.cardPoolChanges).toEqual({
      addedCardTemplateIds: ["card-new"],
      removedCardTemplateIds: ["card-old"],
    });
    expect(impact.guaranteeChanges.changed).toBe(true);
    expect(impact.unavailableTemplateIds).toEqual(["card-unavailable"]);
  });

  it("includes active Pack grant campaigns with an explicit future-revision warning", async () => {
    const rows = [
      {
        endsAt: null,
        id: "campaign-1",
        packTemplateId: "pack-1",
        quantityCeiling: 100,
        quantityIssued: 10,
        startsAt: null,
        state: "active" as const,
        version: 2,
      },
    ];
    const query = {
      from: vi.fn(),
      orderBy: vi.fn().mockResolvedValue(rows),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const db = { select: vi.fn().mockReturnValue(query) };

    await expect(
      listPackTemplateGrantCampaigns(db as never, "pack-1")
    ).resolves.toEqual([
      expect.objectContaining({
        id: "campaign-1",
        warning: expect.stringContaining("concesiones futuras"),
      }),
    ]);
    expect(query.where).toHaveBeenCalledOnce();
  });
});

describe("Retired Pack Template lifecycle guards", () => {
  const draftInput = {
    cardCount: 1,
    duplicatePolicy: "allow" as const,
    drawGroups: [
      {
        drawCount: 1,
        order: 1,
        rarityWeights: [{ rarity: "rare", weight: 1 }],
      },
    ],
  };

  function queuedLockDb(queuedRows: unknown[][]) {
    const tx = {
      delete: vi.fn(),
      insert: vi.fn(),
      select: vi.fn(() => {
        const chain = {
          for: vi.fn(() => Promise.resolve(queuedRows.shift() ?? [])),
          from: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve(queuedRows.shift() ?? [])),
          orderBy: vi.fn(() => chain),
          where: vi.fn(() => chain),
        };
        return chain;
      }),
      update: vi.fn(),
    };
    return {
      db: {
        transaction: vi.fn((callback: (tx: unknown) => unknown) =>
          callback(tx)
        ),
      },
      tx,
    };
  }

  it("rejects saving a revision draft for a retired template", async () => {
    const { db, tx } = queuedLockDb([[{ id: "pack-1", lifecycle: "retired" }]]);
    await expect(
      savePackRevisionDraft(db as never, "admin-1", "pack-1", {
        ...draftInput,
        templateId: "pack-1",
      })
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects publishing a revision for a retired template", async () => {
    const { db, tx } = queuedLockDb([
      [{ id: "pack-1", lifecycle: "retired", version: 3 }],
      [{ id: "rev-1", version: 2 }],
    ]);
    await expect(
      publishPackRevision(db as never, "admin-1", "pack-1", {
        confirm: true,
        expectedVersion: 3,
        reason: "Reactivación indebida",
        revisionId: "rev-1",
      })
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("still saves drafts and publishes for active templates past the guard", async () => {
    const active = queuedLockDb([[{ id: "pack-1", lifecycle: "active" }]]);
    // The draft path proceeds past the guard into the revision lookup.
    await expect(
      savePackRevisionDraft(active.db as never, "admin-1", "pack-1", {
        ...draftInput,
        templateId: "pack-1",
      })
    ).rejects.not.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(active.tx.select).toHaveBeenCalled();
  });

  it("refuses to publish without an explicit confirmation before any storage access", async () => {
    const { db, tx } = queuedLockDb([]);
    await expect(
      publishPackRevision(db as never, "admin-1", "pack-1", {
        confirm: false,
        expectedVersion: 3,
        revisionId: "rev-1",
      })
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
      message: expect.stringContaining("Confirma explícitamente"),
    });
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
