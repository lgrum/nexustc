import type { Metadata } from "next";

import { ProfileDecorationsAdminPage } from "./profile-decorations-admin-page";

export const metadata: Metadata = { title: "NeXusTC - Profile Decorations" };

export default function Page() {
  return <ProfileDecorationsAdminPage />;
}
