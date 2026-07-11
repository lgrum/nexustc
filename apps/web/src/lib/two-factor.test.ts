import { describe, expect, it } from "vitest";

import { getInitialTwoFactorMethod, getTwoFactorMethods } from "./two-factor";
import {
  beginTwoFactorRedirect,
  clearPendingTwoFactorMethods,
  getPendingTwoFactorMethods,
  isTwoFactorRedirectActive,
  setPendingTwoFactorMethods,
} from "./two-factor-redirect";

describe("getInitialTwoFactorMethod", () => {
  it("prefers TOTP and falls back to email OTP", () => {
    expect(getInitialTwoFactorMethod(["otp", "totp"])).toBe("totp");
    expect(getInitialTwoFactorMethod(["otp"])).toBe("otp");
  });

  it("reads the Better Auth challenge response safely", () => {
    expect(
      getTwoFactorMethods({
        twoFactorMethods: ["totp", "otp"],
        twoFactorRedirect: true,
      })
    ).toEqual(["totp", "otp"]);
    expect(getTwoFactorMethods({ twoFactorRedirect: false })).toBeUndefined();
  });

  it("keeps a pending challenge across component remounts", () => {
    beginTwoFactorRedirect("dialog-a");
    expect(isTwoFactorRedirectActive("dialog-a")).toBe(true);
    expect(isTwoFactorRedirectActive("dialog-b")).toBe(false);
    setPendingTwoFactorMethods(["totp", "otp"]);
    expect(getPendingTwoFactorMethods("dialog-a")).toEqual(["totp", "otp"]);
    expect(getPendingTwoFactorMethods("dialog-b")).toBeUndefined();
    clearPendingTwoFactorMethods("dialog-a");
    expect(isTwoFactorRedirectActive("dialog-a")).toBe(false);
    expect(getPendingTwoFactorMethods("dialog-a")).toBeUndefined();
  });
});
