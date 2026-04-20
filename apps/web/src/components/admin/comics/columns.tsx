import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DOCUMENT_STATUS_LABELS } from "@repo/shared/constants";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import type { AdminContent } from "@/components/admin/posts/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { orpc, orpcClient } from "@/lib/orpc";

export type Comic = AdminContent & {
  comicLastUpdateAt: Date | string | null;
  comicPageCount: number;
};

export const columns: ColumnDef<Comic>[] = [
  {
    accessorKey: "title",
    cell: (info) =>
      info.row.original.status === "publish" ? (
        <Link params={{ id: info.row.original.id }} to="/post/$id">
          {info.row.original.title}
        </Link>
      ) : (
        info.row.original.title
      ),
    header: "Titulo",
  },
  {
    accessorKey: "status",
    cell: (info) => {
      const label =
        DOCUMENT_STATUS_LABELS[
          info.row.original.status as keyof typeof DOCUMENT_STATUS_LABELS
        ];

      return <Badge variant="outline">{label}</Badge>;
    },
    header: "Estado",
  },
  {
    accessorKey: "creatorName",
    cell: (info) => info.row.original.creatorName || "-",
    header: "Creador",
  },
  {
    accessorKey: "version",
    cell: (info) => info.row.original.version || "-",
    header: "Version",
  },
  {
    accessorKey: "comicPageCount",
    cell: (info) => info.row.original.comicPageCount.toLocaleString("es-ES"),
    header: "Paginas",
  },
  {
    accessorKey: "comicLastUpdateAt",
    cell: (info) =>
      info.row.original.comicLastUpdateAt
        ? new Date(info.row.original.comicLastUpdateAt).toLocaleDateString(
            "es-ES"
          )
        : "-",
    header: "Actualizado",
  },
  {
    accessorKey: "views",
    cell: (info) => info.row.original.views.toLocaleString("es-ES"),
    header: "Vistas",
  },
  {
    accessorKey: "createdAt",
    cell: (info) =>
      new Date(info.row.original.createdAt).toLocaleDateString("es-ES"),
    header: "Creado",
  },
  {
    cell: function Cell(info) {
      const confirm = useConfirm();
      const queryClient = useQueryClient();

      return (
        <div className="flex items-center gap-2">
          <Link
            params={{ id: info.row.original.id }}
            to="/admin/comics/edit/$id"
          >
            <Button variant="outline">Editar</Button>
          </Link>
          <Button
            onClick={async () => {
              const isConfirmed = await confirm({
                cancelText: "Cancelar",
                confirmText: "Eliminar",
                description:
                  "Estas absolutamente seguro de que quieres eliminar este comic? Esta accion no se puede deshacer.",
                title: "Eliminar Comic",
              });

              if (isConfirmed) {
                await toast
                  .promise(
                    orpcClient.comic.admin.delete(info.row.original.id),
                    {
                      error: (error) => ({
                        duration: 10_000,
                        message: `Error al eliminar comic: ${error}`,
                      }),
                      loading: "Eliminando comic...",
                      success: "Comic eliminado.",
                    }
                  )
                  .unwrap();

                await queryClient.invalidateQueries(
                  orpc.comic.admin.getDashboardList.queryOptions()
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
