import {
  ProfileDecorationCatalogError,
  profileDecorationDraftSchema,
  validatePublishedDecorationSlot,
  validateProfileDecorationVisual,
} from "./profile-decoration-catalog";

describe("Profile Decoration publication validation", () => {
  it.each([
    "avatar-frame",
    "nameplate-effect",
    "profile-frame",
    "ambient-effect",
  ] as const)("accepts exactly one registered %s slot", (slot) => {
    const effectKey =
      slot === "avatar-frame" || slot === "profile-frame"
        ? "soft-pulse"
        : "shimmer";
    expect(
      validateProfileDecorationVisual({
        effectKey,
        fontKey: slot === "nameplate-effect" ? "lexend" : null,
        mediaAssetKey: slot === "ambient-effect" ? "asset-key" : null,
        reducedMotion: effectKey === "shimmer" ? null : { behavior: "static" },
        slot,
      }).slot
    ).toBe(slot);
  });

  it("rejects raw capabilities and unregistered effects or fonts", () => {
    expect(() =>
      validateProfileDecorationVisual({
        css: "body { display: none }",
        effectKey: "shimmer",
        fontKey: null,
        mediaAssetKey: null,
        reducedMotion: null,
        slot: "profile-frame",
      })
    ).toThrow(ProfileDecorationCatalogError);
    expect(() =>
      validateProfileDecorationVisual({
        effectKey: "execute-script",
        fontKey: "remote-font",
        mediaAssetKey: "https://example.com/a.png",
        reducedMotion: null,
        slot: "nameplate-effect",
      })
    ).toThrow(ProfileDecorationCatalogError);
  });

  it("requires reduced-motion behavior for animated effects", () => {
    expect(() =>
      validateProfileDecorationVisual({
        effectKey: "soft-pulse",
        fontKey: null,
        mediaAssetKey: "asset-key",
        reducedMotion: null,
        slot: "ambient-effect",
      })
    ).toThrow("apariencia");
    expect(
      validateProfileDecorationVisual({
        effectKey: "orbit-sparkles",
        fontKey: null,
        mediaAssetKey: "asset-key",
        reducedMotion: { behavior: "omit" },
        slot: "ambient-effect",
      }).reducedMotion
    ).toEqual({ behavior: "omit" });
  });

  it("keeps approved fonts in the nameplate slot", () => {
    expect(() =>
      validateProfileDecorationVisual({
        effectKey: null,
        fontKey: "lexend",
        mediaAssetKey: null,
        reducedMotion: null,
        slot: "profile-frame",
      })
    ).toThrow("apariencia");
  });

  it("rejects effects that the selected slot does not render", () => {
    expect(() =>
      validateProfileDecorationVisual({
        effectKey: "shimmer",
        fontKey: null,
        mediaAssetKey: null,
        reducedMotion: null,
        slot: "avatar-frame",
      })
    ).toThrow(ProfileDecorationCatalogError);
  });

  it("rejects decorations without a renderable visual", () => {
    expect(() =>
      validateProfileDecorationVisual({
        effectKey: null,
        fontKey: null,
        mediaAssetKey: null,
        reducedMotion: null,
        slot: "ambient-effect",
      })
    ).toThrow(ProfileDecorationCatalogError);
  });

  it("rejects zero-valued Eteris prices", () => {
    expect(
      profileDecorationDraftSchema.safeParse({
        catalogOrder: 1,
        description: "",
        effectKey: null,
        eterisPrice: 0n,
        fontKey: null,
        isFree: false,
        mediaAssetId: null,
        name: "Paid decoration",
        reducedMotion: null,
        requiredTier: null,
        slot: "profile-frame",
        stableKey: "paid-decoration",
      }).success
    ).toBe(false);
  });

  it("rejects a purchase price on a free Decoration", () => {
    expect(
      profileDecorationDraftSchema.safeParse({
        catalogOrder: 1,
        description: "",
        effectKey: null,
        eterisPrice: 75n,
        fontKey: null,
        isFree: true,
        mediaAssetId: null,
        name: "Free decoration",
        reducedMotion: null,
        requiredTier: null,
        slot: "profile-frame",
        stableKey: "free-decoration",
      }).success
    ).toBe(false);
  });

  it("keeps a published decoration in its original slot", () => {
    expect(() =>
      validatePublishedDecorationSlot("avatar-frame", "profile-frame")
    ).toThrow("slot");
    expect(() =>
      validatePublishedDecorationSlot("avatar-frame", "avatar-frame")
    ).not.toThrow();
  });
});
