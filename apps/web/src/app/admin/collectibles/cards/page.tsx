import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { CardsAdminPage } from "./cards-admin-page";

export const metadata: Metadata = {
  title: "NeXusTC - Cartas coleccionables",
};

export default async function Page() {
  const [characters, series, templates] = await Promise.all([
    orpcClient.collectiblesAdmin.characters.list(),
    orpcClient.collectiblesAdmin.series.list(),
    orpcClient.collectiblesAdmin.templates.list(),
  ]);

  return <CardsAdminPage initialData={{ characters, series, templates }} />;
}
