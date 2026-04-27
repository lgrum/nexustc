import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { GamesPage } from "@/components/games/games-page";
import {
  gameSearchParamsSchema,
  getGameTermIds,
} from "@/components/search/catalog-search";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/juegos")({
  component: GamesRouteComponent,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const termIds = getGameTermIds(deps);
    const searchResult = await orpcClient.post.search({
      orderBy: deps.orderBy,
      page: deps.page,
      query: deps.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "post",
    });

    return {
      filteredPosts: searchResult.items,
      pagination: searchResult.pagination,
    };
  },
  validateSearch: gameSearchParamsSchema,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Juegos",
      },
    ],
  }),
});

function GamesRouteComponent() {
  const params = Route.useSearch();
  const navigate = useNavigate();
  const { filteredPosts, pagination } = Route.useLoaderData();

  const handleSearchChange = useCallback(
    (search: typeof params) => {
      navigate({ resetScroll: false, search, to: "/juegos" });
    },
    [navigate]
  );

  const handleRandom = useCallback(async () => {
    const result = await orpcClient.post.getRandom({ type: "post" });
    if (result) {
      navigate({ params: { id: result.id }, to: "/post/$id" });
    }
  }, [navigate]);

  const handlePageChange = useCallback(
    (page: number) => {
      navigate({
        resetScroll: false,
        search: { ...params, page },
        to: "/juegos",
      });
    },
    [navigate, params]
  );

  return (
    <GamesPage
      filteredPosts={filteredPosts ?? []}
      onRandom={handleRandom}
      onPageChange={handlePageChange}
      onSearchChange={handleSearchChange}
      pagination={pagination}
      params={params}
    />
  );
}
