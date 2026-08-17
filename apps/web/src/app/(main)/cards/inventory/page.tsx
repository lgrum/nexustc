import type { Metadata } from "next";

import InventoryClient from "./inventory-client";

export const metadata: Metadata = {
  description: "Consulta tus cartas y Packs coleccionables privados.",
  title: "Mi inventario | NeXusTC",
};

export default function CardInventoryPage() {
  return <InventoryClient />;
}
