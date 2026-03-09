import { createFileRoute } from "@tanstack/react-router";
import { ProfileAdminPage } from "@/components/admin/profile-admin-page";
import { ownerMiddleware } from "@/middleware/owner";

export const Route = createFileRoute("/admin/profile")({
  component: ProfileAdminPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Profile Admin",
      },
    ],
  }),
  server: {
    middleware: [ownerMiddleware],
  },
});
