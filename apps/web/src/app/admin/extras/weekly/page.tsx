import { createSafeClient } from "@orpc/client";

import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";
import type { LoaderError } from "./client-page";

export default async function Page() {
  const safeOrpcClient = createSafeClient(orpcClient);
  const [error, weeklyPosts, isDefined] =
    await safeOrpcClient.post.admin.getSelectedWeeklyPosts();

  let loaderError: LoaderError = null;
  let initialSelectedIds: string[] = [];

  if (isDefined) {
    loaderError = {
      code: error.code,
      message: error.message,
      name: error.name,
    };
  } else if (error) {
    throw error;
  } else {
    initialSelectedIds = weeklyPosts.map((post) => post.id);
  }

  return (
    <ClientPage
      initialSelectedIds={initialSelectedIds}
      loaderError={loaderError}
    />
  );
}
