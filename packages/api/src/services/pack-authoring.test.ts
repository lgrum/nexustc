import { describe, expect, it, vi } from "vitest";

import {
  buildPackPublicationImpact,
  listPackTemplateGrantCampaigns,
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
        gachaponMachines: [{ id: "machine-1" }],
        grantCampaigns: [{ id: "campaign-1" }],
        promotions: [],
        shopOffers: [{ id: "offer-1" }],
      }
    );
    expect(impact.activeShopOffers).toEqual([{ id: "offer-1" }]);
    expect(impact.activeGachaponMachines).toEqual([{ id: "machine-1" }]);
    expect(impact.activeGrantCampaigns).toEqual([{ id: "campaign-1" }]);
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
