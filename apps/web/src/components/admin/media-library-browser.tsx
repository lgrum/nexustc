import { useSuspenseQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useMemo } from "react";

import {
  MediaFolderCard,
  normalizeMediaFolderValue,
  parseMediaFolderValue,
} from "@/components/admin/media-browser-shared";
import type { MediaLibraryItem } from "@/components/admin/media-browser-shared";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

type FolderOption = {
  label: string;
  value: string;
};

type MediaLibraryBrowserProps = {
  currentFolderId: string | null;
  folderOptions: FolderOption[];
  isMoving: boolean;
  normalizedSearch: string;
  onMoveMedia: (params: {
    mediaId: string;
    targetFolderId: string | null;
  }) => Promise<void>;
  onOpenFolder: (folderId: string | null) => void;
};

export function MediaLibraryBrowser({
  currentFolderId,
  folderOptions,
  isMoving,
  normalizedSearch,
  onMoveMedia,
  onOpenFolder,
}: MediaLibraryBrowserProps) {
  const browseQueryOptions = orpc.media.admin.browse.queryOptions(
    currentFolderId ? { input: { folderId: currentFolderId } } : {}
  );
  const { data: browseData } = useSuspenseQuery(browseQueryOptions);

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

  const hasVisibleEntries =
    visibleFolders.length > 0 || visibleItems.length > 0;

  if (!hasVisibleEntries) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center text-muted-foreground">
        {normalizedSearch
          ? "No hay carpetas ni archivos que coincidan con esa busqueda."
          : "Esta carpeta todavia no tiene contenido."}
      </div>
    );
  }

  return (
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
                onOpen={(folderId) => onOpenFolder(folderId)}
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
                isMoving={isMoving}
                item={item}
                key={item.id}
                onMove={async (targetFolderId) => {
                  await onMoveMedia({
                    mediaId: item.id,
                    targetFolderId,
                  });
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function MediaLibraryBrowserFallback() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="rounded-2xl border border-border/70 bg-card p-4"
              key={`folder-skeleton-${String(index)}`}
            >
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-3 h-7 w-32" />
              <div className="mt-6 flex gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              key={`media-skeleton-${String(index)}`}
            >
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MediaItemCard({
  folderOptions,
  isMoving,
  item,
  onMove,
}: {
  folderOptions: FolderOption[];
  isMoving: boolean;
  item: MediaLibraryItem;
  onMove: (folderId: string | null) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card flex flex-row">
      <div className="aspect-4/3 overflow-hidden bg-muted">
        <img
          alt={item.objectKey}
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
          loading="lazy"
          src={getBucketUrl(item.objectKey)}
        />
      </div>
      <div className="space-y-3 px-3 py-2">
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
