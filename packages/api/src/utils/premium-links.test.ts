import {
  canAccessPremiumLinks,
  getRequiredTierLabel,
} from "@repo/shared/constants";
import { describe, expect, it } from "vitest";

describe("premium links access helpers", () => {
  it("keeps the automatic status-based access by default", () => {
    expect(
      canAccessPremiumLinks({ role: "user", tier: "level1" }, "Finalizado")
    ).toBe(true);
    expect(
      canAccessPremiumLinks({ role: "user", tier: "level1" }, "En Progreso")
    ).toBe(false);
    expect(getRequiredTierLabel("level1", "En Progreso")).toBe("LvL 3");
  });

  it("uses manual VIP level overrides instead of post status", () => {
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level1" },
        "En Progreso",
        "level1"
      )
    ).toBe(true);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level1" },
        "Finalizado",
        "level3"
      )
    ).toBe(false);
    expect(getRequiredTierLabel("level1", "Finalizado", "level3")).toBe(
      "LvL 3"
    );
  });
});
