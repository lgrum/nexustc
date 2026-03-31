import { ROLE_LABELS } from "@repo/shared/constants";
import type { ColumnDef } from "@tanstack/react-table";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import type { AdminUser } from "./types";
import { UserActionsDropdown } from "./user-actions-dropdown";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const roleBadgeVariant: Record<string, "default" | "accent" | "outline"> = {
  admin: "accent",
  moderator: "default",
  owner: "accent",
  shortener: "default",
  uploader: "default",
  user: "outline",
};

export function getColumns(onRefresh: () => void): ColumnDef<AdminUser>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              {user.image && <AvatarImage src={user.image} />}
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{user.name}</span>
          </div>
        );
      },
      header: "Usuario",
    },
    {
      accessorKey: "email",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span>{row.original.email}</span>
          {row.original.emailVerified && (
            <Badge variant="outline">Verificado</Badge>
          )}
        </div>
      ),
      header: "Email",
    },
    {
      accessorKey: "role",
      cell: ({ row }) => (
        <Badge
          className="font-semibold"
          variant={roleBadgeVariant[row.original.role] ?? "outline"}
        >
          {ROLE_LABELS[row.original.role]}
        </Badge>
      ),
      header: "Rol",
    },
    {
      accessorKey: "banned",
      cell: ({ row }) =>
        row.original.banned ? (
          <Badge variant="destructive">Baneado</Badge>
        ) : (
          <Badge variant="outline">Activo</Badge>
        ),
      header: "Estado",
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleDateString("es-ES"),
      header: "Registro",
    },
    {
      cell: ({ row }) => (
        <UserActionsDropdown onRefresh={onRefresh} user={row.original} />
      ),
      header: "Acciones",
      id: "actions",
    },
  ];
}
