import { describe, expect, it } from "vitest";

import {
  cardShowcasePayloadSchema,
  EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
  PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES,
  PROFILE_SHOWCASE_TYPE_KEYS,
  rareCardShowcasePayloadSchema,
  unopenedPackShowcasePayloadSchema,
} from "./profile-customization";

describe("collectible Profile Showcase contracts", () => {
  it("keeps the code-owned type order and bounded capacities stable", () => {
    expect(PROFILE_SHOWCASE_TYPE_KEYS).toEqual([
      "library",
      "reviews",
      "favorite-games",
      "xp",
      "streak",
      "eteris",
      "card",
      "rare-card",
      "unopened-pack",
    ]);
    expect(PROFILE_COLLECTIBLE_SHOWCASE_CAPACITIES).toEqual({
      card: 12,
      "rare-card": 12,
      "unopened-pack": 12,
    });
  });

  it("stores exact manual Card Instance IDs without allowing duplicates", () => {
    expect(
      cardShowcasePayloadSchema.parse({
        cardInstanceIds: ["card-1", "card-2"],
        filters: {
          ...EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
          game: "Metroid",
        },
      })
    ).toEqual({
      cardInstanceIds: ["card-1", "card-2"],
      filters: {
        edition: null,
        game: "Metroid",
        seriesId: null,
      },
    });
    expect(() =>
      cardShowcasePayloadSchema.parse({
        cardInstanceIds: ["card-1", "card-1"],
        filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
      })
    ).toThrow();
    expect(() =>
      cardShowcasePayloadSchema.parse({
        cardInstanceIds: Array.from(
          { length: 13 },
          (_, index) => `card-${index}`
        ),
        filters: EMPTY_PROFILE_COLLECTIBLE_SHOWCASE_FILTERS,
      })
    ).toThrow();
  });

  it("keeps Rare Card filters and Pack Template filtering versioned and closed", () => {
    expect(
      rareCardShowcasePayloadSchema.parse({
        filters: {
          edition: "Primera",
          game: null,
          seriesId: "series-1",
        },
      })
    ).toEqual({
      filters: {
        edition: "Primera",
        game: null,
        seriesId: "series-1",
      },
    });
    expect(
      unopenedPackShowcasePayloadSchema.parse({ packTemplateId: "pack-1" })
    ).toEqual({ packTemplateId: "pack-1" });
    expect(() =>
      unopenedPackShowcasePayloadSchema.parse({
        packTemplateId: "pack-1",
        rarity: "rare",
      })
    ).toThrow();
  });
});
