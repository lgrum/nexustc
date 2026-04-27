import {
  Folder01Icon,
  GameController03Icon,
  Image01Icon,
  ShuffleSquareIcon,
  Tag01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { z } from "zod";

import { PostCard } from "@/components/landing/post-card";
import type { PostProps } from "@/components/landing/post-card";
import {
  getGameFilterCount,
  orderBySchema,
} from "@/components/search/catalog-search";
import type { gameSearchParamsSchema } from "@/components/search/catalog-search";
import {
  LIBRARY_TOOLBAR_CLASS,
  LibraryEmptyState,
  LibraryPagination,
  LibrarySearchInput,
  MultiSelectPopover,
  SectionHeader,
  SelectedChipsRow,
  SortControl,
} from "@/components/search/library-shared";
import type {
  MultiSelectOption,
  SearchPaginationState,
  SelectedChip,
} from "@/components/search/library-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { useTerms } from "@/hooks/use-terms";

type GameSearchParams = z.infer<typeof gameSearchParamsSchema>;

type GamesPageProps = {
  filteredPosts: PostProps[];
  onRandom: () => void;
  onPageChange: (page: number) => void;
  onSearchChange: (params: GameSearchParams) => void;
  params: GameSearchParams;
  pagination: SearchPaginationState;
};

const gameLibraryFormSchema = z.object({
  engine: z.array(z.string()),
  graphics: z.array(z.string()),
  orderBy: orderBySchema,
  platform: z.array(z.string()),
  query: z.string(),
  status: z.array(z.string()),
  tag: z.array(z.string()),
});

type FilterGroupKey = "status" | "engine" | "graphics" | "platform" | "tag";

const FILTER_GROUPS: {
  icon: typeof Tag01Icon;
  key: FilterGroupKey;
  label: string;
  searchPlaceholder: string;
}[] = [
  {
    icon: Tick02Icon,
    key: "status",
    label: "Estado",
    searchPlaceholder: "Filtrar estados…",
  },
  {
    icon: Folder01Icon,
    key: "engine",
    label: "Motor",
    searchPlaceholder: "Filtrar motores…",
  },
  {
    icon: Image01Icon,
    key: "graphics",
    label: "Gráficos",
    searchPlaceholder: "Filtrar gráficos…",
  },
  {
    icon: GameController03Icon,
    key: "platform",
    label: "Plataformas",
    searchPlaceholder: "Filtrar plataformas…",
  },
  {
    icon: Tag01Icon,
    key: "tag",
    label: "Tags",
    searchPlaceholder: "Filtrar tags…",
  },
];

export function GamesPage({
  filteredPosts,
  onRandom,
  onPageChange,
  onSearchChange,
  pagination,
  params,
}: GamesPageProps) {
  const activeFilterCount = getGameFilterCount(params);
  const isFiltered = activeFilterCount > 0;
  const resultCount = pagination.totalItems;

  return (
    <main className="flex w-full flex-col gap-5 px-1 py-6 md:px-3">
      <SectionHeader
        eyebrow="Catálogo"
        icon={GameController03Icon}
        rightSlot={
          <Badge
            className="rounded-full border-primary/30 bg-primary/10 text-primary"
            variant="outline"
          >
            {activeFilterCount === 1
              ? "1 filtro activo"
              : `${activeFilterCount} filtros activos`}
          </Badge>
        }
        subtitle={
          isFiltered
            ? `${resultCount} resultados con tus filtros`
            : "Explora la biblioteca completa de juegos"
        }
        title={isFiltered ? "Tu selección" : "Todos los juegos"}
      />

      <GamesLibraryToolbar
        onRandom={onRandom}
        onSearchChange={onSearchChange}
        params={params}
      />

      <div className="glow-line" />

      {filteredPosts.length === 0 ? (
        <LibraryEmptyState
          filteredMessage="Prueba con otra combinación de filtros o quita la búsqueda."
          isFiltered={isFiltered}
          unfilteredTitle="Aún no hay juegos publicados"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <LibraryPagination
            onPageChange={onPageChange}
            pagination={pagination}
          />
        </>
      )}
    </main>
  );
}

function GamesLibraryToolbar({
  params,
  onSearchChange,
  onRandom,
}: {
  params: GameSearchParams;
  onSearchChange: (params: GameSearchParams) => void;
  onRandom: () => void;
}) {
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
    validators: { onSubmit: gameLibraryFormSchema },
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

  const optionsByGroup = useMemo(() => {
    const data = termsQuery.data ?? [];
    const acc: Record<FilterGroupKey, MultiSelectOption[]> = {
      engine: [],
      graphics: [],
      platform: [],
      status: [],
      tag: [],
    };
    for (const term of data) {
      if (term.taxonomy in acc) {
        const key = term.taxonomy as FilterGroupKey;
        acc[key].push({
          color: term.color,
          id: term.id,
          name: term.name,
        });
      }
    }
    return acc;
  }, [termsQuery.data]);

  const toggleId = (group: FilterGroupKey, id: string) => {
    const current = formValues[group];
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    form.setFieldValue(group, next);
  };

  const chips: SelectedChip[] = useMemo(() => {
    const acc: SelectedChip[] = [];
    for (const group of FILTER_GROUPS) {
      const selected = formValues[group.key];
      const options = optionsByGroup[group.key];
      const lookup = new Map(options.map((option) => [option.id, option]));
      for (const id of selected) {
        const option = lookup.get(id);
        if (option) {
          acc.push({ group: group.key, id: option.id, name: option.name });
        }
      }
    }
    return acc;
  }, [formValues, optionsByGroup]);

  const removeChip = (chip: SelectedChip) => {
    toggleId(chip.group as FilterGroupKey, chip.id);
  };

  const clearAllFilters = () => {
    for (const group of FILTER_GROUPS) {
      form.setFieldValue(group.key, []);
    }
  };

  return (
    <form
      className={LIBRARY_TOOLBAR_CLASS}
      onSubmit={(event) => event.preventDefault()}
    >
      <LibrarySearchInput
        id="games-library-search"
        onChange={(value) => form.setFieldValue("query", value)}
        onClear={() => form.setFieldValue("query", "")}
        value={formValues.query}
      />

      <SortControl
        onChange={(value) => form.setFieldValue("orderBy", value)}
        value={formValues.orderBy}
      />

      {FILTER_GROUPS.map((group) => {
        const selectedSet = new Set(formValues[group.key]);
        return (
          <MultiSelectPopover
            icon={group.icon}
            key={group.key}
            loading={termsQuery.isPending}
            onToggle={(id) => toggleId(group.key, id)}
            options={optionsByGroup[group.key]}
            searchPlaceholder={group.searchPlaceholder}
            selectedIds={selectedSet}
            triggerLabel={group.label}
          />
        );
      })}

      <Button
        className="h-11 rounded-xl border-white/15 bg-background/60 px-3"
        onClick={onRandom}
        title="Juego aleatorio"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={ShuffleSquareIcon} />
        <span className="inline">Aleatorio</span>
      </Button>

      <SelectedChipsRow
        chips={chips}
        onClearAll={clearAllFilters}
        onRemove={removeChip}
      />
    </form>
  );
}
