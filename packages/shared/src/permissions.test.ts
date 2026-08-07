import { describe, expect, it } from "vitest";

import { roles } from "./permissions";

describe("progression permissions", () => {
  it("reserves arbitrary XP corrections for the owner", () => {
    expect(roles.owner.authorize({ progression: ["adjust"] }).success).toBe(
      true
    );
    expect(roles.admin.authorize({ progression: ["adjust"] }).success).toBe(
      false
    );
    expect(roles.moderator.authorize({ progression: ["adjust"] }).success).toBe(
      false
    );
  });

  it("lets moderator, admin, and owner inspect and decide integrity cases", () => {
    for (const role of [roles.moderator, roles.admin, roles.owner]) {
      expect(
        role.authorize({ progressionIntegrity: ["view", "decide"] }).success
      ).toBe(true);
    }
    expect(
      roles.user.authorize({ progressionIntegrity: ["view"] }).success
    ).toBe(false);
  });
});

describe("economy permissions", () => {
  it("lets admins inspect wallets but reserves adjustments for owners", () => {
    expect(roles.admin.authorize({ economy: ["view"] }).success).toBe(true);
    expect(roles.admin.authorize({ economy: ["adjust"] }).success).toBe(false);
    expect(roles.moderator.authorize({ economy: ["view"] }).success).toBe(
      false
    );
    expect(roles.owner.authorize({ economy: ["adjust"] }).success).toBe(true);
  });
});
