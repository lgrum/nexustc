import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";

import { CardShopClient } from "./shop-client";

export const metadata: Metadata = {
  description:
    "Compra Packs oficiales con Eteris y revisa exactamente qué contenido puede aparecer.",
  title: "Tienda oficial | NeXusTC",
};

async function getOffers() {
  "use cache";
  cacheLife("minutes");
  cacheTag("card-shop");
  return await orpcClient.cardShop.list(undefined, {
    context: { cache: true },
  });
}

export default async function CardShopPage() {
  await connection();
  const offers = await getOffers();
  return <CardShopClient initialOffers={offers} />;
}
