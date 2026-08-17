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

describe("collectible permissions", () => {
  const collectiblePermissions = [
    ["cards", ["view", "manage", "publish", "freeze", "grant"]],
    ["packs", ["view", "manage", "publish"]],
    ["gacha", ["view", "manage", "activate"]],
    ["cardShop", ["view", "manage"]],
    ["marketplace", ["view", "moderate"]],
    ["trades", ["view", "moderate"]],
    ["collectibles", ["audit", "correct"]],
  ] as const;

  it("gives the owner every collectible capability", () => {
    for (const [domain, actions] of collectiblePermissions) {
      expect(
        roles.owner.authorize({ [domain]: actions } as never).success
      ).toBe(true);
    }
  });

  it("does not implicitly grant collectible capabilities to admin or moderator", () => {
    for (const role of [roles.admin, roles.moderator]) {
      for (const [domain, actions] of collectiblePermissions) {
        expect(role.authorize({ [domain]: actions } as never).success).toBe(
          false
        );
      }
    }
  });
});
