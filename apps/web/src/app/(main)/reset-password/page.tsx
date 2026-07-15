import type { Metadata } from "next";

import { ResetPasswordClient } from "./reset-password-client";

export const metadata: Metadata = {
  title: "NeXusTC - Restablecer Contrasena",
};

export default function Page() {
  return <ResetPasswordClient />;
}
