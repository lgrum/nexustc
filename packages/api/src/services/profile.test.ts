import { describe, expect, it } from "vitest";
import {
  type ProfileEntitlements,
  validateProfileMediaUpload,
} from "./profile";

const unrestrictedEntitlements: ProfileEntitlements = {
  canUseAnimatedAvatar: true,
  canUseUploadedBanner: true,
  canUseAnimatedBanner: true,
  animatedAvatarRequiredTier: "level3",
  uploadedBannerRequiredTier: "level5",
  animatedBannerRequiredTier: "level8",
  overrideSource: "staff",
};

describe("validateProfileMediaUpload", () => {
  it("rejects uploads when the server-measured size exceeds the slot limit", () => {
    expect(() =>
      validateProfileMediaUpload({
        slot: "avatar",
        contentType: "image/webp",
        validation: {
          width: 256,
          height: 256,
          durationMs: null,
          isAnimated: false,
          fileSizeBytes: 1024 * 512 + 1,
        },
        entitlements: unrestrictedEntitlements,
      })
    ).toThrowError("FILE_TOO_LARGE");
  });

  it("allows uploads that stay within the server-measured size limit", () => {
    expect(() =>
      validateProfileMediaUpload({
        slot: "banner",
        contentType: "image/webp",
        validation: {
          width: 1200,
          height: 240,
          durationMs: null,
          isAnimated: false,
          fileSizeBytes: 1024 * 1024,
        },
        entitlements: unrestrictedEntitlements,
      })
    ).not.toThrow();
  });
});
