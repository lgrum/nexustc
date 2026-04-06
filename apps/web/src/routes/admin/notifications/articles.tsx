import { News01Icon } from "@hugeicons/core-free-icons";
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

export const Route = createFileRoute("/admin/notifications/articles")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Articulos manuales",
      },
    ],
  }),
});

const optionalDateInputSchema = z.string().trim().max(64);

function RouteComponent() {
  const queryClient = useQueryClient();
  const postsQuery = useQuery(orpc.post.admin.getDashboardList.queryOptions());
  const comicsQuery = useQuery(
    orpc.comic.admin.getDashboardList.queryOptions()
  );
  const newsQuery = useQuery(
    orpc.notification.admin.listNewsArticles.queryOptions()
  );

  const createNewsMutation = useMutation(
    orpc.notification.admin.createNewsArticle.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            orpc.notification.admin.listNewsArticles.queryOptions()
          ),
          queryClient.invalidateQueries({
            queryKey: ["notification-feed"],
          }),
        ]);
        toast.success("Articulo de staff publicado.");
      },
    })
  );

  const contentOptions = [
    ...(postsQuery.data ?? [])
      .filter((item) => item.status === "publish")
      .map((item) => ({
        label: `[Juego] ${item.title}`,
        value: item.id,
      })),
    ...(comicsQuery.data ?? [])
      .filter((item) => item.status === "publish")
      .map((item) => ({
        label: `[Comic] ${item.title}`,
        value: item.id,
      })),
  ].toSorted((a, b) => a.label.localeCompare(b.label, "es"));

  const newsForm = useAppForm({
    defaultValues: {
      bannerImageObjectKey: "",
      body: "",
      contentId: "",
      expirationAt: "",
      publishedAt: "",
      summary: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      await createNewsMutation.mutateAsync({
        bannerImageObjectKey: value.bannerImageObjectKey || undefined,
        body: value.body,
        contentId: value.contentId,
        expirationAt: parseOptionalDate(value.expirationAt),
        publishedAt: parseOptionalDate(value.publishedAt),
        summary: value.summary,
        title: value.title,
      });
      newsForm.reset();
    },
    validators: {
      onSubmit: z.object({
        bannerImageObjectKey: z.string().max(512),
        body: z.string().trim().min(1).max(65_535),
        contentId: z.string().trim().min(1, "Selecciona un contenido."),
        expirationAt: optionalDateInputSchema,
        publishedAt: optionalDateInputSchema,
        summary: z.string().max(1024),
        title: z.string().trim().min(1).max(255),
      }),
    },
  });

  return (
    <main className="flex flex-col gap-6">
      <EditorialDashboardHeader
        activeDashboard="articles"
        description="Redacta articulos manuales para juegos o comics concretos. Cada publicacion nueva reemplaza la anterior del mismo contenido para evitar ruido en la bandeja del usuario."
        title="Dashboard de articulos manuales"
      />

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                className="size-5 text-sky-400"
                icon={News01Icon}
              />
              Publicar articulo por contenido
            </CardTitle>
            <CardDescription>
              Publica una noticia ligada a un juego o comic seguido por los
              usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                newsForm.handleSubmit();
              }}
            >
              <newsForm.AppField name="contentId">
                {(field) => (
                  <field.SelectField
                    label="Contenido objetivo"
                    options={contentOptions}
                    required
                  />
                )}
              </newsForm.AppField>
              <newsForm.AppField name="title">
                {(field) => (
                  <field.TextField
                    label="Titulo"
                    placeholder="Devlog, parche, anuncio comunitario"
                    required
                  />
                )}
              </newsForm.AppField>
              <newsForm.AppField name="summary">
                {(field) => (
                  <field.TextareaField
                    label="Resumen para la bandeja"
                    placeholder="Texto corto que aparecera en la notificacion."
                    rows={3}
                  />
                )}
              </newsForm.AppField>
              <newsForm.AppField name="body">
                {(field) => (
                  <field.BlockNoteField label="Cuerpo del articulo" required />
                )}
              </newsForm.AppField>
              <div className="grid gap-4 md:grid-cols-3">
                <newsForm.AppField name="publishedAt">
                  {(field) => (
                    <field.TextField
                      label="Publicar en"
                      placeholder="Ahora"
                      type="datetime-local"
                    />
                  )}
                </newsForm.AppField>
                <newsForm.AppField name="expirationAt">
                  {(field) => (
                    <field.TextField
                      label="Expira en"
                      placeholder="Opcional"
                      type="datetime-local"
                    />
                  )}
                </newsForm.AppField>
                <newsForm.AppField name="bannerImageObjectKey">
                  {(field) => (
                    <field.TextField
                      label="Banner image key"
                      placeholder="Opcional"
                    />
                  )}
                </newsForm.AppField>
              </div>
              <newsForm.AppForm>
                <newsForm.SubmitButton className="w-full">
                  Publicar articulo
                </newsForm.SubmitButton>
              </newsForm.AppForm>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle>Articulos recientes</CardTitle>
            <CardDescription>
              Cada nueva publicacion reemplaza la notificacion anterior del
              mismo contenido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {newsQuery.data?.length ? (
              newsQuery.data.map((item) => (
                <AdminNotificationCard
                  key={item.id}
                  badgeLabel={
                    item.status === "published" ? "Publicado" : "Archivado"
                  }
                  description={item.summary || "Sin resumen para la bandeja."}
                  expirationAt={item.expirationAt}
                  publishedAt={item.publishedAt}
                  title={item.title}
                />
              ))
            ) : (
              <EmptyAdminState copy="Todavia no se publicaron articulos manuales." />
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
