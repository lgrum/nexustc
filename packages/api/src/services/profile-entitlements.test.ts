import { resolveCurrentProfileDefaults } from "./profile-customization-manifest";
import {
  resolveEffectiveProfileConfiguration,
  resolveProfileEntitlements,
} from "./profile-entitlements";

const items = [
  {
    id: "free",
    isFree: true,
    lifecycle: "active" as const,
    requiredTier: null,
  },
  {
    id: "vip-5",
    isFree: false,
    lifecycle: "active" as const,
    requiredTier: "level5" as const,
  },
  {
    id: "eteris-only",
    isFree: false,
    lifecycle: "active" as const,
    requiredTier: null,
  },
  {
    id: "archived-vip",
    isFree: false,
    lifecycle: "archived" as const,
    requiredTier: "level1" as const,
  },
  {
    id: "disabled",
    isFree: true,
    lifecycle: "disabled" as const,
    requiredTier: null,
  },
];

describe(resolveProfileEntitlements, () => {
  it.each([
    ["user", "none", false, ["free"]],
    ["user", "level1", true, ["free", "archived-vip"]],
    ["user", "level5", true, ["free", "vip-5", "archived-vip"]],
    ["admin", "none", false, ["free", "vip-5", "archived-vip"]],
    ["moderator", "none", false, ["free", "vip-5", "archived-vip"]],
    ["owner", "none", false, ["free", "vip-5", "eteris-only", "archived-vip"]],
  ] as const)(
    "resolves %s at %s with active membership %s",
    (role, tier, isActivePatron, expected) => {
      const result = resolveProfileEntitlements({
        isActivePatron,
        items,
        ownedItemIds: [],
        role,
        tier,
      });

      expect(
        items
          .filter((item) => result.items[item.id]?.entitled)
          .map(({ id }) => id)
      ).toEqual(expected);
    }
  );

  it("grants Eteris-only access only through permanent ownership", () => {
    const result = resolveProfileEntitlements({
      isActivePatron: false,
      items,
      ownedItemIds: ["eteris-only"],
      role: "admin",
      tier: "level12",
    });

    expect(result.items["eteris-only"]).toEqual({
      entitled: true,
      selectable: true,
    });
  });

  it("keeps archived entitlements renderable but not newly selectable", () => {
    const result = resolveProfileEntitlements({
      isActivePatron: true,
      items,
      ownedItemIds: [],
      role: "user",
      tier: "level1",
    });

    expect(result.items["archived-vip"]).toEqual({
      entitled: true,
      selectable: false,
    });
    expect(result.items.disabled).toEqual({
      entitled: false,
      selectable: false,
    });
  });
});

describe(resolveEffectiveProfileConfiguration, () => {
  it("falls back visual roots and omits optional locked selections without mutating the saved draft", () => {
    const saved = {
      ...resolveCurrentProfileDefaults(),
      decorations: {
        "ambient-effect": null,
        "avatar-frame": "vip-frame",
        "nameplate-effect": null,
        "profile-frame": null,
      },
      layoutKey: "spotlight" as const,
      skinKey: "vip-skin",
    };
    const effective = resolveEffectiveProfileConfiguration(saved, {
      decorationEntitlements: { "vip-frame": false },
      layoutEntitlements: { spotlight: false },
      showcaseEntitlements: { reviews: false },
      skinEntitlements: { "vip-skin": false },
    });

    expect(effective.layoutKey).toBe("stack");
    expect(effective.skinKey).toBe("default");
    expect(effective.decorations["avatar-frame"]).toBeNull();
    expect(
      effective.showcases.find(({ type }) => type === "reviews")?.enabled
    ).toBe(false);
    expect(saved.layoutKey).toBe("spotlight");
    expect(saved.decorations["avatar-frame"]).toBe("vip-frame");
  });

  it("restores saved choices when entitlement returns and honors a later replacement", () => {
    const saved = {
      ...resolveCurrentProfileDefaults(),
      layoutKey: "grid" as const,
      skinKey: "replacement",
    };
    const effective = resolveEffectiveProfileConfiguration(saved, {
      decorationEntitlements: {},
      layoutEntitlements: { grid: true },
      showcaseEntitlements: {},
      skinEntitlements: { replacement: true },
    });

    expect(effective.layoutKey).toBe("grid");
    expect(effective.skinKey).toBe("replacement");
  });
});
