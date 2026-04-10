import { ImageAdd02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useDeferredValue, useMemo, useState } from "react";
import type React from "react";
import { toast } from "sonner";

import {
  buildMediaFolderPathLabelMap,
  CreateMediaFolderDialog,
  MediaFolderBreadcrumbs,
  MediaFolderCard,
  normalizeMediaFolderValue,
  parseMediaFolderValue,
  ROOT_MEDIA_FOLDER_VALUE,
} from "@/components/admin/media-browser-shared";
import type { MediaLibraryItem } from "@/components/admin/media-browser-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/media/")({
  component: RouteComponent,
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const listQueryOptions = orpc.media.admin.list.queryOptions();
  const foldersQueryOptions = orpc.media.admin.listFolders.queryOptions();
  const browseQueryOptions = orpc.media.admin.browse.queryOptions(
    currentFolderId ? { folderId: currentFolderId } : {}
  );

  const { data: allMedia } = useSuspenseQuery(listQueryOptions);
  const { data: allFolders } = useSuspenseQuery(foldersQueryOptions);
  const { data: browseData } = useSuspenseQuery(browseQueryOptions);

  const folderPathLabels = useMemo(
    () => buildMediaFolderPathLabelMap(allFolders),
    [allFolders]
  );
  const folderOptions = useMemo(
    () => [
      {
        label: "Biblioteca / Raiz",
        value: ROOT_MEDIA_FOLDER_VALUE,
      },
      ...allFolders.map((folder) => ({
        label: folderPathLabels.get(folder.id) ?? folder.name,
        value: folder.id,
      })),
    ],
    [allFolders, folderPathLabels]
  );

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleFolders = useMemo(
    () =>
      normalizedSearch
        ? browseData.folders.filter((folder) =>
            folder.name.toLowerCase().includes(normalizedSearch)
          )
        : browseData.folders,
    [browseData.folders, normalizedSearch]
  );
  const visibleItems = useMemo(
    () =>
      normalizedSearch
        ? browseData.items.filter((item) =>
            item.objectKey.toLowerCase().includes(normalizedSearch)
          )
        : browseData.items,
    [browseData.items, normalizedSearch]
  );

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
      await Promise.all([
        queryClient.invalidateQueries(listQueryOptions),
        queryClient.invalidateQueries(browseQueryOptions),
      ]);

      toast.success(
        uploadedMedia.length === 1
          ? "Archivo subido a la carpeta actual."
          : `${uploadedMedia.length} archivos subidos a la carpeta actual.`
      );
    },
  });

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
      await Promise.all([
        queryClient.invalidateQueries(foldersQueryOptions),
        queryClient.invalidateQueries(browseQueryOptions),
      ]);
      toast.success("Carpeta creada.");
    },
  });

  const moveMediaMutation = useMutation({
    mutationFn: async ({
      folderId,
      mediaId,
    }: {
      folderId: string | null;
      mediaId: string;
    }) =>
      await orpcClient.media.admin.move({
        folderId,
        mediaIds: [mediaId],
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo mover la media."
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(listQueryOptions),
        queryClient.invalidateQueries(browseQueryOptions),
      ]);
      toast.success("Media movida.");
    },
  });

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

  const currentFolderLabel = browseData.currentFolder?.name ?? "la raiz";
  const hasVisibleEntries =
    visibleFolders.length > 0 || visibleItems.length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl">Biblioteca</h1>
            <p className="max-w-3xl text-muted-foreground text-sm leading-6">
              Organiza la media en carpetas virtuales y navega como si fuera un
              sistema de archivos: primero carpetas, luego archivos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Input
                accept="image/gif,image/jpeg,image/png,image/webp"
                className="absolute inset-0 cursor-pointer opacity-0"
                disabled={uploadMutation.isPending}
                multiple
                onChange={handleFileUpload}
                type="file"
              />
              <Button disabled={uploadMutation.isPending} type="button">
                {uploadMutation.isPending ? (
                  <Spinner className="size-4" />
                ) : (
                  <HugeiconsIcon className="size-4" icon={ImageAdd02Icon} />
                )}
                Subir a {currentFolderLabel}
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

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <Stat label="Archivos registrados" value={String(allMedia.length)} />
          <Stat label="Carpetas" value={String(allFolders.length)} />
          <Stat
            label="Con uso activo"
            value={String(
              allMedia.filter((item) => item.usageCount > 0).length
            )}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card/50 p-4">
        <MediaFolderBreadcrumbs
          breadcrumbs={browseData.breadcrumbs}
          onNavigateRoot={() => setCurrentFolderId(null)}
          onNavigateToFolder={(folderId) => setCurrentFolderId(folderId)}
        />

        <div className="relative max-w-md">
          <HugeiconsIcon
            className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
            icon={Search01Icon}
          />
          <Input
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar dentro de ${currentFolderLabel}`}
            value={search}
          />
        </div>
      </section>

      {hasVisibleEntries ? (
        <div className="space-y-6">
          {visibleFolders.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-xl">Carpetas</h2>
                <Badge variant="secondary">{visibleFolders.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleFolders.map((folder) => (
                  <MediaFolderCard
                    folder={folder}
                    key={folder.id}
                    onOpen={(folderId) => setCurrentFolderId(folderId)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {visibleItems.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-xl">Archivos</h2>
                <Badge variant="secondary">{visibleItems.length}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleItems.map((item) => (
                  <MediaItemCard
                    folderOptions={folderOptions}
                    isMoving={moveMediaMutation.isPending}
                    item={item}
                    key={item.id}
                    onMove={async (folderId) => {
                      await moveMediaMutation.mutateAsync({
                        folderId,
                        mediaId: item.id,
                      });
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center text-muted-foreground">
          {normalizedSearch
            ? "No hay carpetas ni archivos que coincidan con esa búsqueda."
            : "Esta carpeta todavía no tiene contenido."}
        </div>
      )}
    </div>
  );
}

function MediaItemCard({
  folderOptions,
  isMoving,
  item,
  onMove,
}: {
  folderOptions: {
    label: string;
    value: string;
  }[];
  isMoving: boolean;
  item: MediaLibraryItem;
  onMove: (folderId: string | null) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          alt={item.objectKey}
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
          loading="lazy"
          src={getBucketUrl(item.objectKey)}
        />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={item.usageCount > 0 ? "default" : "outline"}>
            {item.usageCount > 0
              ? `${item.usageCount} uso${item.usageCount === 1 ? "" : "s"}`
              : "Sin uso"}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(item.createdAt), {
              addSuffix: true,
              locale: es,
            })}
          </span>
        </div>

        <div className="break-all font-mono text-sm leading-5">
          {item.objectKey}
        </div>

        <div className="space-y-2">
          <div className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Mover a
          </div>
          <Select
            items={folderOptions}
            onValueChange={async (nextValue) => {
              const nextFolderId = parseMediaFolderValue(nextValue as string);
              const currentValue = normalizeMediaFolderValue(item.folderId);

              if ((nextValue as string) === currentValue) {
                return;
              }

              await onMove(nextFolderId);
            }}
            value={normalizeMediaFolderValue(item.folderId)}
          >
            <SelectTrigger className="w-full" disabled={isMoving}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {folderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
        {label}
      </div>
      <div className="mt-2 font-semibold text-2xl">{value}</div>
    </div>
  );
}
