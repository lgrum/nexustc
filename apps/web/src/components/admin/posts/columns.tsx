import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConfirm } from "@omit/react-confirm-dialog";
import { DOCUMENT_STATUS_LABELS } from "@repo/shared/constants";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { orpc, orpcClient } from "@/lib/orpc";

export type Post = {
  id: string;
  title: string;
  status: string;
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
    header: "Título",
  },
  {
    accessorKey: "status",
    cell: (info) => {
      const label =
        DOCUMENT_STATUS_LABELS[
          info.row.original.status as keyof typeof DOCUMENT_STATUS_LABELS
        ];
      return label;
    },
    header: "Estado",
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
                  "¿Estás absolutamente seguro de que quieres eliminar este post? Esta acción no se puede deshacer.",
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
