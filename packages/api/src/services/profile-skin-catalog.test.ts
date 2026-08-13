import { PROFILE_DEFAULT_SKIN_TOKENS } from "@repo/shared/profile-customization";

import {
  getProfileSkinContrast,
  ProfileSkinCatalogError,
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
});
