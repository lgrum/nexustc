import type { Metadata } from "next";

import TradeListClient from "../trade-list-client";

export const metadata: Metadata = {
  description: "Ofertas de intercambio que recibiste.",
  title: "Intercambios recibidos | NeXusTC",
};

export default function TradeInboxPage() {
  return <TradeListClient mode="inbox" />;
}
