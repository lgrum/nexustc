"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ComicPage } from "@/components/posts/comic-page";
import { orpc } from "@/lib/orpc";
import type { PostType } from "@/lib/types";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

function getComicQueryInput(idOrSlug: string) {
  return NANOID_PATTERN.test(idOrSlug)
    ? idOrSlug
    : { slug: idOrSlug, type: "comic" as const };
}

export function ComicClient({
  comic,
  slug,
}: {
  comic: PostType;
  slug: string;
}) {
  const router = useRouter();
  const { data: currentComic, refetch } = useQuery({
    ...orpc.post.getPostById.queryOptions({
      input: getComicQueryInput(slug),
    }),
    initialData: comic,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (
      !(
        currentComic.earlyAccess.isActive &&
        currentComic.earlyAccess.currentPhaseEndsAt
      )
    ) {
      return;
    }

    const msUntilTransition = Math.max(
      currentComic.earlyAccess.currentPhaseEndsAt.getTime() - Date.now(),
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
  }, [
    currentComic.earlyAccess.currentPhaseEndsAt,
    currentComic.earlyAccess.isActive,
    refetch,
  ]);

  return (
    <main className="w-full">
      <div className="flex flex-col gap-12">
        <ComicPage
          comic={currentComic}
          setComicPage={(nextPage) => {
            router.push(`/comic/${slug}/read?page=${nextPage}`);
          }}
        />
      </div>
    </main>
  );
}
