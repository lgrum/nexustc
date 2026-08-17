import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { GachaponAdminPage } from "./gachapon-admin-page";

export const metadata: Metadata = {
  title: "NeXusTC - Máquinas Gachapon",
};

export default async function Page() {
  const machines = await orpcClient.collectiblesAdmin.gacha.list({
    limit: 100,
  });
  return <GachaponAdminPage initialMachines={machines} />;
}
