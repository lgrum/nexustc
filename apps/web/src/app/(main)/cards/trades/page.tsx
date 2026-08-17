import type { Metadata } from "next";

import TradesClient from "./trades-client";

export const metadata: Metadata = {
  description: "Crea ofertas privadas de intercambio de cartas y Packs.",
  title: "Intercambios | NeXusTC",
};

export default function TradesPage() {
  return <TradesClient />;
}
