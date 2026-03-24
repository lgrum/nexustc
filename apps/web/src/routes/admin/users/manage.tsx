import { createFileRoute } from "@tanstack/react-router";

import { UserManagePage } from "@/components/admin/users/manage-page";
import { ownerMiddleware } from "@/middleware/owner";

export const Route = createFileRoute("/admin/users/manage")({
  component: UserManagePage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Gestionar Usuarios",
      },
    ],
  }),
  server: {
    middleware: [ownerMiddleware],
  },
});
