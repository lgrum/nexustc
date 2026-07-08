import { createSafeClient } from "@orpc/client";

import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";
import type { FeaturedSelection, LoaderError } from "./client-page";

export default async function Page() {
  const safeOrpcClient = createSafeClient(orpcClient);
  const [error, featuredPosts, isDefined] =
    await safeOrpcClient.post.admin.getFeaturedPosts();

  let loaderError: LoaderError = null;
  let initialSelection: FeaturedSelection = {
    mainPostId: null,
    mainThumbnailMediaId: null,
    secondaryPostIds: [null, null],
    secondaryThumbnailMediaIds: [null, null],
  };

  if (isDefined) {
    loaderError = {
      code: error.code,
      message: error.message,
      name: error.name,
    };
  } else if (error) {
    throw error;
  } else {
    const main = featuredPosts.find((post) => post.position === "main");
    const secondary = featuredPosts
      .filter((post) => post.position === "secondary")
      .toSorted((a, b) => a.order - b.order);

    initialSelection = {
      mainPostId: main?.postId ?? null,
      mainThumbnailMediaId: main?.thumbnailMediaId ?? null,
      secondaryPostIds: [
        secondary[0]?.postId ?? null,
        secondary[1]?.postId ?? null,
      ],
      secondaryThumbnailMediaIds: [
        secondary[0]?.thumbnailMediaId ?? null,
        secondary[1]?.thumbnailMediaId ?? null,
      ],
    };
  }

  return (
    <ClientPage initialSelection={initialSelection} loaderError={loaderError} />
  );
}
