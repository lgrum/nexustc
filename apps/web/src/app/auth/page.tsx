import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthClient } from "./auth-client";

export const metadata: Metadata = {
  title: "NeXusTC - Autenticacion",
};

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/profile");
  }

  return <AuthClient />;
}
