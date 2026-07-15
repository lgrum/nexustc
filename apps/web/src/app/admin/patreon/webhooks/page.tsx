import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { WebhooksClient } from "./webhooks-client";

export const metadata: Metadata = {
  title: "NeXusTC - Webhooks de Patreon",
};

export default async function PatreonWebhooksPage() {
  const initialData = await orpcClient.patreon.admin.listWebhookRequests({
    limit: 50,
    offset: 0,
  });

  return <WebhooksClient initialData={initialData} />;
}
