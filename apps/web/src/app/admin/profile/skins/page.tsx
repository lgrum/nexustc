import type { Metadata } from "next";

import { ProfileSkinsAdminPage } from "./profile-skins-admin-page";

export const metadata: Metadata = { title: "NeXusTC - Profile Skins" };

export default function Page() {
  return <ProfileSkinsAdminPage />;
}
