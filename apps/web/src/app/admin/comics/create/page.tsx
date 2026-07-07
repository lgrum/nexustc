import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

export default async function Page() {
  const prerequisites = await orpcClient.comic.admin.createComicPrerequisites();

  return <ClientPage prerequisites={prerequisites} />;
}
