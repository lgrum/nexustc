import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { ComicsPage } from "@/components/comics/comics-page";
import {
  comicSearchParamsSchema,
  getComicTermIds,
} from "@/components/search/catalog-search";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/comics")({
  component: ComicsRouteComponent,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const termIds = getComicTermIds(deps);
    const searchResult = await orpcClient.post.search({
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
  validateSearch: comicSearchParamsSchema,
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
    (id: string) => {
      navigate({ params: { id }, to: "/post/$id" });
    },
    [navigate]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      navigate({
        resetScroll: false,
        search: { ...params, page },
        to: "/comics",
      });
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
