import {
  getHighestPatronTierFromIds,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
import { describe, expect, it } from "vitest";

describe("patreon tier helpers", () => {
  it("uses hierarchy rank when resolving mapped Patreon tiers", () => {
    expect(getHighestPatronTierFromIds(["25899010", "28365176"])).toBe(
      "level100"
    );
  });

  it("preserves permanent VIP level 100 during automated syncs", () => {
    const result = resolvePermanentPatronTierStatus(
      {
        patronSince: new Date("2026-04-17T12:00:00.000Z"),
        tier: "level100",
      },
      {
        isActivePatron: false,
        patronSince: null,
        tier: "none",
      }
    );

    expect(result).toEqual({
      isActivePatron: true,
      patronSince: new Date("2026-04-17T12:00:00.000Z"),
      tier: "level100",
    });
  });
});
