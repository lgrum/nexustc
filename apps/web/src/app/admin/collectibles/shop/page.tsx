import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { CardShopAdminPage } from "./shop-admin-page";

export const metadata: Metadata = {
  title: "NeXusTC - Tienda oficial de Packs",
};

export default async function Page() {
  const offers = await orpcClient.collectiblesAdmin.shop.list({ limit: 100 });
  return <CardShopAdminPage initialData={{ offers }} />;
}
