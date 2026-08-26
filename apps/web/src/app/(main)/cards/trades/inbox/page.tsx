import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TradeListClient from "../trade-list-client";

export const metadata: Metadata = {
  description: "Ofertas de intercambio que recibiste.",
  title: "Intercambios recibidos | NeXusTC",
};

export default async function TradeInboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <TradeListClient mode="inbox" />;
}
