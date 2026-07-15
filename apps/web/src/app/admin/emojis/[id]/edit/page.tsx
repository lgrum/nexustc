import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const emoji = await orpcClient.emoji.admin.getById(id);

  return <ClientPage emoji={emoji} />;
}
