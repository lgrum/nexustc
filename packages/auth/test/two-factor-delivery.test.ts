import { describe, expect, it } from "vitest";

import {
  consumeTwoFactorOtpDeliveryFailure,
  markTwoFactorOtpDeliveryFailed,
} from "../src/two-factor-delivery";

describe("two-factor OTP delivery failures", () => {
  it("isolates failures by request and consumes them once", () => {
    const failedRequest = {};
    const successfulRequest = {};

    markTwoFactorOtpDeliveryFailed(failedRequest);

    expect(consumeTwoFactorOtpDeliveryFailure(successfulRequest)).toBe(false);
    expect(consumeTwoFactorOtpDeliveryFailure(failedRequest)).toBe(true);
    expect(consumeTwoFactorOtpDeliveryFailure(failedRequest)).toBe(false);
  });
});
