import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import z from "zod";

import { ComicPage } from "@/components/posts/comic-page";
import { PostPage } from "@/components/posts/post-components";
import { orpc, queryClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const comicPageSchema = z.object({
  page: z.number().optional(),
});

function getPostQueryOptions(slug: string) {
  return orpc.post.getPostById.queryOptions({
    input: { slug, type: "post" },
  });
}

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

export const Route = createFileRoute("/_main/post/$id")({
  component: RouteComponent,
  staleTime: 1000 * 60 * 5, // 5 minutes
  loader: async ({ params }) => {
    try {
      const data = await queryClient.ensureQueryData(
        getPostQueryOptions(params.id)
      );

      if (data.type !== "post") {
        throw notFound();
      }

      return data;
    } catch (error) {
      const code = getErrorCode(error);

      if (code === "NOT_FOUND") {
        throw notFound();
      }

      if (code === "RATE_LIMITED") {
        throw new Error("RATE_LIMITED", { cause: error });
      }

      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        media: getCoverImageObjectKey(
          loaderData?.imageObjectKeys,
          loaderData?.coverImageObjectKey
        )
          ? getBucketUrl(
              getCoverImageObjectKey(
                loaderData?.imageObjectKeys,
                loaderData?.coverImageObjectKey
              )!
            )
          : undefined,
        title: loaderData?.earlyAccess.isRestrictedView
          ? "NeXusTC - VIP Early Access"
          : `NeXusTC - ${loaderData ? loaderData.title : `Post`}`,
      },
    ],
  }),
  validateSearch: zodValidator(comicPageSchema),
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: post, refetch } = useSuspenseQuery({
    ...getPostQueryOptions(id),
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
          <ComicPage
            comic={post}
            page={page}
            setComicPage={(nextPage) => {
              navigate({
                search: nextPage < 0 ? {} : { page: nextPage },
              });
            }}
          />
        )}
      </div>
    </main>
  );
}
