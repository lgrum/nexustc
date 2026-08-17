import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { PacksAdminPage } from "./packs-admin-page";

export const metadata: Metadata = {
  title: "NeXusTC - Packs y revisiones",
};

export default async function Page() {
  const templates = await orpcClient.collectiblesAdmin.packs.templates.list();
  return <PacksAdminPage initialData={{ templates }} />;
}
