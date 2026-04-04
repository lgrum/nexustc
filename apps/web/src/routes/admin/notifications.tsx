import {
  Calendar03Icon,
  Megaphone01Icon,
  News01Icon,
  Notification03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import * as z from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/admin/notifications")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Notificaciones",
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
  const announcementsQuery = useQuery(
    orpc.notification.admin.listGlobalAnnouncements.queryOptions()
  );
  const newsQuery = useQuery(
    orpc.notification.admin.listNewsArticles.queryOptions()
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
        toast.success("Artículo de staff publicado.");
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
          queryClient.invalidateQueries(
            orpc.notification.admin.listNewsArticles.queryOptions()
          ),
          queryClient.invalidateQueries({
            queryKey: ["notification-feed"],
          }),
        ]);
        toast.success("Elemento archivado.");
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
      <section className="overflow-hidden rounded-[2rem] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_58%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] p-6">
        <div className="flex items-center gap-2 text-primary">
          <HugeiconsIcon className="size-5" icon={Notification03Icon} />
          <span className="font-semibold text-sm uppercase tracking-[0.24em]">
            Centro editorial
          </span>
        </div>
        <h1 className="mt-3 font-[Lexend] font-bold text-3xl">
          Publica anuncios, noticias y alertas sin salir del panel
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-6">
          Desde aquí el equipo puede lanzar anuncios globales para toda la
          plataforma y artículos manuales ligados a juegos o comics concretos.
          El sistema ya reemplaza la noticia anterior del mismo título para
          evitar ruido en la bandeja del usuario.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                className="size-5 text-amber-400"
                icon={Megaphone01Icon}
              />
              Anuncio global
            </CardTitle>
            <CardDescription>
              Visible para toda la plataforma hasta su expiración.
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
                    label="Título"
                    placeholder="Nueva función, mantenimiento, aviso importante"
                    required
                  />
                )}
              </announcementForm.AppField>
              <announcementForm.AppField name="description">
                {(field) => (
                  <field.TextareaField
                    label="Descripción"
                    placeholder="Resume lo importante con el tono que verán los usuarios en la bandeja."
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
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                className="size-5 text-sky-400"
                icon={News01Icon}
              />
              Artículo manual por contenido
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
                    label="Título"
                    placeholder="Devlog, parche, anuncio comunitario"
                    required
                  />
                )}
              </newsForm.AppField>
              <newsForm.AppField name="summary">
                {(field) => (
                  <field.TextareaField
                    label="Resumen para la bandeja"
                    placeholder="Texto corto que aparecerá en la notificación."
                    rows={3}
                  />
                )}
              </newsForm.AppField>
              <newsForm.AppField name="body">
                {(field) => (
                  <field.TextareaField
                    label="Cuerpo del artículo"
                    placeholder="Redacta aquí la noticia completa."
                    rows={7}
                  />
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
                  Publicar noticia
                </newsForm.SubmitButton>
              </newsForm.AppForm>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle>Anuncios recientes</CardTitle>
            <CardDescription>
              Historial rápido de avisos globales activos o archivados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcementsQuery.data?.length ? (
              announcementsQuery.data.map((item) => (
                <AdminNotificationCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  badgeLabel={item.archivedAt ? "Archivado" : "Global"}
                  publishedAt={item.publishedAt}
                  expirationAt={item.expirationAt}
                  onArchive={
                    item.archivedAt
                      ? undefined
                      : () => archiveMutation.mutate({ id: item.id })
                  }
                  archiveDisabled={
                    archiveMutation.isPending || Boolean(item.archivedAt)
                  }
                />
              ))
            ) : (
              <EmptyAdminState copy="Todavía no se publicaron anuncios globales." />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle>Noticias manuales recientes</CardTitle>
            <CardDescription>
              Cada nuevo artículo reemplaza la notificación anterior del mismo
              contenido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {newsQuery.data?.length ? (
              newsQuery.data.map((item) => (
                <AdminNotificationCard
                  key={item.id}
                  title={item.title}
                  description={item.summary || "Sin resumen para la bandeja."}
                  badgeLabel={
                    item.status === "published" ? "Publicado" : "Archivado"
                  }
                  publishedAt={item.publishedAt}
                  expirationAt={item.expirationAt}
                />
              ))
            ) : (
              <EmptyAdminState copy="Todavía no se publicaron artículos manuales." />
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function AdminNotificationCard({
  archiveDisabled = false,
  badgeLabel,
  description,
  expirationAt,
  onArchive,
  publishedAt,
  title,
}: {
  archiveDisabled?: boolean;
  badgeLabel: string;
  description: string;
  expirationAt?: Date | null;
  onArchive?: () => void;
  publishedAt?: Date | null;
  title: string;
}) {
  return (
    <Card className="rounded-[1.35rem] border-border/70 bg-muted/20 py-0">
      <CardHeader className="gap-3 border-border/50 border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Badge className="rounded-full" variant="outline">
            {badgeLabel}
          </Badge>
          {expirationAt ? (
            <Badge className="rounded-full" variant="secondary">
              Expira {formatAdminDate(expirationAt)}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {onArchive ? (
          <CardAction>
            <Button
              disabled={archiveDisabled}
              onClick={onArchive}
              size="sm"
              variant="destructive"
            >
              Archivar
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-xs uppercase tracking-[0.18em]">
        <HugeiconsIcon className="size-4" icon={Calendar03Icon} />
        {publishedAt
          ? `Publicado ${formatAdminDate(publishedAt)}`
          : "Sin fecha"}
      </CardContent>
    </Card>
  );
}

function EmptyAdminState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-border/80 bg-muted/20 p-6 text-center text-muted-foreground text-sm">
      {copy}
    </div>
  );
}

function parseOptionalDate(value: string) {
  if (!value.trim()) {
    return;
  }

  return new Date(value);
}

function formatAdminDate(value: Date | string | null | undefined) {
  if (!value) {
    return "sin fecha";
  }

  return format(new Date(value), "PPp", {
    locale: es,
  });
}
