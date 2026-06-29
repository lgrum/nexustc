import type { Metadata } from "next";

import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "NeXusTC - Perfil",
};

export default function Page() {
  return <ProfileClient />;
}
