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
    const filteredPosts = await orpcClient.post.search({
      orderBy: deps.orderBy,
      query: deps.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "post",
    });

    return { filteredPosts };
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
  const { filteredPosts } = Route.useLoaderData();

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

  return (
    <GamesPage
      filteredPosts={filteredPosts ?? []}
      onRandom={handleRandom}
      onSearchChange={handleSearchChange}
      params={params}
    />
  );
}
