import {
  ImageAdd02Icon,
  ImageDone01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import type React from "react";
import { toast } from "sonner";

import {
  CreateMediaFolderDialog,
  MediaFolderBreadcrumbs,
  MediaFolderCard,
} from "@/components/admin/media-browser-shared";
import type { MediaLibraryItem } from "@/components/admin/media-browser-shared";
import { SortableGrid } from "@/components/admin/sortable-grid";
import { ErrorField } from "@/components/forms/error-field";
import { useFieldContext } from "@/components/forms/form-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { orpc, orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

type MediaValue = string | string[];

type MediaFieldProps = {
  className?: string;
  description?: string;
  label: string;
  maxItems?: number;
  required?: boolean;
};

function normalizeValue(value: MediaValue | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== "");
  }

  if (typeof value === "string" && value !== "") {
    return [value];
  }

  return [];
}

function createSelectionUpdater(
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>,
  items: MediaLibraryItem[]
) {
  return (
    nextItems:
      | MediaLibraryItem[]
      | ((previousItems: MediaLibraryItem[]) => MediaLibraryItem[])
  ) => {
    const resolvedItems =
      typeof nextItems === "function" ? nextItems(items) : nextItems;

    setSelectedIds(resolvedItems.map((item) => item.id));
  };
}

function getSelectionLabel(count: number, isSingle: boolean) {
  if (isSingle) {
    return count === 1 ? "1 archivo seleccionado" : "Sin archivo seleccionado";
  }

  return `${count} seleccionados`;
}

