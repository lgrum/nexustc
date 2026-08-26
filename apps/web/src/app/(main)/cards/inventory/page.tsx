import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import InventoryClient from "./inventory-client";

export const metadata: Metadata = {
  description: "Consulta tus cartas y Packs coleccionables privados.",
  title: "Mi inventario | NeXusTC",
};

export default async function CardInventoryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }

  return <InventoryClient />;
}
