import { ImageAdd02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import type React from "react";
import { toast } from "sonner";
import z from "zod";

import {
  buildMediaFolderBreadcrumbs,
  buildMediaFolderPathLabelMap,
  CreateMediaFolderDialog,
  MediaFolderBreadcrumbs,
  ROOT_MEDIA_FOLDER_VALUE,
} from "@/components/admin/media-browser-shared";
import {
  MediaLibraryBrowser,
  MediaLibraryBrowserFallback,
} from "@/components/admin/media-library-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { orpc, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/media/")({
  component: RouteComponent,
  validateSearch: z.object({
    folderId: z.string().optional(),
  }),
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const { folderId: routeFolderId } = Route.useSearch();
  const currentFolderId = routeFolderId ?? null;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const listQueryOptions = orpc.media.admin.list.queryOptions();
  const foldersQueryOptions = orpc.media.admin.listFolders.queryOptions();
  const browseQueryOptions = orpc.media.admin.browse.queryOptions(
    currentFolderId ? { input: { folderId: currentFolderId } } : {}
  );

  const { data: allMedia } = useSuspenseQuery(listQueryOptions);
  const { data: allFolders } = useSuspenseQuery(foldersQueryOptions);

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
  const currentFolder = useMemo(
    () =>
      currentFolderId
        ? (allFolders.find((folder) => folder.id === currentFolderId) ?? null)
        : null,
    [allFolders, currentFolderId]
  );
  const breadcrumbs = useMemo(
    () => buildMediaFolderBreadcrumbs(allFolders, currentFolderId),
    [allFolders, currentFolderId]
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
      targetFolderId,
      mediaId,
    }: {
      targetFolderId: string | null;
      mediaId: string;
    }) =>
      await orpcClient.media.admin.move({
        folderId: targetFolderId,
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

  const navigateToFolder = (nextFolderId: string | null) => {
    navigate({
      replace: false,
      resetScroll: false,
      search: () => ({
        folderId: nextFolderId ?? undefined,
      }),
    });
  };

  const currentFolderLabel = currentFolder?.name ?? "la raiz";
  const normalizedSearch = deferredSearch.trim().toLowerCase();

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
              parentLabel={currentFolder?.name ?? undefined}
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
          breadcrumbs={breadcrumbs}
          onNavigateRoot={() => navigateToFolder(null)}
          onNavigateToFolder={(nextFolderId) => navigateToFolder(nextFolderId)}
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

      <Suspense fallback={<MediaLibraryBrowserFallback />}>
        <MediaLibraryBrowser
          currentFolderId={currentFolderId}
          folderOptions={folderOptions}
          isMoving={moveMediaMutation.isPending}
          normalizedSearch={normalizedSearch}
          onMoveMedia={async ({ mediaId, targetFolderId }) => {
            await moveMediaMutation.mutateAsync({
              mediaId,
              targetFolderId,
            });
          }}
          onOpenFolder={(nextFolderId) => navigateToFolder(nextFolderId)}
        />
      </Suspense>
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
