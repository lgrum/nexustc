import type { ProfileCustomizationDraft } from "@repo/shared/profile-customization";
import { EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS } from "@repo/shared/profile-customization";
import { describe, expect, it, vi } from "vitest";

import {
  rankRareCards,
  resolvePublicCollectibleShowcases,
  sortUnopenedPacksByNewest,
} from "./profile-collectible-showcases";
import { resolveCurrentProfileDefaults } from "./profile-customization-manifest";

const CARD_ROW = {
  availability: "active" as const,
  binding: "transferable" as const,
  characterName: "Samus Aran",
  description: "Cazadora espacial",
  edition: "Primera",
  gameName: "Metroid Prime",
  id: "card-1",
  issuedAt: new Date("2026-08-16T12:00:00.000Z"),
  lifetimeSupplyCeiling: 100,
  mintNumber: 7,
  presentationMetadata: {
    accentColor: "#7c3aed",
    frameKey: "default",
    watermarkText: "NeXusTC",
  },
  rarity: "rare" as const,
  renderedVariants: [],
  seriesName: "Clásicos",
  templateAvailability: "active" as const,
  templateId: "card-template-1",
};

const PACK_ROWS = [
  {
    availability: "active" as const,
    binding: "account-bound" as const,
    id: "pack-old",
    issuedAt: new Date("2026-08-15T12:00:00.000Z"),
    revision: 1,
    revisionAvailability: "active" as const,
    templateAssetObjectKey: "packs/rendered/pack-1.webp",
    templateId: "pack-template-1",
    templateLifecycle: "active" as const,
    templateName: "Pack Inicial",
  },
  {
    availability: "active" as const,
    binding: "transferable" as const,
    id: "pack-new",
    issuedAt: new Date("2026-08-16T12:00:00.000Z"),
    revision: 2,
    revisionAvailability: "active" as const,
    templateAssetObjectKey: "packs/rendered/pack-1.webp",
    templateId: "pack-template-1",
    templateLifecycle: "active" as const,
    templateName: "Pack Inicial",
  },
];

function createReadDb<T>(rows: T[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return {
    query: {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "user-1" }),
      },
    },
    select: vi.fn().mockReturnValue(query),
    selectQuery: query,
  };
}

function configurationFor(
  type: "card" | "rare-card" | "unopened-pack",
  payload: Record<string, unknown>
) {
  const defaults = resolveCurrentProfileDefaults();
  return {
    ...defaults,
    showcases: defaults.showcases.map((showcase) =>
      showcase.type === type
        ? { ...showcase, enabled: true, payload }
        : showcase
    ),
  } as ProfileCustomizationDraft;
}

describe("collectible showcase ranking", () => {
  it("applies every Rare Card tie-breaker in the documented order", () => {
    const ranked = rankRareCards([
      {
        id: "unlimited",
        issuedAt: "2026-01-01T00:00:00.000Z",
        lifetimeSupplyCeiling: null,
        mintNumber: 1,
        rarity: "legendary",
      },
      {
        id: "limited-high-ceiling",
        issuedAt: "2026-01-04T00:00:00.000Z",
        lifetimeSupplyCeiling: 100,
        mintNumber: 1,
        rarity: "legendary",
      },
      {
        id: "limited-low-ceiling-late-mint",
        issuedAt: "2026-01-02T00:00:00.000Z",
        lifetimeSupplyCeiling: 10,
        mintNumber: 8,
        rarity: "legendary",
      },
      {
        id: "limited-low-ceiling-late-time",
        issuedAt: "2026-01-03T00:00:00.000Z",
        lifetimeSupplyCeiling: 10,
        mintNumber: 2,
        rarity: "legendary",
      },
      {
        id: "limited-low-ceiling-early-time",
        issuedAt: "2026-01-01T00:00:00.000Z",
        lifetimeSupplyCeiling: 10,
        mintNumber: 2,
        rarity: "legendary",
      },
      {
        id: "rare-limited",
        issuedAt: "2026-01-01T00:00:00.000Z",
        lifetimeSupplyCeiling: 1,
        mintNumber: 1,
        rarity: "rare",
      },
    ]);

    expect(ranked.map(({ id }) => id)).toEqual([
      "limited-low-ceiling-early-time",
      "limited-low-ceiling-late-time",
      "limited-low-ceiling-late-mint",
      "limited-high-ceiling",
      "unlimited",
      "rare-limited",
    ]);
  });

  it("sorts packs newest first with an ID tie-breaker", () => {
    expect(
      sortUnopenedPacksByNewest([
        { id: "pack-a", issuedAt: "2026-08-16T00:00:00.000Z" },
        { id: "pack-c", issuedAt: "2026-08-16T00:00:00.000Z" },
        { id: "pack-b", issuedAt: "2026-08-15T00:00:00.000Z" },
      ]).map(({ id }) => id)
    ).toEqual(["pack-c", "pack-a", "pack-b"]);
  });
});