export function MediaField({
  className,
  description,
  label,
  maxItems,
  required,
}: MediaFieldProps) {
  const field = useFieldContext<MediaValue>();
  const queryClient = useQueryClient();
  const listQueryOptions = orpc.media.admin.list.queryOptions();
  const { data: library } = useSuspenseQuery(listQueryOptions);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const browseQueryOptions = orpc.media.admin.browse.queryOptions(
    currentFolderId ? { folderId: currentFolderId } : {}
  );
  const { data: browseData } = useSuspenseQuery(browseQueryOptions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([]);

  const selectionLimit = maxItems ?? Number.POSITIVE_INFINITY;
  const isSingle = selectionLimit === 1;
  const selectedIds = normalizeValue(field.state.value);

  const mediaById = useMemo(
    () => new Map(library.map((item) => [item.id, item])),
    [library]
  );

  const selectedMedia = useMemo(
    () =>
      selectedIds
        .map((mediaId) => mediaById.get(mediaId))
        .filter((item): item is MediaLibraryItem => item !== undefined),
    [mediaById, selectedIds]
  );

  const draftSelectedMedia = useMemo(
    () =>
      draftSelectedIds
        .map((mediaId) => mediaById.get(mediaId))
        .filter((item): item is MediaLibraryItem => item !== undefined),
    [draftSelectedIds, mediaById]
  );

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleFolders = useMemo(
    () =>
      normalizedSearch === ""
        ? browseData.folders
        : browseData.folders.filter((folder) =>
            folder.name.toLowerCase().includes(normalizedSearch)
          ),
    [browseData.folders, normalizedSearch]
  );
  const visibleLibrary = useMemo(() => {
    const filteredLibrary =
      normalizedSearch === ""
        ? browseData.items
        : browseData.items.filter((item) =>
            item.objectKey.toLowerCase().includes(normalizedSearch)
          );

    return [...filteredLibrary].toSorted((left, right) => {
      const leftSelected = draftSelectedIds.includes(left.id) ? 1 : 0;
      const rightSelected = draftSelectedIds.includes(right.id) ? 1 : 0;

      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected;
      }

      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
  }, [browseData.items, draftSelectedIds, normalizedSearch]);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) =>
      await orpcClient.media.admin.createFolder({
        name,
        parentId: currentFolderId,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear la carpeta."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(browseQueryOptions);
      toast.success("Carpeta creada.");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) =>
      await orpcClient.media.admin.upload({
        files,
        folderId: currentFolderId,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir la media."
      );
    },
    onSuccess: async (uploadedMedia) => {
      queryClient.setQueryData(
        listQueryOptions.queryKey,
        (previousData: MediaLibraryItem[] | undefined) => {
          const merged = [
            ...uploadedMedia.map((item) => ({
              ...item,
              usageCount: 0,
            })),
            ...(previousData ?? []),
          ];
          const seen = new Set<string>();

          return merged.filter((item) => {
            if (seen.has(item.id)) {
              return false;
            }

            seen.add(item.id);
            return true;
          });
        }
      );

      await queryClient.invalidateQueries(browseQueryOptions);

      toast.success(
        uploadedMedia.length === 1
          ? "Media subida. Ya puedes seleccionarla."
          : `${uploadedMedia.length} archivos subidos. Ya puedes seleccionarlos.`
      );
    },
  });

  const toggleDraftSelection = (mediaId: string) => {
    setDraftSelectedIds((currentSelection) => {
      if (currentSelection.includes(mediaId)) {
        return currentSelection.filter((item) => item !== mediaId);
      }

      if (isSingle) {
        return [mediaId];
      }

      if (currentSelection.length >= selectionLimit) {
        toast.error(
          `Solo puedes seleccionar hasta ${selectionLimit} archivos.`
        );
        return currentSelection;
      }

      return [...currentSelection, mediaId];
    });
  };

  const commitSelection = () => {
    field.handleChange(
      isSingle ? (draftSelectedIds[0] ?? "") : draftSelectedIds
    );
    field.handleBlur();
    setDialogOpen(false);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = [...(event.target.files ?? [])].filter((file) =>
      file.type.startsWith("image/")
    );

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    await uploadMutation.mutateAsync(files);
  };

  const selectedCountLabel = getSelectionLabel(selectedMedia.length, isSingle);

  return (
    <div className={cn("col-span-2 space-y-2", className)}>
      <Label htmlFor={field.name}>
        {label}
        {!!required && <span className="text-red-500">*</span>}
      </Label>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setCurrentFolderId(null);
            setDraftSelectedIds(selectedIds.slice(0, selectionLimit));
            setSearch("");
          }

          setDialogOpen(nextOpen);
        }}
        open={dialogOpen}
      >
        <DialogTrigger
          render={
            <div
              className="group w-full rounded-2xl border border-border/70 bg-linear-to-br from-card via-card to-muted/40 p-4 text-left transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              id={field.name}
            />
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{selectedCountLabel}</Badge>
                {Number.isFinite(selectionLimit) && !isSingle ? (
                  <Badge variant="outline">Hasta {selectionLimit}</Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {description ??
                  "Abre la biblioteca, sube media nueva y ordena tu seleccion."}
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 py-2 font-medium text-sm shadow-xs">
              Abrir biblioteca
            </span>
          </div>

          {selectedMedia.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {selectedMedia.map((item, index) => (
                <div
                  className="overflow-hidden rounded-xl border border-border/60 bg-background"
                  key={item.id}
                >
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      alt={item.objectKey}
                      className="h-full w-full object-cover"
                      src={getBucketUrl(item.objectKey)}
                    />
                  </div>
                  <div className="p-2 text-xs text-muted-foreground">
                    Imagen {index + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
              No hay media seleccionada todavia.
            </div>
          )}
        </DialogTrigger>

        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-280 overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-280">
          <DialogHeader className="border-b border-border/70 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>

          <div className="flex max-h-[72dvh] min-h-0 flex-col">
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border/70 px-5 py-4 sm:px-6">
                <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                  <div className="flex flex-col gap-4">
                    <MediaFolderBreadcrumbs
                      breadcrumbs={browseData.breadcrumbs}
                      onNavigateRoot={() => setCurrentFolderId(null)}
                      onNavigateToFolder={(folderId) =>
                        setCurrentFolderId(folderId)
                      }
                    />

                    <div className="space-y-1">
                      <div className="font-medium text-sm">
                        Biblioteca de media
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Navega carpetas virtuales, sube archivos nuevos o
                        selecciona media existente.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <HugeiconsIcon
                          className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
                          icon={Search01Icon}
                        />
                        <Input
                          className="pl-9"
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={`Buscar dentro de ${browseData.currentFolder?.name ?? "la raiz"}`}
                          value={search}
                        />
                      </div>

                      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                        <div className="relative w-full md:w-auto">
                          <Input
                            accept="image/gif,image/jpeg,image/png,image/webp"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            disabled={uploadMutation.isPending}
                            multiple
                            onChange={handleFileUpload}
                            type="file"
                          />
                          <Button
                            className="w-full md:w-auto"
                            disabled={uploadMutation.isPending}
                            type="button"
                          >
                            {uploadMutation.isPending ? (
                              <Spinner className="size-4" />
                            ) : (
                              <HugeiconsIcon
                                className="size-4"
                                icon={ImageAdd02Icon}
                              />
                            )}
                            Subir media
                          </Button>
                        </div>

                        <CreateMediaFolderDialog
                          isPending={createFolderMutation.isPending}
                          onCreate={async (name) => {
                            await createFolderMutation.mutateAsync(name);
                          }}
                          parentLabel={browseData.currentFolder?.name}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                {visibleFolders.length > 0 || visibleLibrary.length > 0 ? (
                  <div className="space-y-6">
                    {visibleFolders.length > 0 ? (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-sm">Carpetas</div>
                          <Badge variant="secondary">
                            {visibleFolders.length}
                          </Badge>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {visibleFolders.map((folder) => (
                            <MediaFolderCard
                              folder={folder}
                              key={folder.id}
                              onOpen={(folderId) =>
                                setCurrentFolderId(folderId)
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {visibleLibrary.length > 0 ? (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-sm">Archivos</div>
                          <Badge variant="secondary">
                            {visibleLibrary.length}
                          </Badge>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {visibleLibrary.map((item) => {
                            const isSelected = draftSelectedIds.includes(
                              item.id
                            );

                            return (
                              <button
                                aria-pressed={isSelected}
                                className={cn(
                                  "group overflow-hidden rounded-2xl border bg-card text-left transition-all",
                                  isSelected
                                    ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/30"
                                    : "border-border/70 hover:border-primary/35"
                                )}
                                key={item.id}
                                onClick={() => toggleDraftSelection(item.id)}
                                type="button"
                              >
                                <div className="relative aspect-video overflow-hidden bg-muted">
                                  <img
                                    alt={item.objectKey}
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    loading="lazy"
                                    src={getBucketUrl(item.objectKey)}
                                  />
                                  <div className="absolute top-3 right-3">
                                    <Badge
                                      variant={
                                        isSelected ? "default" : "secondary"
                                      }
                                    >
                                      {isSelected ? "Seleccionado" : "Elegir"}
                                    </Badge>
                                  </div>
                                </div>

                                <div className="space-y-2 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline">
                                      {item.usageCount} uso
                                      {item.usageCount === 1 ? "" : "s"}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                      {new Date(
                                        item.createdAt
                                      ).toLocaleDateString()}
                                    </span>
                                  </div>

                                  <div className="line-clamp-2 font-mono text-xs leading-5 text-muted-foreground">
                                    {item.objectKey}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex min-h-60 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-10 text-center text-sm text-muted-foreground">
                    {normalizedSearch
                      ? "No hay carpetas ni media que coincidan con esa búsqueda."
                      : "Esta carpeta todavía no tiene contenido."}
                  </div>
                )}
              </div>
            </section>

            <section className="border-t border-border/70 bg-muted/20">
              <div className="border-b border-border/70 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Seleccion actual</div>
                    <p className="text-sm text-muted-foreground">
                      Ordena exactamente como quieres que se guarde.
                    </p>
                  </div>

                  <Badge variant="secondary">
                    {draftSelectedIds.length}
                    {isSingle ? "/1" : ""}
                  </Badge>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                {draftSelectedMedia.length > 0 ? (
                  <SortableGrid
                    className="flex flex-wrap gap-3"
                    getItemId={(item) => item.id}
                    items={draftSelectedMedia}
                    setItems={createSelectionUpdater(
                      setDraftSelectedIds,
                      draftSelectedMedia
                    )}
                  >
                    {(
                      item,
                      index,
                      { ref, isDragging, isSelected, onSelect }
                    ) => (
                      <Card
                        className={cn(
                          "w-28 cursor-grab overflow-hidden p-0 sm:w-32",
                          isDragging ? "border-secondary" : "",
                          isSelected ? "ring-2 ring-primary" : ""
                        )}
                        data-label={item.objectKey}
                        key={item.id}
                        onClick={onSelect}
                        ref={ref as React.Ref<HTMLDivElement>}
                      >
                        <div className="relative aspect-square overflow-hidden bg-muted">
                          <img
                            alt={item.objectKey}
                            className="h-full w-full object-cover"
                            src={getBucketUrl(item.objectKey)}
                          />
                          <Badge className="absolute top-2 right-2">
                            {index + 1}
                          </Badge>
                        </div>
                      </Card>
                    )}
                  </SortableGrid>
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 py-8 text-center text-sm text-muted-foreground">
                    Aun no seleccionaste media.
                  </div>
                )}
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button
              className="w-full sm:w-auto"
              onClick={commitSelection}
              type="button"
              variant="default"
            >
              <HugeiconsIcon className="size-4" icon={ImageDone01Icon} />
              Aplicar seleccion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ErrorField field={field} />
    </div>
  );
}
