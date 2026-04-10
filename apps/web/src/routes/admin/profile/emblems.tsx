import { createFileRoute } from "@tanstack/react-router";

import { ProfileEmblemsAdminPage } from "@/components/admin/profile-admin-page";
import { ownerMiddleware } from "@/middleware/owner";

export const Route = createFileRoute("/admin/profile/emblems")({
  component: ProfileEmblemsAdminPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Profile Emblems Admin",
      },
    ],
  }),
  server: {
    middleware: [ownerMiddleware],
  },
});
