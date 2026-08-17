import type { Metadata } from "next";

import GiftDetailClient from "../gift-detail-client";

export const metadata: Metadata = {
  description: "Detalle privado de un regalo de coleccionables.",
  title: "Detalle del regalo | NeXusTC",
};

export default async function GiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GiftDetailClient giftId={id} />;
}
