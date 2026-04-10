import { Megaphone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import * as z from "zod";

import {
  EditorialDashboardHeader,
  EditorialDashboardViewToggle,
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
import {
  createEmptyDeferredMediaSelection,
  optionalSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute(
  "/admin/notifications/announcements/create"
)({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Crear anuncio global",
      },
    ],
  }),
});

const optionalDateInputSchema = z.string().trim().max(64);

const announcementCreateSchema = z.object({
  description: z.string().max(4096),
  expirationAt: optionalDateInputSchema,
  imageSelection: optionalSingleDeferredMediaSelectionSchema,
  title: z.string().trim().min(1).max(255),
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const createAnnouncementMutation = useMutation(
    orpc.notification.admin.createGlobalAnnouncement.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(orpc.media.admin.list.queryOptions()),
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

  const announcementForm = useAppForm({
    defaultValues: {
      description: "",
      expirationAt: "",
      imageSelection: createEmptyDeferredMediaSelection(),
      title: "",
    },
    onSubmit: async ({ value }) => {
      await createAnnouncementMutation.mutateAsync({
        description: value.description,
        expirationAt: parseOptionalDate(value.expirationAt),
        imageSelection: value.imageSelection,
        title: value.title,
      });
      announcementForm.reset();
    },
    validators: {
      onSubmit: announcementCreateSchema,
    },
  });

  return (
    <main className="flex flex-col gap-6">
      <EditorialDashboardHeader
        activeDashboard="announcements"
        description="Usa el formulario completo para redactar un aviso global con mejor contexto visual y consulta el historial desde la vista de listado."
        title="Crear anuncio global"
      />

      <EditorialDashboardViewToggle
        activeView="create"
        createHref="/admin/notifications/announcements/create"
        createLabel="Crear anuncio"
        listHref="/admin/notifications/announcements"
        listLabel="Listar anuncios"
      />

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
            </div>
            <announcementForm.AppField name="imageSelection">
              {(field) => (
                <field.MediaField
                  description="Selecciona una imagen opcional para mostrarla junto al anuncio global."
                  label="Banner del anuncio"
                  maxItems={1}
                  ownerKind="Anuncio"
                />
              )}
            </announcementForm.AppField>
            <announcementForm.AppForm>
              <announcementForm.SubmitButton className="w-full">
                Publicar anuncio
              </announcementForm.SubmitButton>
            </announcementForm.AppForm>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
