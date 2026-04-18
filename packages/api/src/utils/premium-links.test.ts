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

  it("allows the selected manual VIP level and every tier above it", () => {
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level5" },
        "Finalizado",
        "level8"
      )
    ).toBe(false);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level8" },
        "Finalizado",
        "level8"
      )
    ).toBe(true);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level12" },
        "Finalizado",
        "level8"
      )
    ).toBe(true);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level69" },
        "Finalizado",
        "level8"
      )
    ).toBe(true);
    expect(getRequiredTierLabel("level5", "Finalizado", "level8")).toBe(
      "LvL 8"
    );
  });

  it("treats VIP level 100 as the highest manual premium tier", () => {
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level69" },
        "Finalizado",
        "level100"
      )
    ).toBe(false);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level100" },
        "Finalizado",
        "level69"
      )
    ).toBe(true);
    expect(
      canAccessPremiumLinks(
        { role: "user", tier: "level100" },
        "Finalizado",
        "level100"
      )
    ).toBe(true);
    expect(getRequiredTierLabel("level69", "Finalizado", "level100")).toBe(
      "LvL 100"
    );
  });
});
