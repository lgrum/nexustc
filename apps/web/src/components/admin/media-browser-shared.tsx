import {
  Folder01Icon,
  Home01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { orpcClient } from "@/lib/orpc";

export type MediaLibraryItem = Awaited<
  ReturnType<typeof orpcClient.media.admin.list>
>[number];

export type MediaFolderItem = Awaited<
  ReturnType<typeof orpcClient.media.admin.listFolders>
>[number];

export type MediaBrowseResult = Awaited<
  ReturnType<typeof orpcClient.media.admin.browse>
>;

export type MediaBrowseFolder = MediaBrowseResult["folders"][number];

export const ROOT_MEDIA_FOLDER_VALUE = "__root__";

export function normalizeMediaFolderValue(folderId: string | null | undefined) {
  return folderId ?? ROOT_MEDIA_FOLDER_VALUE;
}

export function parseMediaFolderValue(value: string) {
  return value === ROOT_MEDIA_FOLDER_VALUE ? null : value;
}

export function buildMediaFolderPathLabelMap(folders: MediaFolderItem[]) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const labelCache = new Map<string, string>();

  const getLabel = (folderId: string, seen: Set<string>): string => {
    const cachedLabel = labelCache.get(folderId);

    if (cachedLabel) {
      return cachedLabel;
    }

    const folder = foldersById.get(folderId);

    if (!folder || seen.has(folderId)) {
      return "Biblioteca";
    }

    seen.add(folderId);

    const label: string = folder.parentId
      ? `${getLabel(folder.parentId, seen)} / ${folder.name}`
      : folder.name;

    labelCache.set(folderId, label);
    seen.delete(folderId);

    return label;
  };

  return new Map(
    folders.map((folder) => [folder.id, getLabel(folder.id, new Set<string>())])
  );
}

export function buildMediaFolderBreadcrumbs(
  folders: MediaFolderItem[],
  folderId: string | null
) {
  if (!folderId) {
    return [] satisfies MediaFolderItem[];
  }

  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const breadcrumbs: MediaFolderItem[] = [];
  let currentFolderId: string | null = folderId;
  const seen = new Set<string>();

  while (currentFolderId && !seen.has(currentFolderId)) {
    const folder = foldersById.get(currentFolderId);

    if (!folder) {
      break;
    }

    breadcrumbs.unshift(folder);
    seen.add(currentFolderId);
    currentFolderId = folder.parentId;
  }

  return breadcrumbs;
}

export function MediaFolderBreadcrumbs({
  breadcrumbs,
  onNavigateRoot,
  onNavigateToFolder,
}: {
  breadcrumbs: MediaBrowseResult["breadcrumbs"];
  onNavigateRoot: () => void;
  onNavigateToFolder: (folderId: string) => void;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {breadcrumbs.length === 0 ? (
            <BreadcrumbPage className="inline-flex items-center gap-1.5">
              <HugeiconsIcon className="size-4" icon={Home01Icon} />
              Biblioteca
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              render={<button type="button" />}
              className="inline-flex items-center gap-1.5"
              onClick={onNavigateRoot}
            >
              <HugeiconsIcon className="size-4" icon={Home01Icon} />
              Biblioteca
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {breadcrumbs.map((folder, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<button type="button" />}
                    onClick={() => onNavigateToFolder(folder.id)}
                  >
                    {folder.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function MediaFolderCard({
  folder,
  onOpen,
}: {
  folder: MediaBrowseFolder;
  onOpen: (folderId: string) => void;
}) {
  return (
    <button
      className="rounded-2xl border border-border/70 bg-linear-to-br from-card via-card to-muted/35 p-4 text-left transition-all hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5"
      onClick={() => onOpen(folder.id)}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-lg items-center flex gap-2">
          <HugeiconsIcon icon={Folder01Icon} />
          {folder.name}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-muted-foreground text-xs">
        <span>{folder.childFolderCount} subcarpetas</span>
        <span>{folder.mediaCount} archivos</span>
      </div>
    </button>
  );
}

export function CreateMediaFolderDialog({
  disabled = false,
  isPending = false,
  onCreate,
  parentLabel,
}: {
  disabled?: boolean;
  isPending?: boolean;
  onCreate: (name: string) => Promise<void>;
  parentLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    await onCreate(trimmedName);
    setName("");
    setOpen(false);
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setName("");
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            disabled={disabled || isPending}
            type="button"
            variant="outline"
          />
        }
      >
        <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
        Nueva carpeta
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear carpeta</DialogTitle>
          <DialogDescription>
            {parentLabel
              ? `La nueva carpeta se creara dentro de ${parentLabel}.`
              : "La nueva carpeta se creara en la raiz de la biblioteca."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="media-folder-name">
            Nombre
          </label>
          <Input
            id="media-folder-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Capturas, banners, promos..."
            value={name}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={isPending || name.trim().length === 0}
            onClick={async () => {
              await handleCreate();
            }}
            type="button"
          >
            Crear carpeta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
