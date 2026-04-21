import {
  getProfileEntitlementsForTier,
  validateProfileMediaUpload,
} from "./profile";
import type { ProfileEntitlements } from "./profile";

const unrestrictedEntitlements: ProfileEntitlements = {
  animatedAvatarRequiredTier: "level3",
  animatedBannerRequiredTier: "level8",
  canUseAnimatedAvatar: true,
  canUseAnimatedBanner: true,
  canUseUploadedBanner: true,
  overrideSource: "staff",
  uploadedBannerRequiredTier: "level5",
};

describe(validateProfileMediaUpload, () => {
  it("rejects uploads when the server-measured size exceeds the slot limit", () => {
    expect(() =>
      validateProfileMediaUpload({
        contentType: "image/webp",
        entitlements: unrestrictedEntitlements,
        slot: "avatar",
        validation: {
          durationMs: null,
          fileSizeBytes: 1024 * 512 + 1,
          height: 256,
          isAnimated: false,
          width: 256,
        },
      })
    ).toThrow("FILE_TOO_LARGE");
  });

  it("allows uploads that stay within the server-measured size limit", () => {
    expect(() =>
      validateProfileMediaUpload({
        contentType: "image/webp",
        entitlements: unrestrictedEntitlements,
        slot: "banner",
        validation: {
          durationMs: null,
          fileSizeBytes: 1024 * 1024,
          height: 240,
          isAnimated: false,
          width: 1200,
        },
      })
    ).not.toThrow();
  });
});

describe(getProfileEntitlementsForTier, () => {
  it("keeps uploaded and animated banner thresholds distinct", () => {
    const level3 = getProfileEntitlementsForTier("level3");
    const level5 = getProfileEntitlementsForTier("level5");
    const level8 = getProfileEntitlementsForTier("level8");

    expect(level3.canUseAnimatedAvatar).toBe(true);
    expect(level3.canUseUploadedBanner).toBe(false);

    expect(level5.canUseUploadedBanner).toBe(true);
    expect(level5.canUseAnimatedBanner).toBe(false);

    expect(level8.canUseUploadedBanner).toBe(true);
    expect(level8.canUseAnimatedBanner).toBe(true);
  });
});