describe("request-bound collectible showcase resolution", () => {
  it("retains exact selections through ownership loss and makes them effective again", async () => {
    const db = createReadDb([CARD_ROW]);
    const configuration = configurationFor("card", {
      cardInstanceIds: ["card-1"],
      filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
    });

    await expect(
      resolvePublicCollectibleShowcases(db as never, "user-1", configuration)
    ).resolves.toMatchObject([{ type: "card", cards: [{ id: "card-1" }] }]);

    db.selectQuery.limit.mockResolvedValue([]);
    await expect(
      resolvePublicCollectibleShowcases(db as never, "user-1", configuration)
    ).resolves.toEqual([]);
    expect(
      configuration.showcases.find(({ type }) => type === "card")?.payload
    ).toEqual({
      cardInstanceIds: ["card-1"],
      filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
    });

    db.selectQuery.limit.mockResolvedValue([CARD_ROW]);
    await expect(
      resolvePublicCollectibleShowcases(db as never, "user-1", configuration)
    ).resolves.toMatchObject([{ type: "card", cards: [{ id: "card-1" }] }]);
  });

  it("keeps sale links explicit while omitting private custody", async () => {
    const saleResolver = vi.fn().mockResolvedValue(
      new Map([
        [
          "card-1",
          {
            isBundle: true,
            listingId: "listing-1",
            listingUrl: "/black-market/listing-1",
          },
        ],
      ])
    );
    const db = createReadDb([CARD_ROW]);
    const configuration = configurationFor("card", {
      cardInstanceIds: ["card-1"],
      filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
    });

    const [showcase] = await resolvePublicCollectibleShowcases(
      db as never,
      "user-1",
      configuration,
      { resolveActiveSales: saleResolver }
    );
    expect(showcase).toMatchObject({
      cards: [
        {
          forSale: true,
          listingIsBundle: true,
          listingId: "listing-1",
          listingUrl: "/black-market/listing-1",
        },
      ],
    });

    db.selectQuery.limit.mockResolvedValue([CARD_ROW]);
    await expect(
      resolvePublicCollectibleShowcases(db as never, "user-1", configuration, {
        resolveActiveCustody: () => new Set(["card-1"]),
        resolveActiveSales: saleResolver,
      })
    ).resolves.toEqual([]);
    expect(saleResolver).toHaveBeenCalledTimes(1);
  });

  it("keeps an active market asset visible beside private custody and removes terminal sale links", async () => {
    const tradeCard = { ...CARD_ROW, id: "trade-card" };
    const saleResolver = vi.fn().mockResolvedValue(
      new Map([
        [
          "card-1",
          {
            isBundle: true,
            listingId: "listing-active",
            listingUrl: "/black-market/listing-active",
          },
        ],
      ])
    );
    const custodyResolver = vi.fn().mockResolvedValue(new Set(["trade-card"]));
    const db = createReadDb([CARD_ROW, tradeCard]);
    const configuration = configurationFor("card", {
      cardInstanceIds: ["card-1", "trade-card"],
      filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
    });

    const [activeShowcase] = await resolvePublicCollectibleShowcases(
      db as never,
      "user-1",
      configuration,
      {
        resolveActiveCustody: custodyResolver,
        resolveActiveSales: saleResolver,
      }
    );
    expect(activeShowcase).toMatchObject({
      cards: [
        {
          forSale: true,
          id: "card-1",
          listingId: "listing-active",
        },
      ],
    });
    const activeCards =
      activeShowcase && "cards" in activeShowcase ? activeShowcase.cards : [];
    expect(activeCards).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "trade-card" })])
    );

    saleResolver.mockResolvedValueOnce(new Map());
    const [terminalShowcase] = await resolvePublicCollectibleShowcases(
      db as never,
      "user-1",
      configuration,
      {
        resolveActiveCustody: custodyResolver,
        resolveActiveSales: saleResolver,
      }
    );
    expect(terminalShowcase).toMatchObject({
      cards: [{ forSale: false, id: "card-1" }],
    });
    const terminalCards =
      terminalShowcase && "cards" in terminalShowcase
        ? terminalShowcase.cards
        : [];
    expect(terminalCards).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "trade-card" })])
    );
  });

  it("derives unopened packs from owned newest rows and omits pack identity", async () => {
    const db = createReadDb(PACK_ROWS);
    const configuration = configurationFor("unopened-pack", {
      packTemplateId: "pack-template-1",
    });

    const [showcase] = await resolvePublicCollectibleShowcases(
      db as never,
      "user-1",
      configuration
    );
    expect(showcase).toMatchObject({
      packs: [
        { revision: 2, templateId: "pack-template-1" },
        { revision: 1, templateId: "pack-template-1" },
      ],
      type: "unopened-pack",
    });
    expect(
      showcase && "packs" in showcase && showcase.packs[0]
    ).not.toHaveProperty("id");
  });
});
