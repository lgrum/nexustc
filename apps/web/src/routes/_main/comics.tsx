import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { ComicsPage } from "@/components/comics/comics-page";
import {
  comicSearchParamsSchema,
  getComicTermIds,
} from "@/components/search/catalog-search";
import { orpcClient } from "@/lib/orpc";

function scrollToSearchToolbar() {
  window.setTimeout(() => {
    document
      .querySelector("#comics-library-toolbar")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}

export const Route = createFileRoute("/_main/comics")({
  component: ComicsRouteComponent,
  validateSearch: comicSearchParamsSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const termIds = getComicTermIds(deps);
    const searchResult = await orpcClient.post.search({
      maxPageCount: deps.maxPages,
      minPageCount: deps.minPages,
      orderBy: deps.orderBy,
      page: deps.page,
      query: deps.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "comic",
    });

    return {
      filteredPosts: searchResult.items,
      pagination: searchResult.pagination,
    };
  },
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Comics",
      },
    ],
  }),
});

function ComicsRouteComponent() {
  const params = Route.useSearch();
  const navigate = useNavigate();
  const { filteredPosts, pagination } = Route.useLoaderData();

  const handleSearchChange = useCallback(
    (search: typeof params) => {
      navigate({ resetScroll: false, search, to: "/comics" });
    },
    [navigate]
  );

  const handleRandomSelect = useCallback(
    (slug: string) => {
      navigate({ params: { slug }, to: "/comic/$slug" });
    },
    [navigate]
  );

  const handlePageChange = useCallback(
    async (page: number) => {
      await navigate({
        resetScroll: false,
        search: { ...params, page },
        to: "/comics",
      });
      scrollToSearchToolbar();
    },
    [navigate, params]
  );

  return (
    <ComicsPage
      filteredPosts={filteredPosts ?? []}
      pagination={pagination}
      onPageChange={handlePageChange}
      onRandomSelect={handleRandomSelect}
      onSearchChange={handleSearchChange}
      params={params}
    />
  );
}
