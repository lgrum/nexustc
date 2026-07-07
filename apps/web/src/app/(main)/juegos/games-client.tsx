"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { GamesPage } from "@/components/games/games-page";
import type { PostProps } from "@/components/landing/post-card";
import type { GameSearchParams } from "@/components/search/catalog-search";
import type { SearchPaginationState } from "@/components/search/library-shared";
import { orpcClient } from "@/lib/orpc";

function toSearchParams(params: GameSearchParams) {
  const searchParams = new URLSearchParams();
  if (params.query) {
    searchParams.set("query", params.query);
  }
  if (params.page > 1) {
    searchParams.set("page", String(params.page));
  }
  if (params.orderBy !== "newest") {
    searchParams.set("orderBy", params.orderBy);
  }

  for (const key of [
    "engine",
    "graphics",
    "platform",
    "status",
    "tag",
  ] as const) {
    for (const value of params[key] ?? []) {
      searchParams.append(key, value);
    }
  }

  return searchParams;
}

function scrollToSearchToolbar() {
  window.setTimeout(() => {
    document
      .querySelector("#games-library-toolbar")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}

export function GamesClient({
  filteredPosts,
  pagination,
  params,
}: {
  filteredPosts: PostProps[];
  pagination: SearchPaginationState;
  params: GameSearchParams;
}) {
  const router = useRouter();

  const handleSearchChange = useCallback(
    (search: GameSearchParams) => {
      const query = toSearchParams(search).toString();
      router.push(query ? `/juegos?${query}` : "/juegos", { scroll: false });
    },
    [router]
  );

  const handleRandom = useCallback(async () => {
    const result = await orpcClient.post.getRandom({ type: "post" });
    if (result) {
      router.push(`/post/${result.slug}`);
    }
  }, [router]);

  const handlePageChange = useCallback(
    (page: number) => {
      const query = toSearchParams({ ...params, page }).toString();
      router.push(query ? `/juegos?${query}` : "/juegos", { scroll: false });
      scrollToSearchToolbar();
    },
    [params, router]
  );

  return (
    <GamesPage
      filteredPosts={filteredPosts}
      onPageChange={handlePageChange}
      onRandom={handleRandom}
      onSearchChange={handleSearchChange}
      pagination={pagination}
      params={params}
    />
  );
}
