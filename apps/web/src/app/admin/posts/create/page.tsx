import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

export default async function Page() {
  const prerequisites = await orpcClient.post.admin.createPostPrerequisites();

  return <ClientPage prerequisites={prerequisites} />;
}
