import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  AdminNotificationCard,
  EditorialDashboardHeader,
  EditorialDashboardViewToggle,
  EmptyAdminState,
} from "@/components/admin/notifications/editorial-dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/admin/notifications/announcements/")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Anuncios globales",
      },
    ],
  }),
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const announcementsQuery = useQuery(
    orpc.notification.admin.listGlobalAnnouncements.queryOptions()
  );

  const archiveMutation = useMutation(
    orpc.notification.admin.archive.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            orpc.notification.admin.listGlobalAnnouncements.queryOptions()
          ),
          queryClient.invalidateQueries({
            queryKey: ["notification-feed"],
          }),
        ]);
        toast.success("Elemento archivado.");
      },
    })
  );

  return (
    <main className="flex flex-col gap-6">
      <EditorialDashboardHeader
        activeDashboard="announcements"
        description="Consulta el historial de avisos globales activos o archivados y cambia al formulario dedicado cuando necesites publicar uno nuevo."
        title="Dashboard de anuncios globales"
      />

      <EditorialDashboardViewToggle
        activeView="list"
        createHref="/admin/notifications/announcements/create"
        createLabel="Crear anuncio"
        listHref="/admin/notifications/announcements"
        listLabel="Listar anuncios"
      />

      <Card className="rounded-[1.8rem]">
        <CardHeader>
          <CardTitle>Anuncios recientes</CardTitle>
          <CardDescription>
            Historial rapido de avisos globales activos o archivados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcementsQuery.data?.length ? (
            announcementsQuery.data.map((item) => (
              <AdminNotificationCard
                key={item.id}
                archiveDisabled={
                  archiveMutation.isPending || Boolean(item.archivedAt)
                }
                badgeLabel={item.archivedAt ? "Archivado" : "Global"}
                description={item.description}
                expirationAt={item.expirationAt}
                onArchive={
                  item.archivedAt
                    ? undefined
                    : () => archiveMutation.mutate({ id: item.id })
                }
                publishedAt={item.publishedAt}
                title={item.title}
              />
            ))
          ) : (
            <EmptyAdminState copy="Todavia no se publicaron anuncios globales." />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
