"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { ComicsPage } from "@/components/comics/comics-page";
import type { PostProps } from "@/components/landing/post-card";
import type { ComicSearchParams } from "@/components/search/catalog-search";
import type { SearchPaginationState } from "@/components/search/library-shared";

function toSearchParams(params: ComicSearchParams) {
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
  if (params.minPages !== undefined) {
    searchParams.set("minPages", String(params.minPages));
  }
  if (params.maxPages !== undefined) {
    searchParams.set("maxPages", String(params.maxPages));
  }

  for (const value of params.tag ?? []) {
    searchParams.append("tag", value);
  }

  return searchParams;
}

function scrollToSearchToolbar() {
  window.setTimeout(() => {
    document
      .querySelector("#comics-library-toolbar")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}

export function ComicsClient({
  filteredPosts,
  pagination,
  params,
  popularPosts,
  trendingPosts,
}: {
  filteredPosts: PostProps[];
  pagination: SearchPaginationState;
  params: ComicSearchParams;
  popularPosts: PostProps[];
  trendingPosts: PostProps[];
}) {
  const router = useRouter();

  const handleSearchChange = useCallback(
    (search: ComicSearchParams) => {
      const query = toSearchParams(search).toString();
      router.push(query ? `/comics?${query}` : "/comics", { scroll: false });
    },
    [router]
  );

  const handleRandomSelect = useCallback(
    (slug: string) => {
      router.push(`/comic/${slug}`);
    },
    [router]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      const query = toSearchParams({ ...params, page }).toString();
      router.push(query ? `/comics?${query}` : "/comics", { scroll: false });
      scrollToSearchToolbar();
    },
    [params, router]
  );

  return (
    <ComicsPage
      filteredPosts={filteredPosts}
      onPageChange={handlePageChange}
      onRandomSelect={handleRandomSelect}
      onSearchChange={handleSearchChange}
      pagination={pagination}
      params={params}
      popularPosts={popularPosts}
      trendingPosts={trendingPosts}
    />
  );
}
