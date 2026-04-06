import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/notifications/")({
  beforeLoad: () => {
    throw redirect({
      replace: true,
      to: "/admin/notifications/announcements",
    });
  },
});
