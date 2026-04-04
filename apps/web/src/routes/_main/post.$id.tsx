import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import z from "zod";

import { ComicPage } from "@/components/posts/comic-page";
import { PostPage } from "@/components/posts/post-components";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
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
        title: loaderData?.earlyAccess.isRestrictedView
          ? "NeXusTC - VIP Early Access"
          : `NeXusTC - ${loaderData ? loaderData.title : "Post"}`,
      },
    ],
  }),
  validateSearch: zodValidator(comicPageSchema),
});

function RouteComponent() {
  const initialPost = Route.useLoaderData();
  const { id } = Route.useParams();
  const { data: post = initialPost, refetch } = useQuery({
    initialData: initialPost,
    queryFn: () => orpcClient.post.getPostById(id),
    queryKey: ["post", id],
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!(post.earlyAccess.isActive && post.earlyAccess.currentPhaseEndsAt)) {
      return;
    }

    const msUntilTransition = Math.max(
      post.earlyAccess.currentPhaseEndsAt.getTime() - Date.now(),
      0
    );
    const timer = window.setTimeout(async () => {
      try {
        await refetch();
      } catch {
        // Ignore transient refresh failures at phase boundaries.
      }
    }, msUntilTransition + 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [post.earlyAccess.currentPhaseEndsAt, post.earlyAccess.isActive, refetch]);

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
