import {
  ArrowDown01Icon,
  Search01Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { z } from "zod";

import { ORDER_OPTIONS } from "@/components/search/catalog-search";
import type { orderBySchema } from "@/components/search/catalog-search";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

type OrderBy = z.infer<typeof orderBySchema>;

/* -------------------------------------------------------------------------- */
/*                              Search input                                  */
/* -------------------------------------------------------------------------- */

export function LibrarySearchInput({
  id,
  onChange,
  onClear,
  placeholder = "Buscar por título…",
  value,
}: {
  id: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label
      className="group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-background/60 px-3 transition-colors focus-within:border-primary/50 focus-within:bg-background"
      htmlFor={id}
    >
      <HugeiconsIcon
        className="size-4 text-muted-foreground transition-colors group-focus-within:text-primary"
        icon={Search01Icon}
      />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value && (
        <button
          aria-label="Limpiar búsqueda"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClear}
          type="button"
        >
          ✕
        </button>
      )}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Sort control                                */
/* -------------------------------------------------------------------------- */

export function SortControl({
  onChange,
  value,
}: {
  onChange: (value: OrderBy) => void;
  value: OrderBy;
}) {
  const [open, setOpen] = useState(false);
  const current =
    ORDER_OPTIONS.find((option) => option.value === value) ?? ORDER_OPTIONS[0];

  return (
    <div className="relative">
      <Button
        className={cn(
          "h-11 w-full justify-between rounded-xl border-white/15 bg-background/60 px-3 font-medium md:w-44",
          open && "border-primary/50 bg-background"
        )}
        onClick={() => setOpen((p) => !p)}
        type="button"
        variant="outline"
      >
        <span className="inline-flex items-center gap-2">
          <HugeiconsIcon className="size-4 opacity-70" icon={Time04Icon} />
          <span className="truncate text-sm">{current.label}</span>
        </span>
        <HugeiconsIcon
          className={cn(
            "size-3.5 opacity-60 transition-transform duration-200",
            open && "rotate-180"
          )}
          icon={ArrowDown01Icon}
        />
      </Button>

      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-popover/95 p-1 shadow-2xl backdrop-blur-md">
            {ORDER_OPTIONS.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted/50"
                  )}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected && (
                    <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_oklch(0.795_0.184_86.047/0.5)]" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Multi-select popover                            */
/* -------------------------------------------------------------------------- */

export type MultiSelectOption = {
  id: string;
  name: string;
  color?: string | null;
};

export function MultiSelectPopover({
  icon,
  loading = false,
  onToggle,
  options,
  searchPlaceholder,
  selectedIds,
  triggerLabel,
}: {
  icon: IconSvgElement;
  loading?: boolean;
  onToggle: (id: string) => void;
  options: MultiSelectOption[];
  searchPlaceholder?: string;
  selectedIds: Set<string>;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const count = selectedIds.size;
  const inputId = useMemo(
    () => `multi-${triggerLabel.toLowerCase().replaceAll(/\s+/g, "-")}-filter`,
    [triggerLabel]
  );

  return (
    <div className="relative">
      <Button
        className={cn(
          "h-11 rounded-xl border-white/15 bg-background/60 px-3 font-medium",
          open && "border-primary/50 bg-background"
        )}
        onClick={() => setOpen((p) => !p)}
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={icon} />
        <span className="hidden sm:inline">{triggerLabel}</span>
        {count > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10.5px] font-bold tabular-nums text-primary-foreground">
            {count}
          </span>
        )}
        <HugeiconsIcon
          className={cn(
            "size-3.5 opacity-60 transition-transform duration-200",
            open && "rotate-180"
          )}
          icon={ArrowDown01Icon}
        />
      </Button>

      {open && (
        <MultiSelectPanel
          inputId={inputId}
          loading={loading}
          onClose={() => setOpen(false)}
          onToggle={onToggle}
          options={options}
          searchPlaceholder={
            searchPlaceholder ?? `Filtrar ${triggerLabel.toLowerCase()}…`
          }
          selectedIds={selectedIds}
        />
      )}
    </div>
  );
}

function MultiSelectPanel({
  inputId,
  loading,
  onClose,
  onToggle,
  options,
  searchPlaceholder,
  selectedIds,
}: {
  inputId: string;
  loading: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  options: MultiSelectOption[];
  searchPlaceholder: string;
  selectedIds: Set<string>;
}) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const lowered = filter.trim().toLowerCase();
    if (!lowered) {
      return options;
    }
    return options.filter((option) =>
      option.name.toLowerCase().includes(lowered)
    );
  }, [filter, options]);

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 z-40 mt-2 w-[min(360px,90vw)] overflow-hidden rounded-xl border border-white/10 bg-popover/95 p-2 shadow-2xl backdrop-blur-md">
        <label
          className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-background/60 px-2.5"
          htmlFor={inputId}
        >
          <HugeiconsIcon
            className="size-3.5 text-muted-foreground"
            icon={Search01Icon}
          />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            id={inputId}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={filter}
          />
        </label>

        <div className="max-h-72 overflow-y-auto pr-1 [scrollbar-color:oklch(0.795_0.184_86.047/0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:transition-colors hover:[&::-webkit-scrollbar-thumb]:bg-primary/55 [&::-webkit-scrollbar-track]:bg-transparent">
          {loading && (
            <p className="p-3 text-center text-muted-foreground text-sm">
              Cargando opciones…
            </p>
          )}

          {!loading && visible.length === 0 && (
            <p className="p-3 text-center text-muted-foreground text-sm">
              Sin coincidencias.
            </p>
          )}

          {!loading && visible.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-1">
              {visible.map((option) => {
                const selected = selectedIds.has(option.id);
                return (
                  <button
                    className={cn(
                      "group/picker inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all",
                      selected
                        ? "border-primary/45 bg-primary/15 text-primary"
                        : "border-white/10 bg-background/60 text-muted-foreground hover:border-white/25 hover:text-foreground"
                    )}
                    key={option.id}
                    onClick={() => onToggle(option.id)}
                    type="button"
                  >
                    {selected && (
                      <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_oklch(0.795_0.184_86.047/0.7)]" />
                    )}
                    <span className="truncate">{option.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Selected filter chip row                          */
/* -------------------------------------------------------------------------- */

export type SelectedChip = {
  id: string;
  name: string;
  /** Identifier of the group this chip belongs to, used by onRemove. */
  group: string;
};

export function SelectedChipsRow({
  chips,
  onClearAll,
  onRemove,
}: {
  chips: SelectedChip[];
  onClearAll: () => void;
  onRemove: (chip: SelectedChip) => void;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 md:order-last md:basis-full">
      {chips.map((chip) => (
        <button
          className="group/tag inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
          key={`${chip.group}:${chip.id}`}
          onClick={() => onRemove(chip)}
          type="button"
        >
          {chip.name}
          <span className="opacity-60 group-hover/tag:opacity-100">✕</span>
        </button>
      ))}
      <button
        className="ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        onClick={onClearAll}
        type="button"
      >
        Limpiar
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Section header                                */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  accentClassName,
  accentHaloClassName,
  eyebrow,
  icon,
  rightSlot,
  subtitle,
  title,
}: {
  accentClassName?: string;
  accentHaloClassName?: string;
  eyebrow: string;
  icon: IconSvgElement;
  rightSlot?: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "relative mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary",
            accentClassName && "border-current/30 bg-current/10",
            accentClassName
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute -inset-1 -z-10 rounded-2xl bg-primary/30 blur-md opacity-70",
              accentHaloClassName
            )}
          />
          <HugeiconsIcon className="size-4" icon={icon} />
        </span>
        <div className="min-w-0">
          <p className="font-[Lexend] text-[10.5px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="display-heading mt-0.5 text-balance text-[22px] leading-tight md:text-[26px]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Empty results                                 */
/* -------------------------------------------------------------------------- */

export function LibraryEmptyState({
  filteredMessage,
  isFiltered,
  unfilteredMessage,
  unfilteredTitle,
}: {
  filteredMessage?: string;
  isFiltered: boolean;
  unfilteredMessage?: string;
  unfilteredTitle: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-card/40 p-10 text-center">
      <HugeiconsIcon
        className="mx-auto size-9 text-muted-foreground/80"
        icon={Search01Icon}
      />
      <p className="mt-4 font-[Lexend] font-semibold text-base">
        {isFiltered ? "Sin resultados" : unfilteredTitle}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-muted-foreground text-sm">
        {isFiltered
          ? (filteredMessage ??
            "Prueba con otra combinación de filtros o quita la búsqueda.")
          : (unfilteredMessage ??
            "Vuelve pronto, estamos curando algo grande.")}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const COMPACT_FORMATTER = new Intl.NumberFormat("es", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCount(value: number | undefined | null) {
  if (value === undefined || value === null) {
    return "0";
  }
  return COMPACT_FORMATTER.format(value);
}

export type SearchPaginationState = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export function LibraryPagination({
  onPageChange,
  pagination,
}: {
  onPageChange: (page: number) => void;
  pagination: SearchPaginationState;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.page < pagination.totalPages;
  const pages = getVisiblePaginationItems(
    pagination.page,
    pagination.totalPages
  );

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={!hasPrevious}
              className={cn(!hasPrevious && "pointer-events-none opacity-50")}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (hasPrevious) {
                  onPageChange(pagination.page - 1);
                }
              }}
              text="Anterior"
            />
          </PaginationItem>
          {pages.map((item) =>
            typeof item === "string" ? (
              <PaginationItem key={item}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={item === pagination.page}
                  onClick={(event) => {
                    event.preventDefault();
                    onPageChange(item);
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              aria-disabled={!hasNext}
              className={cn(!hasNext && "pointer-events-none opacity-50")}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (hasNext) {
                  onPageChange(pagination.page + 1);
                }
              }}
              text="Siguiente"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p className="text-muted-foreground text-xs">
        {pagination.totalItems} resultados en total
      </p>
    </div>
  );
}

function getVisiblePaginationItems(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages]);

  for (
    let page = Math.max(1, currentPage - 1);
    page <= Math.min(totalPages, currentPage + 1);
    page += 1
  ) {
    pages.add(page);
  }

  const sortedPages = [...pages].toSorted((a, b) => a - b);
  const items: (number | string)[] = [];

  for (const page of sortedPages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && page - previous > 1) {
      items.push(`ellipsis-${previous}-${page}`);
    }
    items.push(page);
  }

  return items;
}

/**
 * Wrapper className for a library toolbar that contains absolute-positioned
 * popovers. Lifts the toolbar above sibling content so the popovers escape
 * the local stacking context created by `backdrop-blur`.
 */
export const LIBRARY_TOOLBAR_CLASS =
  "relative z-30 flex flex-col gap-3 rounded-2xl border border-white/10 bg-card/60 p-3 shadow-[0_25px_60px_-40px_oklch(0.795_0.184_86.047/0.5)] backdrop-blur md:flex-row md:flex-wrap md:items-center md:gap-2";
