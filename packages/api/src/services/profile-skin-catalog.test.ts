import { PROFILE_DEFAULT_SKIN_TOKENS } from "@repo/shared/profile-customization";

import {
  getProfileSkinContrast,
  ProfileSkinCatalogError,
  profileSkinDraftSchema,
  validateProfileSkinTokens,
} from "./profile-skin-catalog";

describe("Profile Skin publication validation", () => {
  it("accepts the protected default semantic treatment", () => {
    expect(validateProfileSkinTokens(PROFILE_DEFAULT_SKIN_TOKENS)).toEqual(
      PROFILE_DEFAULT_SKIN_TOKENS
    );
    expect(getProfileSkinContrast("#fafafa", "#09090b")).toBeGreaterThan(4.5);
  });

  it("rejects raw capabilities and malformed gradients at the publication seam", () => {
    expect(() =>
      validateProfileSkinTokens({
        ...PROFILE_DEFAULT_SKIN_TOKENS,
        css: "body { display: none }",
      })
    ).toThrow(ProfileSkinCatalogError);

    expect(() =>
      validateProfileSkinTokens({
        ...PROFILE_DEFAULT_SKIN_TOKENS,
        background: {
          angle: 45,
          kind: "gradient",
          stops: [
            { color: "#09090b", position: 80 },
            { color: "#18181b", position: 20 },
          ],
        },
      })
    ).toThrow("tokens");
  });

  it("rejects treatments that obscure text or keyboard focus", () => {
    expect(() =>
      validateProfileSkinTokens({
        ...PROFILE_DEFAULT_SKIN_TOKENS,
        foreground: "#18181b",
      })
    ).toThrow("contraste");

    expect(() =>
      validateProfileSkinTokens({
        ...PROFILE_DEFAULT_SKIN_TOKENS,
        focus: "#18181b",
      })
    ).toThrow("foco");
  });

  it("rejects zero-valued Eteris prices", () => {
    expect(
      profileSkinDraftSchema.safeParse({
        backgroundAssetId: null,
        catalogOrder: 1,
        description: "",
        eterisPrice: 0n,
        isFree: false,
        name: "Paid skin",
        requiredTier: null,
        stableKey: "paid-skin",
        tokens: PROFILE_DEFAULT_SKIN_TOKENS,
      }).success
    ).toBe(false);
  });

  it("rejects a purchase price on a free Skin", () => {
    expect(
      profileSkinDraftSchema.safeParse({
        backgroundAssetId: null,
        catalogOrder: 1,
        description: "",
        eterisPrice: 75n,
        isFree: true,
        name: "Free skin",
        requiredTier: null,
        stableKey: "free-skin",
        tokens: PROFILE_DEFAULT_SKIN_TOKENS,
      }).success
    ).toBe(false);
  });

  it("requires opaque surfaces when a background image is used", () => {
    expect(
      profileSkinDraftSchema.safeParse({
        backgroundAssetId: "background-1",
        catalogOrder: 1,
        description: "",
        eterisPrice: null,
        isFree: true,
        name: "Image skin",
        requiredTier: null,
        stableKey: "image-skin",
        tokens: PROFILE_DEFAULT_SKIN_TOKENS,
      }).success
    ).toBe(false);
  });
});
