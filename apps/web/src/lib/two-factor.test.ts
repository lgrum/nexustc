import { describe, expect, it } from "vitest";

import {
  canUseBackupCode,
  getInitialTwoFactorMethod,
  getTotpSecret,
  getTwoFactorMethods,
} from "./two-factor";
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

  it("only offers backup codes for authenticator-enabled challenges", () => {
    expect(canUseBackupCode(["otp"])).toBe(false);
    expect(canUseBackupCode(["totp", "otp"])).toBe(true);
    expect(canUseBackupCode(["backup"])).toBe(true);
  });

  it("extracts a manual setup key only from an otpauth URI", () => {
    expect(
      getTotpSecret("otpauth://totp/NeXusTC:user?secret=ABC123&issuer=NeXusTC")
    ).toBe("ABC123");
    expect(getTotpSecret("https://example.com/?secret=ABC123")).toBeUndefined();
  });

  it("keeps concurrent pending challenges isolated by scope", () => {
    beginTwoFactorRedirect("dialog-a");
    beginTwoFactorRedirect("dialog-b");
    expect(isTwoFactorRedirectActive("dialog-a")).toBe(true);
    expect(isTwoFactorRedirectActive("dialog-b")).toBe(true);
    setPendingTwoFactorMethods("dialog-a", ["totp", "otp"]);
    setPendingTwoFactorMethods("dialog-b", ["otp"]);
    expect(getPendingTwoFactorMethods("dialog-a")).toEqual(["totp", "otp"]);
    expect(getPendingTwoFactorMethods("dialog-b")).toEqual(["otp"]);
    clearPendingTwoFactorMethods("dialog-a");
    expect(isTwoFactorRedirectActive("dialog-a")).toBe(false);
    expect(isTwoFactorRedirectActive("dialog-b")).toBe(true);
    expect(getPendingTwoFactorMethods("dialog-a")).toBeUndefined();
    clearPendingTwoFactorMethods("dialog-b");
  });
});
