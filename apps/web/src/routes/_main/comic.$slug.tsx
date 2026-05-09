import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import z from "zod";

import { ComicPage } from "@/components/posts/comic-page";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const comicPageSchema = z.object({
  page: z.number().optional(),
});

export const Route = createFileRoute("/_main/comic/$slug")({
  component: RouteComponent,
  staleTime: 1000 * 60 * 5, // 5 minutes
  loader: async ({ params }) => {
    const [error, data, isDefined] = await safeOrpcClient.post.getPostById({
      slug: params.slug,
      type: "comic",
    });

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

    if (data.type !== "comic") {
      throw notFound();
    }

    return data;
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
  const initialPost = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: post = initialPost, refetch } = useQuery({
    initialData: initialPost,
    queryFn: () => orpcClient.post.getPostById({ slug, type: "comic" }),
    queryKey: ["content", "comic", slug],
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
        <ComicPage
          comic={post}
          page={page}
          setComicPage={(nextPage) => {
            navigate({
              search: nextPage < 0 ? {} : { page: nextPage },
            });
          }}
        />
      </div>
    </main>
  );
}
