import type { Metadata } from "next";

import TradeListClient from "../trade-list-client";

export const metadata: Metadata = {
  description: "Ofertas de intercambio que enviaste.",
  title: "Intercambios enviados | NeXusTC",
};

export default function TradeSentPage() {
  return <TradeListClient mode="sent" />;
}
