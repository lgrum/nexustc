import type { Metadata } from "next";

import MarketAdminClient from "./market-admin-client";

export const metadata: Metadata = {
  title: "Moderación del Mercado Negro | NeXusTC",
};

export default function MarketAdminPage() {
  return <MarketAdminClient />;
}
