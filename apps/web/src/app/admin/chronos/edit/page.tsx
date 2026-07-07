import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

export default async function Page() {
  const data = await orpcClient.chronos.getForEdit();
  const initialData = {
    carouselImageKeys: data.carouselImageKeys ?? [],
    headerImageKey: data.headerImageKey,
    markdownContent: data.markdownContent,
    markdownImageKeys: data.markdownImageKeys ?? [],
    stickyImageKey: data.stickyImageKey,
  };

  return <ClientPage initialData={initialData} />;
}
