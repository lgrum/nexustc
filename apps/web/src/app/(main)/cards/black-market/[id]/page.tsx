import type { Metadata } from "next";

import BlackMarketDetailClient from "./black-market-detail-client";

export const metadata: Metadata = {
  title: "Detalle de publicación | Mercado Negro | NeXusTC",
};

export default async function BlackMarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BlackMarketDetailClient listingId={id} />;
}
