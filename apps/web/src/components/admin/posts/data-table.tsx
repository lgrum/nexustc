"use client";

import { DOCUMENT_STATUS_LABELS, TAXONOMY_DATA } from "@repo/shared/constants";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Taxonomy = keyof typeof TAXONOMY_DATA;
type SortDirection = "asc" | "desc";

type SearchField = "creatorName" | "id" | "terms" | "title" | "version";
type SortKey =
  | "comicLastUpdateAt"
  | "comicPageCount"
  | "createdAt"
  | "creatorName"
  | "isWeekly"
  | "status"
  | "title"
  | "updatedAt"
  | "version"
  | "views";

type SortOption = `${SortKey}:${SortDirection}`;

type ContentType = "comics" | "posts";

type ContentTerm = {
  term: {
    id: string;
    name: string;
    taxonomy: Taxonomy;
  };
};

export type AdminContent = {
  comicLastUpdateAt?: Date | string | null;
  comicPageCount?: number;
  createdAt: Date | string;
  creatorName: string;
  id: string;
  isWeekly?: boolean;
  status: string;
  terms: ContentTerm[];
  title: string;
  updatedAt: Date | string;
  version: string | null;
  views: number;
};

type DataTableProps<TData extends AdminContent, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  contentType: ContentType;
  data: TData[];
};

const TEXT_COLLATOR = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

const searchFieldOptions: { label: string; value: SearchField }[] = [
  { label: "Titulo", value: "title" },
  { label: "Creador", value: "creatorName" },
  { label: "Version", value: "version" },
  { label: "Terminos", value: "terms" },
  { label: "ID", value: "id" },
];

const commonSortOptions: { label: string; value: SortOption }[] = [
  { label: "Mas recientes", value: "createdAt:desc" },
  { label: "Mas antiguos", value: "createdAt:asc" },
  { label: "Actualizados recientemente", value: "updatedAt:desc" },
  { label: "Titulo A-Z", value: "title:asc" },
  { label: "Titulo Z-A", value: "title:desc" },
  { label: "Mas vistas", value: "views:desc" },
  { label: "Menos vistas", value: "views:asc" },
  { label: "Creador A-Z", value: "creatorName:asc" },
  { label: "Estado", value: "status:asc" },
  { label: "Version", value: "version:asc" },
];

const postSortOptions: { label: string; value: SortOption }[] = [
  ...commonSortOptions,
  { label: "Semanales primero", value: "isWeekly:desc" },
];

const comicSortOptions: { label: string; value: SortOption }[] = [
  ...commonSortOptions,
  { label: "Mas paginas", value: "comicPageCount:desc" },
  { label: "Ultima actualizacion", value: "comicLastUpdateAt:desc" },
];

const weeklyFilterOptions = [
  { label: "Semanal: todos", value: "all" },
  { label: "Solo semanales", value: "weekly" },
  { label: "No semanales", value: "regular" },
] as const;

const comicPagesFilterOptions = [
  { label: "Paginas: todos", value: "all" },
  { label: "Con paginas", value: "with-pages" },
  { label: "Sin paginas", value: "without-pages" },
] as const;

const comicUpdateFilterOptions = [
  { label: "Actualizacion: todas", value: "all" },
  { label: "Con actualizacion", value: "updated" },
  { label: "Sin actualizacion", value: "not-updated" },
] as const;

