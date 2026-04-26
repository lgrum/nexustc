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
    const filteredPosts = await orpcClient.post.search({
      orderBy: deps.orderBy,
      query: deps.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "comic",
    });

    return { filteredPosts };
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
  const { filteredPosts } = Route.useLoaderData();

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

  return (
    <ComicsPage
      filteredPosts={filteredPosts ?? []}
      onRandomSelect={handleRandomSelect}
      onSearchChange={handleSearchChange}
      params={params}
    />
  );
}
