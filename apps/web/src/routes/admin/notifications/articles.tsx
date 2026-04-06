import { News01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AnyFieldApi } from "@tanstack/react-form";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";

import {
  AdminNotificationCard,
  EditorialDashboardHeader,
  EmptyAdminState,
  parseOptionalDate,
} from "@/components/admin/notifications/editorial-dashboard-shell";
import { ErrorField } from "@/components/forms/error-field";
import type { SelectFieldOption } from "@/components/forms/select-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );
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
  const mediaMap = new Map(mediaLibrary.map((item) => [item.id, item]));

  const newsForm = useAppForm({
    defaultValues: {
      bannerImageMediaId: "",
      body: "",
      contentId: "",
      expirationAt: "",
      publishedAt: "",
      summary: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      const bannerImageObjectKey = value.bannerImageMediaId
        ? mediaMap.get(value.bannerImageMediaId)?.objectKey
        : undefined;

      await createNewsMutation.mutateAsync({
        bannerImageObjectKey,
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
        bannerImageMediaId: z.string().max(255),
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
        description="Redacta articulos manuales para juegos o comics concretos. Cada publicacion se conserva en el historial y solo se bloquean duplicados exactos."
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
                  <SearchableContentField
                    field={field}
                    options={contentOptions}
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
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
              <newsForm.AppField name="bannerImageMediaId">
                {(field) => (
                  <field.MediaField
                    description="Selecciona una imagen opcional para usarla como banner del articulo."
                    label="Banner del articulo"
                    maxItems={1}
                  />
                )}
              </newsForm.AppField>
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
              El historial se mantiene completo para cada contenido.
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
      </section>
    </main>
  );
}

function SearchableContentField({
  field,
  options,
}: {
  field: AnyFieldApi;
  options: SelectFieldOption[];
}) {
  const [open, setOpen] = useState(false);
  const listId = `${field.name}-listbox`;
  const selectedValue =
    typeof field.state.value === "string" ? field.state.value : "";
  const selectedOption = options.find(
    (option) => option.value === selectedValue
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name}>
        Contenido objetivo
        <span className="text-red-500">*</span>
      </Label>
      <Popover
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);

          if (!nextOpen) {
            field.handleBlur();
          }
        }}
        open={open}
      >
        <PopoverTrigger
          aria-expanded={open}
          render={
            <button
              className={cn(
                "flex h-8 w-full select-none items-center justify-between gap-2 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50",
                !selectedOption && "text-muted-foreground"
              )}
              aria-controls={listId}
              aria-expanded={open}
              id={field.name}
              role="combobox"
              type="button"
            />
          }
        >
          <span className="truncate">
            {selectedOption?.label ?? "Buscar juego o comic..."}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {options.length}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--anchor-width) min-w-(--anchor-width) p-0"
        >
          <Command>
            <CommandInput placeholder="Buscar contenido..." />
            <CommandList id={listId}>
              <CommandEmpty>No se encontraron coincidencias.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    data-checked={selectedValue === option.value}
                    key={option.value}
                    onSelect={() => {
                      field.handleChange(option.value);
                      field.handleBlur();
                      setOpen(false);
                    }}
                    value={`${option.label} ${option.value}`}
                  >
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-muted-foreground text-xs">
        Escribe para filtrar entre {options.length} contenidos publicados.
      </p>
      <ErrorField field={field} />
    </div>
  );
}
