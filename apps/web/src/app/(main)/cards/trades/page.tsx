import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TradesClient from "./trades-client";

export const metadata: Metadata = {
  description: "Crea ofertas privadas de intercambio de cartas y Packs.",
  title: "Intercambios | NeXusTC",
};

export default async function TradesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <TradesClient />;
}
