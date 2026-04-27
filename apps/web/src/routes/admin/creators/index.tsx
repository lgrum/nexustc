import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CreatorCreateDialog } from "@/components/admin/creators/creator-create-dialog";
import { DataTable } from "@/components/admin/data-table";
import { HasPermissions } from "@/components/auth/has-role";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/creators/")({
  component: RouteComponent,
});

type CreatorRow = Awaited<
  ReturnType<typeof orpcClient.creator.admin.list>
>[number];

type SearchField = "name" | "url";

const searchFieldOptions: { label: string; value: SearchField }[] = [
  { label: "Nombre", value: "name" },
  { label: "URL", value: "url" },
];

const columns: ColumnDef<CreatorRow>[] = [
  {
    accessorKey: "media.objectKey",
    cell: (info) => (
      <Avatar className="size-12" size="lg">
        <AvatarImage
          alt={info.row.original.name}
          src={getBucketUrl(info.row.original.media.objectKey)}
        />
        <AvatarFallback>
          {info.row.original.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("")}
        </AvatarFallback>
      </Avatar>
    ),
    header: "Avatar",
  },
  { accessorKey: "name", header: "Nombre" },
  {
    accessorKey: "url",
    cell: (info) => (
      <a
        className="text-primary underline-offset-4 hover:underline"
        href={info.row.original.url}
        rel="noopener"
        target="_blank"
      >
        {info.row.original.url}
      </a>
    ),
    header: "URL",
  },
  { accessorKey: "usageCount", header: "Posts" },
  {
    cell: function Cell(info) {
      const confirm = useConfirm();
      const queryClient = useQueryClient();

      return (
        <Button
          onClick={async () => {
            const isConfirmed = await confirm({
              cancelText: "Cancelar",
              confirmText: "Eliminar",
              description:
                "Esta accion desvinculara el creador de futuros posts, pero los posts existentes conservaran el nombre y el link guardados.",
              title: "Eliminar creador",
            });

            if (!isConfirmed) {
              return;
            }

            await toast
              .promise(orpcClient.creator.admin.delete(info.row.original.id), {
                error: (error) => ({
                  duration: 10_000,
                  message: `Error al eliminar creador: ${error}`,
                }),
                loading: "Eliminando creador...",
                success: "Creador eliminado.",
              })
              .unwrap();

            await queryClient.invalidateQueries(
              orpc.creator.admin.list.queryOptions()
            );
          }}
          size="icon"
          variant="destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} />
        </Button>
      );
    },
    header: "Acciones",
  },
];

function RouteComponent() {
  const { data } = useSuspenseQuery(orpc.creator.admin.list.queryOptions());
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");

  const filteredData = useMemo(
    () => getFilteredCreators(data, searchInput, searchField),
    [data, searchField, searchInput]
  );

  const hasActiveFilters = searchInput.trim() !== "";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-3xl">Creadores</h1>
        <HasPermissions permissions={{ creators: ["create"] }}>
          <CreatorCreateDialog />
        </HasPermissions>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Buscar creadores"
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
              <SelectValue>
                {getOptionLabel(searchFieldOptions, searchField)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {searchFieldOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              onClick={() => setSearchInput("")}
              type="button"
              variant="outline"
            >
              Limpiar
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {filteredData.length} de {data.length}
        </p>
        <DataTable columns={columns} data={filteredData} />
      </div>
    </div>
  );
}

function getFilteredCreators(
  data: CreatorRow[],
  searchInput: string,
  searchField: SearchField
) {
  const searchValue = normalizeText(searchInput);

  if (!searchValue) {
    return data;
  }

  return data.filter((creator) =>
    normalizeText(creator[searchField]).includes(searchValue)
  );
}

function getOptionLabel<TValue extends string>(
  options: readonly { label: string; value: TValue }[],
  value: string
) {
  return options.find((option) => option.value === value)?.label ?? value;
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
    case "name": {
      return "Buscar por nombre...";
    }
    case "url": {
      return "Buscar por URL...";
    }
    default: {
      return "Buscar...";
    }
  }
}
