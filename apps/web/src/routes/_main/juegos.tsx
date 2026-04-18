import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  CatalogLandingPage,
  GameSearchControls,
  gameSearchParamsSchema,
  getGameFilterCount,
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
      navigate({ search, to: "/juegos" });
    },
    [navigate]
  );

  const handleRandomSelect = useCallback(
    (id: string) => {
      navigate({ params: { id }, to: "/post/$id" });
    },
    [navigate]
  );

  return (
    <CatalogLandingPage
      activeFilterCount={getGameFilterCount(params)}
      kind="games"
      posts={filteredPosts ?? []}
    >
      <GameSearchControls
        onRandomSelect={handleRandomSelect}
        onSearchChange={handleSearchChange}
        params={params}
      />
    </CatalogLandingPage>
  );
}
