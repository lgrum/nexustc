import { orpcClient } from "@/lib/orpc";

import { EconomyClient } from "./economy-client";

export default async function EconomyPage() {
  const initialReport = await orpcClient.eteris.admin.report();
  return <EconomyClient initialReport={initialReport} />;
}