export function DataTable<TData extends AdminContent, TValue>({
  columns,
  contentType,
  data,
}: DataTableProps<TData, TValue>) {
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("title");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("createdAt:desc");
  const [termFilters, setTermFilters] = useState<
    Partial<Record<Taxonomy, string>>
  >({});
  const [weeklyFilter, setWeeklyFilter] = useState("all");
  const [comicPagesFilter, setComicPagesFilter] = useState("all");
  const [comicUpdateFilter, setComicUpdateFilter] = useState("all");

  const taxonomyFilters = useMemo(() => getTaxonomyFilters(data), [data]);
  const sortOptions =
    contentType === "comics" ? comicSortOptions : postSortOptions;
  const searchFieldLabel = getOptionLabel(searchFieldOptions, searchField);
  const statusFilterLabel = getStatusFilterLabel(statusFilter);
  const sortOptionLabel = getOptionLabel(sortOptions, sortOption);
  const weeklyFilterLabel = getOptionLabel(weeklyFilterOptions, weeklyFilter);
  const comicPagesFilterLabel = getOptionLabel(
    comicPagesFilterOptions,
    comicPagesFilter
  );
  const comicUpdateFilterLabel = getOptionLabel(
    comicUpdateFilterOptions,
    comicUpdateFilter
  );

  const filteredData = useMemo(
    () =>
      getFilteredAndSortedData(data, {
        comicPagesFilter,
        comicUpdateFilter,
        contentType,
        searchField,
        searchInput,
        sortOption,
        statusFilter,
        termFilters,
        weeklyFilter,
      }),
    [
      comicPagesFilter,
      comicUpdateFilter,
      contentType,
      data,
      searchField,
      searchInput,
      sortOption,
      statusFilter,
      termFilters,
      weeklyFilter,
    ]
  );

  const table = useReactTable({
    columns,
    data: filteredData,
    getCoreRowModel: getCoreRowModel(),
  });

  const hasActiveFilters =
    searchInput.trim() !== "" ||
    statusFilter !== "all" ||
    Object.values(termFilters).some((value) => value && value !== "all") ||
    weeklyFilter !== "all" ||
    comicPagesFilter !== "all" ||
    comicUpdateFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setSearchField("title");
    setStatusFilter("all");
    setTermFilters({});
    setWeeklyFilter("all");
    setComicPagesFilter("all");
    setComicUpdateFilter("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar contenido"
          className="max-w-xs"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={getSearchPlaceholder(searchField)}
          value={searchInput}
        />
        <Select
          onValueChange={(value) => {
            if (value) {
              setSearchField(value as SearchField);
            }
          }}
          value={searchField}
        >
          <SelectTrigger aria-label="Campo de busqueda" className="w-40">
            <SelectValue>{searchFieldLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {searchFieldOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => setStatusFilter(value ?? "all")}
          value={statusFilter}
        >
          <SelectTrigger aria-label="Filtrar por estado" className="w-44">
            <SelectValue>{statusFilterLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {taxonomyFilters.map((filter) => (
          <Select
            key={filter.taxonomy}
            onValueChange={(value) =>
              setTermFilters((current) => ({
                ...current,
                [filter.taxonomy]: value ?? "all",
              }))
            }
            value={termFilters[filter.taxonomy] ?? "all"}
          >
            <SelectTrigger
              aria-label={`Filtrar por ${filter.label}`}
              className="w-44"
            >
              <SelectValue>
                {getTermFilterLabel(
                  filter,
                  termFilters[filter.taxonomy] ?? "all"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {contentType === "posts" && (
          <Select
            onValueChange={(value) => setWeeklyFilter(value ?? "all")}
            value={weeklyFilter}
          >
            <SelectTrigger aria-label="Filtrar semanales" className="w-40">
              <SelectValue>{weeklyFilterLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {weeklyFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {contentType === "comics" && (
          <>
            <Select
              onValueChange={(value) => setComicPagesFilter(value ?? "all")}
              value={comicPagesFilter}
            >
              <SelectTrigger aria-label="Filtrar paginas" className="w-40">
                <SelectValue>{comicPagesFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {comicPagesFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => setComicUpdateFilter(value ?? "all")}
              value={comicUpdateFilter}
            >
              <SelectTrigger
                aria-label="Filtrar actualizaciones"
                className="w-48"
              >
                <SelectValue>{comicUpdateFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {comicUpdateFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <Select
          onValueChange={(value) => {
            if (value) {
              setSortOption(value as SortOption);
            }
          }}
          value={sortOption}
        >
          <SelectTrigger aria-label="Ordenar contenido" className="w-56">
            <SelectValue>{sortOptionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button onClick={clearFilters} type="button" variant="outline">
            Limpiar
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {filteredData.length} de {data.length}
      </p>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={columns.length}
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getTaxonomyFilters(data: AdminContent[]) {
  const filters = new Map<Taxonomy, Map<string, string>>();

  for (const row of data) {
    for (const relation of row.terms) {
      const { term } = relation;
      const options = filters.get(term.taxonomy) ?? new Map<string, string>();
      options.set(term.id, term.name);
      filters.set(term.taxonomy, options);
    }
  }

  const result: {
    label: string;
    options: { id: string; name: string }[];
    taxonomy: Taxonomy;
  }[] = [];

  for (const [taxonomy, config] of Object.entries(TAXONOMY_DATA)) {
    const options = filters.get(taxonomy as Taxonomy);

    if (!options || options.size === 0) {
      continue;
    }

    result.push({
      label: config.label,
      options: Array.from(options, ([id, name]) => ({ id, name })).toSorted(
        (left, right) => TEXT_COLLATOR.compare(left.name, right.name)
      ),
      taxonomy: taxonomy as Taxonomy,
    });
  }

  return result;
}

function getOptionLabel<TValue extends string>(
  options: readonly { label: string; value: TValue }[],
  value: string
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getStatusFilterLabel(statusFilter: string) {
  if (statusFilter === "all") {
    return "Todos los estados";
  }

  return (
    DOCUMENT_STATUS_LABELS[
      statusFilter as keyof typeof DOCUMENT_STATUS_LABELS
    ] ?? statusFilter
  );
}

function getTermFilterLabel(
  filter: {
    label: string;
    options: { id: string; name: string }[];
    taxonomy: Taxonomy;
  },
  value: string
) {
  if (value === "all") {
    return filter.label;
  }

  return filter.options.find((option) => option.id === value)?.name ?? value;
}

function getFilteredAndSortedData<TData extends AdminContent>(
  data: TData[],
  options: {
    comicPagesFilter: string;
    comicUpdateFilter: string;
    contentType: ContentType;
    searchField: SearchField;
    searchInput: string;
    sortOption: SortOption;
    statusFilter: string;
    termFilters: Partial<Record<Taxonomy, string>>;
    weeklyFilter: string;
  }
) {
  const searchValue = normalizeText(options.searchInput);
  const activeTermFilters = Object.entries(options.termFilters).filter(
    ([, termId]) => termId && termId !== "all"
  );

  const filtered = data.filter((row) => {
    if (
      searchValue &&
      !matchesSearchField(row, options.searchField, searchValue)
    ) {
      return false;
    }

    if (options.statusFilter !== "all" && row.status !== options.statusFilter) {
      return false;
    }

    for (const [taxonomy, termId] of activeTermFilters) {
      const matchesTerm = row.terms.some(
        (relation) =>
          relation.term.taxonomy === taxonomy && relation.term.id === termId
      );

      if (!matchesTerm) {
        return false;
      }
    }

    if (options.contentType === "posts") {
      if (options.weeklyFilter === "weekly" && !row.isWeekly) {
        return false;
      }

      if (options.weeklyFilter === "regular" && row.isWeekly) {
        return false;
      }
    }

    if (options.contentType === "comics") {
      const hasPages = (row.comicPageCount ?? 0) > 0;
      const hasComicUpdate = Boolean(row.comicLastUpdateAt);

      if (options.comicPagesFilter === "with-pages" && !hasPages) {
        return false;
      }

      if (options.comicPagesFilter === "without-pages" && hasPages) {
        return false;
      }

      if (options.comicUpdateFilter === "updated" && !hasComicUpdate) {
        return false;
      }

      if (options.comicUpdateFilter === "not-updated" && hasComicUpdate) {
        return false;
      }
    }

    return true;
  });

  const [sortKey, sortDirection] = options.sortOption.split(":") as [
    SortKey,
    SortDirection,
  ];
  const directionMultiplier = sortDirection === "asc" ? 1 : -1;

  return filtered.toSorted((left, right) => {
    const result = compareSortValue(left, right, sortKey);

    if (result !== 0) {
      return result * directionMultiplier;
    }

    return TEXT_COLLATOR.compare(left.title, right.title);
  });
}

function matchesSearchField(
  row: AdminContent,
  searchField: SearchField,
  searchValue: string
) {
  switch (searchField) {
    case "creatorName": {
      return normalizeText(row.creatorName).includes(searchValue);
    }
    case "id": {
      return normalizeText(row.id).includes(searchValue);
    }
    case "terms": {
      return row.terms.some((relation) =>
        normalizeText(relation.term.name).includes(searchValue)
      );
    }
    case "version": {
      return normalizeText(row.version ?? "").includes(searchValue);
    }
    case "title": {
      return normalizeText(row.title).includes(searchValue);
    }
    default: {
      return false;
    }
  }
}

function compareSortValue(
  left: AdminContent,
  right: AdminContent,
  sortKey: SortKey
) {
  const leftValue = getSortValue(left, sortKey);
  const rightValue = getSortValue(right, sortKey);

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return TEXT_COLLATOR.compare(leftValue, rightValue);
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  return TEXT_COLLATOR.compare(String(leftValue), String(rightValue));
}

function getSortValue(row: AdminContent, sortKey: SortKey) {
  switch (sortKey) {
    case "comicLastUpdateAt": {
      return getDateTime(row.comicLastUpdateAt);
    }
    case "comicPageCount": {
      return row.comicPageCount ?? 0;
    }
    case "createdAt": {
      return getDateTime(row.createdAt);
    }
    case "creatorName": {
      return row.creatorName;
    }
    case "isWeekly": {
      return row.isWeekly ? 1 : 0;
    }
    case "status": {
      return (
        DOCUMENT_STATUS_LABELS[
          row.status as keyof typeof DOCUMENT_STATUS_LABELS
        ] ?? row.status
      );
    }
    case "title": {
      return row.title;
    }
    case "updatedAt": {
      return getDateTime(row.updatedAt);
    }
    case "version": {
      return row.version ?? "";
    }
    case "views": {
      return row.views;
    }
    default: {
      return "";
    }
  }
}

function getDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .trim();
}

function getSearchPlaceholder(searchField: SearchField) {
  switch (searchField) {
    case "creatorName": {
      return "Buscar por creador...";
    }
    case "id": {
      return "Buscar por ID...";
    }
    case "terms": {
      return "Buscar por termino...";
    }
    case "version": {
      return "Buscar por version...";
    }
    case "title": {
      return "Buscar por titulo...";
    }
    default: {
      return "Buscar...";
    }
  }
}
