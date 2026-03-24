import { createFileRoute, notFound } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";

import { ComicPage } from "@/components/posts/comic-page";
import { PostPage } from "@/components/posts/post-components";
import { safeOrpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

const comicPageSchema = z.object({
  page: z.number().optional(),
});

export const Route = createFileRoute("/_main/post/$id")({
  component: RouteComponent,
  staleTime: 1000 * 60 * 5, // 5 minutes
  loader: async ({ params }) => {
    const [error, data, isDefined] = await safeOrpcClient.post.getPostById(
      params.id
    );

    if (isDefined) {
      if (error.code === "NOT_FOUND") {
        throw notFound();
      }

      if (error.code === "RATE_LIMITED") {
        throw new Error("RATE_LIMITED", { cause: error.data.retryAfter });
      }
    }

    if (error) {
      console.error(error);
      throw error;
    }

    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        media: loaderData?.imageObjectKeys?.[0]
          ? getBucketUrl(loaderData?.imageObjectKeys?.[0])
          : undefined,
        title: `NeXusTC - ${loaderData ? loaderData.title : "Post"}`,
      },
    ],
  }),
  validateSearch: zodValidator(comicPageSchema),
});

function RouteComponent() {
  const post = Route.useLoaderData();

  return (
    <main className="w-full">
      <div className="flex flex-col gap-12">
        {/* Main Post Content */}
        {post.type === "post" ? (
          <PostPage post={post} />
        ) : (
          <ComicPage comic={post} />
        )}
      </div>
    </main>
  );
}
