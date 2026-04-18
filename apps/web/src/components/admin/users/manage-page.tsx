import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { authClient } from "@/lib/auth-client";

import { getColumns } from "./columns";
import { CreateUserDialog } from "./create-user-dialog";
import type { AdminUser } from "./types";
import { UsersDataTable } from "./users-data-table";

const filterOptions = [
  { label: "Todos", value: "all" },
  { label: "Baneados", value: "banned" },
  { label: "Rol: AlphaNeXusTC⁺¹⁸", value: "role:owner" },
  { label: "Rol: Alpha⁺¹⁸", value: "role:admin" },
  { label: "Rol: BetaTC⁺¹⁸", value: "role:moderator" },
  { label: "Rol: DEALER⁺¹⁸", value: "role:uploader" },
  { label: "Rol: Acortador", value: "role:shortener" },
  { label: "Rol: Sobrino⁺¹⁸", value: "role:user" },
];

type UserSearchField = "email" | "name";

const searchFieldOptions: { label: string; value: UserSearchField }[] = [
  { label: "Email", value: "email" },
  { label: "Usuario", value: "name" },
];

function getOptionLabel(
  options: { label: string; value: string }[],
  value: string
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function UserManagePage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<UserSearchField>("email");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  useDebounceEffect(
    () => {
      setSearch(searchInput);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    300,
    [searchInput]
  );

  const filterParams = useMemo(() => {
    if (filter === "banned") {
      return { filterField: "banned" as const, filterValue: "true" };
    }
    if (filter.startsWith("role:")) {
      return {
        filterField: "role" as const,
        filterValue: filter.replace("role:", ""),
      };
    }
    return {};
  }, [filter]);

  const queryKey = [
    "admin-users",
    search,
    searchField,
    filter,
    pagination.pageIndex,
    pagination.pageSize,
  ];

  const { data, isLoading } = useQuery({
    queryFn: async () => {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pagination.pageSize,
          offset: pagination.pageIndex * pagination.pageSize,
          ...(search ? { searchField, searchValue: search } : {}),
          ...filterParams,
        },
      });

      if (result.error) {
        throw new Error("Error al cargar usuarios");
      }

      return result.data as { users: AdminUser[]; total: number };
    },
    queryKey,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(handleRefresh), [handleRefresh]);

  const users = data?.users ?? [];
  const totalCount = data?.total ?? 0;
  const pageCount = Math.ceil(totalCount / pagination.pageSize);
  const searchFieldLabel = getOptionLabel(searchFieldOptions, searchField);
  const filterLabel = getOptionLabel(filterOptions, filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl">Gestionar Usuarios</h1>
        <Button onClick={() => setCreateOpen(true)}>Crear Usuario</Button>
      </div>

      <div className="flex items-center gap-4">
        <Input
          className="max-w-sm"
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={
            searchField === "name"
              ? "Buscar por nombre de usuario..."
              : "Buscar por email..."
          }
          value={searchInput}
        />
        <Select
          onValueChange={(value) => {
            if (value) {
              setSearchField(value as UserSearchField);
            }
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
          }}
          value={searchField}
        >
          <SelectTrigger className="w-40">
            <SelectValue>{searchFieldLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {searchFieldOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            setFilter(value ?? "all");
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
          }}
          value={filter}
        >
          <SelectTrigger className="w-50">
            <SelectValue>{filterLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">
          Cargando...
        </div>
      ) : (
        <UsersDataTable
          columns={columns}
          data={users}
          onPaginationChange={setPagination}
          pageCount={pageCount}
          pagination={pagination}
          totalCount={totalCount}
        />
      )}

      <CreateUserDialog
        onOpenChange={setCreateOpen}
        onSuccess={handleRefresh}
        open={createOpen}
      />
    </div>
  );
}
