import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "./admin-shell";

import "@blocknote/shadcn/style.css";

export const metadata: Metadata = {
  title: "NeXusTC - Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth");
  }

  if (session.user.role === "user") {
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
