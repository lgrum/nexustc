import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { QRCode } from "./qr-code";

it("renders QR modules for an authenticator URI", () => {
  render(
    <QRCode
      size={200}
      value="otpauth://totp/NeXusTC:user?secret=ABC123&issuer=NeXusTC"
    />
  );

  const qrCode = screen.getByLabelText(/QR code for otpauth:/);
  expect(qrCode.getAttribute("viewBox")).toBe("0 0 200 200");
  expect(qrCode.querySelectorAll("circle").length).toBeGreaterThan(0);
});
