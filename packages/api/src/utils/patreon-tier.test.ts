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

  it.each(["level69", "level100"] as const)(
    "preserves permanent VIP %s during automated syncs",
    (tier) => {
      const result = resolvePermanentPatronTierStatus(
        {
          patronSince: new Date("2026-04-17T12:00:00.000Z"),
          tier,
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
        tier,
      });
    }
  );
});
