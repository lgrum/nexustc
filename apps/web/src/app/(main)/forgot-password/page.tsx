import type { Metadata } from "next";

import { ForgotPasswordClient } from "./forgot-password-client";

export const metadata: Metadata = {
  title: "NeXusTC - Olvide mi Contrasena",
};

export default function Page() {
  return <ForgotPasswordClient />;
}
