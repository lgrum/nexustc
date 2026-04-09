import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConfirm } from "@omit/react-confirm-dialog";
import { PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/emojis/")({
  component: RouteComponent,
});

type Emoji = {
  id: string;
  name: string;
  displayName: string;
  type: string;
  assetKey: string;
  requiredTier: string;
  order: number;
  isActive: boolean;
};

const columns: ColumnDef<Emoji>[] = [
  {
    accessorKey: "assetKey",
    cell: (info) => (
      <img
        alt={info.row.original.displayName}
        className="size-8"
        src={getBucketUrl(info.row.original.assetKey)}
      />
    ),
    header: "Vista previa",
  },
  { accessorKey: "name", header: "Nombre" },
  { accessorKey: "displayName", header: "Nombre visible" },
  { accessorKey: "type", header: "Tipo" },
  {
    accessorKey: "requiredTier",
    cell: (info) => {
      const tier = info.row.original.requiredTier as PatronTier;
      return PATRON_TIERS[tier]?.badge ?? tier;
    },
    header: "Tier",
  },
  { accessorKey: "order", header: "Orden" },
  {
    accessorKey: "isActive",
    cell: (info) => (info.row.original.isActive ? "Sí" : "No"),
    header: "Activo",
  },
  {
    cell: function Cell(info) {
      const confirm = useConfirm();
      const queryClient = useQueryClient();

      return (
        <div className="flex items-center gap-2">
          <Link
            params={{ id: info.row.original.id }}
            to="/admin/emojis/$id/edit"
          >
            <Button variant="outline">Editar</Button>
          </Link>
          <Button
            onClick={async () => {
              const isConfirmed = await confirm({
                cancelText: "Cancelar",
                confirmText: "Eliminar",
                description:
                  "¿Estás absolutamente seguro de que quieres eliminar este emoji? Esta acción no se puede deshacer.",
                title: "Eliminar Emoji",
              });

              if (isConfirmed) {
                await toast
                  .promise(
                    orpcClient.emoji.admin.delete(info.row.original.id),
                    {
                      error: (error) => ({
                        duration: 10_000,
                        message: `Error al eliminar emoji: ${error}`,
                      }),
                      loading: "Eliminando emoji...",
                      success: "Emoji eliminado.",
                    }
                  )
                  .unwrap();

                await queryClient.invalidateQueries(
                  orpc.emoji.admin.list.queryOptions()
                );
              }
            }}
            size="icon"
            variant="destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      );
    },
    header: "Acciones",
  },
];

function RouteComponent() {
  const { data } = useSuspenseQuery(orpc.emoji.admin.list.queryOptions());

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-3xl">Emojis</h1>
        <Link to="/admin/emojis/create">
          <Button>Crear Emoji</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
