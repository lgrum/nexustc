import { createFileRoute } from "@tanstack/react-router";

import { ProfileRolesAdminPage } from "@/components/admin/profile-admin-page";
import { ownerMiddleware } from "@/middleware/owner";

export const Route = createFileRoute("/admin/profile/roles")({
  component: ProfileRolesAdminPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Profile Roles Admin",
      },
    ],
  }),
  server: {
    middleware: [ownerMiddleware],
  },
});
