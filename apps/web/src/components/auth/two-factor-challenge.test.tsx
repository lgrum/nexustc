import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TwoFactorChallenge } from "./two-factor-challenge";

const { sendOtp } = vi.hoisted(() => ({
  sendOtp: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      sendOtp,
    },
  },
  getAuthErrorMessage: vi.fn(),
}));

describe("TwoFactorChallenge", () => {
  beforeEach(() => {
    sendOtp.mockReset();
    sendOtp.mockResolvedValue({ data: { status: true }, error: null });
  });

  it("only sends an email OTP after an explicit user action", async () => {
    render(
      <TwoFactorChallenge
        methods={["otp"]}
        onCancel={vi.fn()}
        onVerified={vi.fn()}
      />
    );

    expect(sendOtp).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Usar código de respaldo" })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar código por email" })
    );

    await waitFor(() => expect(sendOtp).toHaveBeenCalledOnce());
  });

  it("keeps the send action available when email delivery fails", async () => {
    sendOtp.mockResolvedValueOnce({
      data: null,
      error: {
        code: "TWO_FACTOR_OTP_DELIVERY_FAILED",
        message: "No se pudo enviar el código. Inténtalo nuevamente.",
      },
    });

    render(
      <TwoFactorChallenge
        methods={["otp"]}
        onCancel={vi.fn()}
        onVerified={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar código por email" })
    );

    expect(
      await screen.findByText(
        "No se pudo enviar el código. Inténtalo nuevamente."
      )
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Enviar código por email" })
        .hasAttribute("disabled")
    ).toBe(false);
  });
});
