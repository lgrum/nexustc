"use client";

import { useQuery } from "@tanstack/react-query";

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

export function ClientPage() {
  const { data: newsArticles } = useQuery(
    orpc.notification.admin.listNewsArticles.queryOptions()
  );

  return (
    <main className="flex flex-col gap-6">
      <EditorialDashboardHeader
        activeDashboard="articles"
        description="Revisa el historial completo de articulos manuales y abre la vista dedicada de creacion cuando necesites redactar uno con mas espacio."
        title="Dashboard de articulos manuales"
      />

      <EditorialDashboardViewToggle
        activeView="list"
        createHref="/admin/notifications/articles/create"
        createLabel="Crear articulo"
        listHref="/admin/notifications/articles"
        listLabel="Listar articulos"
      />

      <Card className="rounded-[1.8rem]">
        <CardHeader>
          <CardTitle>Articulos recientes</CardTitle>
          <CardDescription>
            El historial se mantiene completo para cada contenido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {newsArticles?.length ? (
            newsArticles.map((item) => (
              <AdminNotificationCard
                key={item.id}
                badgeLabel={
                  item.status === "published" ? "Publicado" : "Archivado"
                }
                description={item.summary || "Sin resumen para la bandeja."}
                expirationAt={item.expirationAt}
                newsArticleId={item.id}
                publishedAt={item.publishedAt}
                title={item.title}
              />
            ))
          ) : (
            <EmptyAdminState copy="Todavia no se publicaron articulos manuales." />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
