import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  const { id } = await params;
  return <GiftDetailClient giftId={id} />;
}
