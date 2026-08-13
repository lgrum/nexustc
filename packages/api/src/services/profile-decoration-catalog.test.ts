import {
  ProfileDecorationCatalogError,
  validateProfileDecorationVisual,
} from "./profile-decoration-catalog";

describe("Profile Decoration publication validation", () => {
  it.each([
    "avatar-frame",
    "nameplate-effect",
    "profile-frame",
    "ambient-effect",
  ] as const)("accepts exactly one registered %s slot", (slot) => {
    expect(
      validateProfileDecorationVisual({
        effectKey: "shimmer",
        fontKey: slot === "nameplate-effect" ? "lexend" : null,
        mediaAssetKey: null,
        reducedMotion: null,
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
        mediaAssetKey: null,
        reducedMotion: null,
        slot: "ambient-effect",
      })
    ).toThrow("apariencia");
    expect(
      validateProfileDecorationVisual({
        effectKey: "orbit-sparkles",
        fontKey: null,
        mediaAssetKey: null,
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
});
