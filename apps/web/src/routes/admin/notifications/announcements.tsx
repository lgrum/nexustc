import { Megaphone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import * as z from "zod";

import {
  AdminNotificationCard,
  EditorialDashboardHeader,
  EmptyAdminState,
  parseOptionalDate,
} from "@/components/admin/notifications/editorial-dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/admin/notifications/announcements")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Anuncios globales",
      },
    ],
  }),
});

const optionalDateInputSchema = z.string().trim().max(64);

function RouteComponent() {
  const queryClient = useQueryClient();
  const announcementsQuery = useQuery(
    orpc.notification.admin.listGlobalAnnouncements.queryOptions()
  );

  const createAnnouncementMutation = useMutation(
    orpc.notification.admin.createGlobalAnnouncement.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            orpc.notification.admin.listGlobalAnnouncements.queryOptions()
          ),
          queryClient.invalidateQueries(
            orpc.notification.getUnreadCount.queryOptions()
          ),
        ]);
        toast.success("Anuncio global publicado.");
      },
    })
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

  const announcementForm = useAppForm({
    defaultValues: {
      description: "",
      expirationAt: "",
      imageObjectKey: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      await createAnnouncementMutation.mutateAsync({
        description: value.description,
        expirationAt: parseOptionalDate(value.expirationAt),
        imageObjectKey: value.imageObjectKey || undefined,
        title: value.title,
      });
      announcementForm.reset();
    },
    validators: {
      onSubmit: z.object({
        description: z.string().max(4096),
        expirationAt: optionalDateInputSchema,
        imageObjectKey: z.string().max(512),
        title: z.string().trim().min(1).max(255),
      }),
    },
  });

  return (
    <main className="flex flex-col gap-6">
      <EditorialDashboardHeader
        activeDashboard="announcements"
        description="Publica avisos globales para toda la plataforma, programa su expiracion y mantien un historial rapido de lo que sigue activo o ya fue archivado."
        title="Dashboard de anuncios globales"
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                className="size-5 text-amber-400"
                icon={Megaphone01Icon}
              />
              Crear anuncio global
            </CardTitle>
            <CardDescription>
              Visible para toda la plataforma hasta su expiracion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                announcementForm.handleSubmit();
              }}
            >
              <announcementForm.AppField name="title">
                {(field) => (
                  <field.TextField
                    label="Titulo"
                    placeholder="Nueva funcion, mantenimiento, aviso importante"
                    required
                  />
                )}
              </announcementForm.AppField>
              <announcementForm.AppField name="description">
                {(field) => (
                  <field.TextareaField
                    label="Descripcion"
                    placeholder="Resume lo importante con el tono que veran los usuarios en la bandeja."
                    rows={5}
                  />
                )}
              </announcementForm.AppField>
              <div className="grid gap-4 md:grid-cols-2">
                <announcementForm.AppField name="expirationAt">
                  {(field) => (
                    <field.TextField
                      label="Expira en"
                      placeholder="Opcional"
                      type="datetime-local"
                    />
                  )}
                </announcementForm.AppField>
                <announcementForm.AppField name="imageObjectKey">
                  {(field) => (
                    <field.TextField
                      label="Banner image key"
                      placeholder="Opcional"
                    />
                  )}
                </announcementForm.AppField>
              </div>
              <announcementForm.AppForm>
                <announcementForm.SubmitButton className="w-full">
                  Publicar anuncio
                </announcementForm.SubmitButton>
              </announcementForm.AppForm>
            </form>
          </CardContent>
        </Card>

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
      </section>
    </main>
  );
}
