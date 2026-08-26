import type { Metadata } from "next";

import BlackMarketClient from "./black-market-client";

export const metadata: Metadata = {
  description:
    "Compra y publica lotes fijos de cartas y Packs transferibles en el Mercado Negro.",
  title: "Mercado Negro | NeXusTC",
};

export default function BlackMarketPage() {
  return <BlackMarketClient />;
}
