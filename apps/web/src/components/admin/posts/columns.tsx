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

export type Post = AdminContent & {
  isWeekly: boolean;
};

export const columns: ColumnDef<Post>[] = [
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
    accessorKey: "views",
    cell: (info) => info.row.original.views.toLocaleString("es-ES"),
    header: "Vistas",
  },
  {
    accessorKey: "isWeekly",
    cell: (info) =>
      info.row.original.isWeekly ? (
        <Badge variant="default">Semanal</Badge>
      ) : (
        <Badge variant="outline">Normal</Badge>
      ),
    header: "Semanal",
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
            to="/admin/posts/edit/$id"
          >
            <Button variant="outline">Editar</Button>
          </Link>
          <Button
            onClick={async () => {
              const isConfirmed = await confirm({
                cancelText: "Cancelar",
                confirmText: "Eliminar",
                description:
                  "Estas absolutamente seguro de que quieres eliminar este post? Esta accion no se puede deshacer.",
                title: "Eliminar Post",
              });

              if (isConfirmed) {
                await toast
                  .promise(orpcClient.post.admin.delete(info.row.original.id), {
                    error: (error) => ({
                      duration: 10_000,
                      message: `Error al eliminar post: ${error}`,
                    }),
                    loading: "Eliminando post...",
                    success: "Post eliminado.",
                  })
                  .unwrap();

                await queryClient.invalidateQueries(
                  orpc.post.admin.getDashboardList.queryOptions()
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
