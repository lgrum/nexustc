import type { Metadata } from "next";

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
  const { id } = await params;
  return <TradeDetailClient offerId={id} />;
}
