import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TradeDetailClient from "../trade-detail-client";

export const metadata: Metadata = {
  description: "Detalle privado de una oferta de intercambio.",
  title: "Detalle del intercambio | NeXusTC",
};

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  const { id } = await params;
  return <TradeDetailClient offerId={id} />;
}
