import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { PostCard } from "@/components/landing/post-card";
import {
  ComicSearchControls,
  GameSearchControls,
  getComicFilterCount,
  getComicTermIds,
  getGameFilterCount,
  getGameTermIds,
  searchParamsSchema,
} from "@/components/search/catalog-search";
import { LibraryPagination } from "@/components/search/library-shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/search")({
  component: RouteComponent,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const isComic = deps.type === "comics";
    const termIds = isComic ? getComicTermIds(deps) : getGameTermIds(deps);

    const searchResult = await orpcClient.post.search({
      orderBy: deps.orderBy,
      page: deps.page,
      query: deps.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: isComic ? "comic" : "post",
    });

    return {
      filteredPosts: searchResult.items,
      pagination: searchResult.pagination,
    };
  },
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Buscar",
      },
    ],
  }),
});

function RouteComponent() {
  const params = Route.useSearch();
  const navigate = useNavigate();
  const { filteredPosts, pagination } = Route.useLoaderData();

  const handleTabChange = useCallback(
    (value: string | null) => {
      if (value === "juegos" || value === "comics") {
        navigate({
          search: { page: 1, type: value },
          to: "/search",
        });
      }
    },
    [navigate]
  );

  const handleGameSearchChange = useCallback(
    (search: Omit<typeof params, "type">) => {
      navigate({
        search: { ...search, page: search.page ?? 1, type: "juegos" },
        to: "/search",
      });
    },
    [navigate]
  );

  const handleComicSearchChange = useCallback(
    (search: {
      orderBy: typeof params.orderBy;
      query?: string;
      page?: number;
      tag?: string[];
    }) => {
      navigate({
        search: { ...search, page: search.page ?? 1, type: "comics" },
        to: "/search",
      });
    },
    [navigate]
  );

  const handleRandomSelect = useCallback(
    (id: string) => {
      navigate({ params: { id }, to: "/post/$id" });
    },
    [navigate]
  );

  const activeFilterCount =
    params.type === "comics"
      ? getComicFilterCount(params)
      : getGameFilterCount(params);

  const handlePageChange = useCallback(
    (page: number) => {
      navigate({
        resetScroll: false,
        search: { ...params, page },
        to: "/search",
      });
    },
    [navigate, params]
  );

  return (
    <main className="grid w-full gap-6 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
      <section className="min-w-0 space-y-4 md:order-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[Lexend] font-bold text-3xl">Buscar</h1>
            <p className="text-muted-foreground text-sm">
              Mostrando {pagination.totalItems} resultados
            </p>
          </div>
          <p className="rounded-xl border border-white/10 bg-card/70 px-3 py-1.5 text-muted-foreground text-sm">
            {activeFilterCount === 1
              ? "1 filtro activo"
              : `${activeFilterCount} filtros activos`}
          </p>
        </div>
        <div className="glow-line" />
        {filteredPosts?.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-card/50 py-8 text-center text-muted-foreground">
            No se encontraron resultados que coincidan con tu búsqueda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {filteredPosts?.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
        <LibraryPagination
          onPageChange={handlePageChange}
          pagination={pagination}
        />
      </section>

      <aside className="min-w-0 md:order-2">
        <div className="rounded-xl border border-white/10 bg-card/70 p-3 backdrop-blur md:sticky md:top-22">
          <Tabs onValueChange={handleTabChange} value={params.type ?? "juegos"}>
            <TabsList className="w-full rounded-xl">
              <TabsTrigger value="juegos">Juegos</TabsTrigger>
              <TabsTrigger value="comics">Comics</TabsTrigger>
            </TabsList>
            <TabsContent value="juegos">
              <GameSearchControls
                defaultFiltersOpen={false}
                onRandomSelect={handleRandomSelect}
                onSearchChange={handleGameSearchChange}
                params={params}
              />
            </TabsContent>
            <TabsContent value="comics">
              <ComicSearchControls
                defaultFiltersOpen={false}
                onRandomSelect={handleRandomSelect}
                onSearchChange={handleComicSearchChange}
                params={params}
              />
            </TabsContent>
          </Tabs>
        </div>
      </aside>
    </main>
  );
}
