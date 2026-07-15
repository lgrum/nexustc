"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

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
      <Image
        alt={info.row.original.displayName}
        className="size-8"
        height={32}
        src={getBucketUrl(info.row.original.assetKey)}
        width={32}
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
          <Link href={`/admin/emojis/${info.row.original.id}/edit`}>
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

export function EmojisClient() {
  const { data } = useSuspenseQuery(orpc.emoji.admin.list.queryOptions());

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-3xl">Emojis</h1>
        <Link href="/admin/emojis/create">
          <Button>Crear Emoji</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
