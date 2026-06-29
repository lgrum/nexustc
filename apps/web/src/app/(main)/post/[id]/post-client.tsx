"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { PostPage } from "@/components/posts/post-components";
import { orpc } from "@/lib/orpc";
import type { PostType } from "@/lib/types";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

function getPostQueryInput(idOrSlug: string) {
  return NANOID_PATTERN.test(idOrSlug)
    ? idOrSlug
    : { slug: idOrSlug, type: "post" as const };
}

export function PostClient({ id, post }: { id: string; post: PostType }) {
  const { data: currentPost, refetch } = useQuery({
    ...orpc.post.getPostById.queryOptions({
      input: getPostQueryInput(id),
    }),
    initialData: post,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (
      !(
        currentPost.earlyAccess.isActive &&
        currentPost.earlyAccess.currentPhaseEndsAt
      )
    ) {
      return;
    }

    const msUntilTransition = Math.max(
      currentPost.earlyAccess.currentPhaseEndsAt.getTime() - Date.now(),
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
    currentPost.earlyAccess.currentPhaseEndsAt,
    currentPost.earlyAccess.isActive,
    refetch,
  ]);

  return (
    <main className="w-full">
      <div className="flex flex-col gap-12">
        <PostPage post={currentPost} />
      </div>
    </main>
  );
}
