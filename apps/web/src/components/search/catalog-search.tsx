import {
  Book03Icon,
  DiceFaces05Icon,
  GameController03Icon,
  Search01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import z from "zod";

import { PostCard } from "@/components/landing/post-card";
import type { PostProps } from "@/components/landing/post-card";
import {
  SearchFilters,
  SearchFiltersButton,
  SearchForm,
} from "@/components/search/search-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppForm } from "@/hooks/use-app-form";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { useTerms } from "@/hooks/use-terms";
import { orpcClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export const ORDER_OPTIONS = [
  { label: "Más Recientes", value: "newest" },
  { label: "Más Vistos", value: "views" },
  { label: "Más Antiguos", value: "oldest" },
  { label: "Título (A-Z)", value: "title_asc" },
  { label: "Título (Z-A)", value: "title_desc" },
  { label: "Mejor Valorados", value: "rating_avg" },
  { label: "Más Valoraciones", value: "rating_count" },
  { label: "Más Likes", value: "likes" },
] as const;

export const orderBySchema = z.enum([
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "views",
  "rating_avg",
  "rating_count",
  "likes",
]);

export const gameSearchParamsSchema = z.object({
  engine: z.array(z.string()).optional().default([]),
  graphics: z.array(z.string()).optional().default([]),
  orderBy: orderBySchema.optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  platform: z.array(z.string()).optional().default([]),
  query: z.string().optional(),
  status: z.array(z.string()).optional().default([]),
  tag: z.array(z.string()).optional().default([]),
});

export const comicSearchParamsSchema = z.object({
  orderBy: orderBySchema.optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  query: z.string().optional(),
  tag: z.array(z.string()).optional().default([]),
});

export const typeSchema = z.enum(["juegos", "comics"]);

export const searchParamsSchema = gameSearchParamsSchema.extend({
  type: typeSchema.optional().default("juegos"),
});

const gameFormSchema = z.object({
  engine: z.array(z.string()),
  graphics: z.array(z.string()),
  orderBy: orderBySchema,
  platform: z.array(z.string()),
  query: z.string(),
  status: z.array(z.string()),
  tag: z.array(z.string()),
});

const comicFormSchema = z.object({
  orderBy: orderBySchema,
  query: z.string(),
  tag: z.array(z.string()),
});

export type GameSearchParams = z.infer<typeof gameSearchParamsSchema>;
export type ComicSearchParams = z.infer<typeof comicSearchParamsSchema>;
export type UnifiedSearchParams = z.infer<typeof searchParamsSchema>;

type CatalogKind = "games" | "comics";

type CatalogLandingPageProps = {
  activeFilterCount: number;
  children: React.ReactNode;
  kind: CatalogKind;
  posts: PostProps[];
};

type GameSearchControlsProps = {
  defaultFiltersOpen?: boolean;
  onRandomSelect: (id: string) => void;
  onSearchChange: (params: GameSearchParams) => void;
  params: GameSearchParams;
};

type ComicSearchControlsProps = {
  defaultFiltersOpen?: boolean;
  onRandomSelect: (id: string) => void;
  onSearchChange: (params: ComicSearchParams) => void;
  params: ComicSearchParams;
};

export function CatalogLandingPage({
  activeFilterCount,
  children,
  kind,
  posts,
}: CatalogLandingPageProps) {
  return (
    <main className="w-full overflow-hidden pb-10">
      <section className="grid gap-5 px-1 py-6 md:px-3 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-white/10 bg-card/70 p-3 shadow-[0_20px_55px_-34px_hsl(var(--primary))] backdrop-blur">
            {children}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-[Lexend] font-bold text-xl">Catálogo activo</p>
              <p className="text-muted-foreground text-sm">
                Mostrando {posts.length} resultados
              </p>
            </div>
            <Badge className="rounded-xl" variant="secondary">
              {activeFilterCount === 1
                ? "1 filtro activo"
                : `${activeFilterCount} filtros activos`}
            </Badge>
          </div>
          <div className="glow-line" />
          <CatalogResults kind={kind} posts={posts} />
        </section>
      </section>
    </main>
  );
}

export function GameSearchControls({
  defaultFiltersOpen = true,
  onRandomSelect,
  onSearchChange,
  params,
}: GameSearchControlsProps) {
  const termsQuery = useTerms();

  const form = useAppForm({
    defaultValues: {
      engine: params.engine ?? [],
      graphics: params.graphics ?? [],
      orderBy: params.orderBy ?? "newest",
      platform: params.platform ?? [],
      query: params.query ?? "",
      status: params.status ?? [],
      tag: params.tag ?? [],
    },
    validators: {
      onSubmit: gameFormSchema,
    },
  });

  const formValues = useStore(form.store, (state) => state.values);

  useDebounceEffect(
    () => {
      onSearchChange({
        engine: formValues.engine,
        graphics: formValues.graphics,
        orderBy: formValues.orderBy,
        page: 1,
        platform: formValues.platform,
        query: formValues.query || undefined,
        status: formValues.status,
        tag: formValues.tag,
      });
    },
    300,
    [
      formValues.query,
      formValues.engine,
      formValues.graphics,
      formValues.status,
      formValues.platform,
      formValues.tag,
      formValues.orderBy,
    ]
  );

  const handleRandomPost = async () => {
    const result = await orpcClient.post.getRandom({ type: "post" });
    if (result) {
      onRandomSelect(result.id);
    }
  };

  if (termsQuery.isPending) {
    return <SearchControlsSkeleton />;
  }

  if (termsQuery.isError) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
        Error al cargar filtros.
      </p>
    );
  }

  const groupedTerms = Object.groupBy(termsQuery.data, (term) => term.taxonomy);

  return (
    <SearchForm
      defaultFiltersOpen={defaultFiltersOpen}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="flex flex-col gap-3">
        <SearchHeader icon={GameController03Icon} title="Filtros de juegos" />
        <div className="flex items-end gap-2">
          <form.AppField name="query">
            {(field) => (
              <field.TextField className="w-full" label="Buscar" type="text" />
            )}
          </form.AppField>
          <Button
            className="size-12 shrink-0 rounded-xl"
            onClick={handleRandomPost}
            size="icon"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={DiceFaces05Icon} />
          </Button>
        </div>
        <SearchFiltersButton className="rounded-xl lg:hidden" />
        <SearchFilters className="grid gap-3 md:grid-cols-2 lg:flex lg:flex-col">
          <form.AppField name="orderBy">
            {(field) => (
              <field.SelectField
                label="Ordenar por"
                options={[...ORDER_OPTIONS]}
              />
            )}
          </form.AppField>
          <form.AppField name="status">
            {(field) => (
              <field.MultiSelectField
                label="Estado"
                options={
                  groupedTerms.status?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
          <form.AppField name="engine">
            {(field) => (
              <field.MultiSelectField
                label="Motor"
                options={
                  groupedTerms.engine?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
          <form.AppField name="graphics">
            {(field) => (
              <field.MultiSelectField
                label="Gráficos"
                options={
                  groupedTerms.graphics?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
          <form.AppField name="platform">
            {(field) => (
              <field.MultiSelectField
                label="Plataformas"
                options={
                  groupedTerms.platform?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
          <form.AppField name="tag">
            {(field) => (
              <field.MultiSelectField
                label="Tags"
                options={
                  groupedTerms.tag?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
        </SearchFilters>
      </div>
    </SearchForm>
  );
}

export function ComicSearchControls({
  defaultFiltersOpen = true,
  onRandomSelect,
  onSearchChange,
  params,
}: ComicSearchControlsProps) {
  const termsQuery = useTerms();

  const form = useAppForm({
    defaultValues: {
      orderBy: params.orderBy ?? "newest",
      query: params.query ?? "",
      tag: params.tag ?? [],
    },
    validators: {
      onSubmit: comicFormSchema,
    },
  });

  const formValues = useStore(form.store, (state) => state.values);

  useDebounceEffect(
    () => {
      onSearchChange({
        orderBy: formValues.orderBy,
        page: 1,
        query: formValues.query || undefined,
        tag: formValues.tag,
      });
    },
    300,
    [formValues.query, formValues.tag, formValues.orderBy]
  );

  const handleRandomComic = async () => {
    const result = await orpcClient.post.getRandom({ type: "comic" });
    if (result) {
      onRandomSelect(result.id);
    }
  };

  if (termsQuery.isPending) {
    return <SearchControlsSkeleton />;
  }

  if (termsQuery.isError) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
        Error al cargar filtros.
      </p>
    );
  }

  const groupedTerms = Object.groupBy(termsQuery.data, (term) => term.taxonomy);

  return (
    <SearchForm
      defaultFiltersOpen={defaultFiltersOpen}
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-3">
        <SearchHeader icon={Book03Icon} title="Filtros de comics" />
        <div className="flex items-end gap-2">
          <form.AppField name="query">
            {(field) => (
              <field.TextField className="w-full" label="Buscar" type="text" />
            )}
          </form.AppField>
          <Button
            className="size-12 shrink-0 rounded-xl"
            onClick={handleRandomComic}
            size="icon"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={DiceFaces05Icon} />
          </Button>
        </div>
        <SearchFiltersButton className="rounded-xl lg:hidden" />
        <SearchFilters className="grid gap-3 md:grid-cols-2 lg:flex lg:flex-col">
          <form.AppField name="orderBy">
            {(field) => (
              <field.SelectField
                label="Ordenar por"
                options={[...ORDER_OPTIONS]}
              />
            )}
          </form.AppField>
          <form.AppField name="tag">
            {(field) => (
              <field.MultiSelectField
                label="Tags"
                options={
                  groupedTerms.tag?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>
        </SearchFilters>
      </div>
    </SearchForm>
  );
}

export function getGameFilterCount(params: GameSearchParams) {
  return [
    params.query ? [params.query] : [],
    params.engine ?? [],
    params.graphics ?? [],
    params.platform ?? [],
    params.status ?? [],
    params.tag ?? [],
  ].reduce((count, values) => count + values.length, 0);
}

export function getComicFilterCount(params: ComicSearchParams) {
  return [params.query ? [params.query] : [], params.tag ?? []].reduce(
    (count, values) => count + values.length,
    0
  );
}

export function getGameTermIds(params: GameSearchParams) {
  return [
    ...(params.engine ?? []),
    ...(params.graphics ?? []),
    ...(params.status ?? []),
    ...(params.platform ?? []),
    ...(params.tag ?? []),
  ];
}

export function getComicTermIds(params: ComicSearchParams) {
  return params.tag ?? [];
}

function CatalogResults({
  kind,
  posts,
}: {
  kind: CatalogKind;
  posts: PostProps[];
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-card/50 p-8 text-center">
        <HugeiconsIcon
          className="mx-auto size-8 text-muted-foreground"
          icon={Search01Icon}
        />
        <p className="mt-3 font-[Lexend] font-semibold">Sin resultados</p>
        <p className="mx-auto mt-1 max-w-sm text-muted-foreground text-sm">
          No se encontraron publicaciones que coincidan con esta selección.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5",
        kind === "comics" ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-3"
      )}
    >
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function SearchHeader({
  icon,
  title,
}: {
  icon: IconSvgElement;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <HugeiconsIcon className="size-4" icon={icon} />
        </span>
        <p className="truncate font-[Lexend] font-bold">{title}</p>
      </div>
      <HugeiconsIcon
        className="size-4 text-muted-foreground"
        icon={Tag01Icon}
      />
    </div>
  );
}

function SearchControlsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-2/3 rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
