import type { PartialBlock } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { ImageAdd02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type React from "react";
import { toast } from "sonner";

import "@blocknote/shadcn/style.css";
import {
  MediaFolderBreadcrumbs,
  MediaFolderCard,
} from "@/components/admin/media-browser-shared";
import type { MediaLibraryItem } from "@/components/admin/media-browser-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  EMPTY_BLOCK_NOTE_DOCUMENT,
  parseBlockNoteValue,
  serializeBlockNoteValue,
} from "@/lib/blocknote";
import { orpc, orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

const IMAGE_FILE_ACCEPT =
  "image/avif,image/gif,image/jpeg,image/png,image/webp";

function createImageBlock(item: MediaLibraryItem): PartialBlock {
  return {
    props: {
      name: item.objectKey,
      url: getBucketUrl(item.objectKey),
    },
    type: "image",
  };
}

function isEmptyInlineBlock(block: { content?: unknown }) {
  return Array.isArray(block.content) && block.content.length === 0;
}

export function BlockNoteEditor({
  onChange,
  value = "",
  ...props
}: Omit<React.ComponentProps<typeof BlockNoteView>, "editor" | "onChange"> & {
  onChange?: (value: string) => void;
  value?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote({
    dictionary: es,
    initialContent: EMPTY_BLOCK_NOTE_DOCUMENT,
  });

  const handleEditorChange = useCallback(() => {
    onChange?.(serializeBlockNoteValue(editor));
  }, [editor, onChange]);

  useEffect(() => {
    const currentValue = serializeBlockNoteValue(editor);

    if (currentValue === value) {
      return;
    }

    editor.replaceBlocks(editor.document, parseBlockNoteValue(value, editor));
  }, [editor, value]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const normalizeButtonType = (element: Element) => {
      if (element instanceof HTMLButtonElement) {
        element.type = "button";
      }

      for (const button of element.querySelectorAll("button")) {
        button.type = "button";
      }
    };

    normalizeButtonType(container);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            normalizeButtonType(node);
          }
        }
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const embedImage = (item: MediaLibraryItem) => {
    const currentBlock = editor.getTextCursorPosition().block;
    const imageBlock = createImageBlock(item);

    if (isEmptyInlineBlock(currentBlock)) {
      editor.updateBlock(currentBlock, imageBlock);
    } else {
      editor.insertBlocks([imageBlock], currentBlock, "after");
    }

    onChange?.(serializeBlockNoteValue(editor));
  };

  return (
    <div>
      <div className="flex justify-end p-2">
        <BlockNoteMediaPicker onSelect={embedImage} />
      </div>
      <BlockNoteView
        editor={editor}
        onChange={handleEditorChange}
        ref={containerRef}
        {...props}
      />
    </div>
  );
}

function BlockNoteMediaPicker({
  onSelect,
}: {
  onSelect: (item: MediaLibraryItem) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MediaLibraryItem | null>(
    null
  );
  const deferredSearch = useDeferredValue(search);
  const browseQueryOptions = orpc.media.admin.browse.queryOptions(
    currentFolderId ? { input: { folderId: currentFolderId } } : {}
  );
  const listQueryOptions = orpc.media.admin.list.queryOptions();
  const { data: browseData } = useSuspenseQuery(browseQueryOptions);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) =>
      await orpcClient.media.admin.upload({
        files,
        folderId: currentFolderId,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir la imagen."
      );
    },
    onSuccess: async (uploadedMedia) => {
      await Promise.all([
        queryClient.invalidateQueries(listQueryOptions),
        queryClient.invalidateQueries(browseQueryOptions),
      ]);

      const [uploadedItem] = uploadedMedia;

      if (uploadedItem) {
        setSelectedItem({
          ...uploadedItem,
          usageCount: 0,
        });
      }
    },
  });

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

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = [...(event.target.files ?? [])].find((item) =>
      item.type.startsWith("image/")
    );

    event.target.value = "";

    if (!file) {
      return;
    }

    await uploadMutation.mutateAsync([file]);
  };

  const applySelection = () => {
    if (!selectedItem) {
      return;
    }

    onSelect(selectedItem);
    setOpen(false);
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setCurrentFolderId(null);
          setSearch("");
          setSelectedItem(null);
        }

        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" type="button" />}>
        <HugeiconsIcon className="size-4" icon={ImageAdd02Icon} />
        Insertar imagen
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle>Seleccionar imagen</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[72dvh] min-h-0 flex-col">
          <div className="border-b border-border/70 px-5 py-4 sm:px-6">
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/25 p-4">
              <MediaFolderBreadcrumbs
                breadcrumbs={browseData.breadcrumbs}
                onNavigateRoot={() => setCurrentFolderId(null)}
                onNavigateToFolder={(folderId) => setCurrentFolderId(folderId)}
              />

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

                <div className="relative w-full md:w-auto">
                  <Input
                    accept={IMAGE_FILE_ACCEPT}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    disabled={uploadMutation.isPending}
                    onChange={handleFileUpload}
                    type="file"
                  />
                  <Button
                    className="w-full md:w-auto"
                    disabled={uploadMutation.isPending}
                    type="button"
                    variant="outline"
                  >
                    {uploadMutation.isPending ? (
                      <Spinner className="size-4" />
                    ) : (
                      <HugeiconsIcon className="size-4" icon={ImageAdd02Icon} />
                    )}
                    Subir imagen
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
            {visibleFolders.length > 0 || visibleItems.length > 0 ? (
              <div className="space-y-6">
                {visibleFolders.length > 0 ? (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">Carpetas</div>
                      <Badge variant="secondary">{visibleFolders.length}</Badge>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                      <div className="font-medium text-sm">Archivos</div>
                      <Badge variant="secondary">{visibleItems.length}</Badge>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleItems.map((item) => {
                        const isSelected = selectedItem?.id === item.id;

                        return (
                          <button
                            aria-pressed={isSelected}
                            className={cn(
                              "group overflow-hidden rounded-xl border bg-card text-left transition-all",
                              isSelected
                                ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/30"
                                : "border-border/70 hover:border-primary/35"
                            )}
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
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
                                  variant={isSelected ? "default" : "secondary"}
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
              <div className="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/70 px-6 py-10 text-center text-sm text-muted-foreground">
                {normalizedSearch
                  ? "No hay carpetas ni media que coincidan con esa busqueda."
                  : "Esta carpeta todavia no tiene contenido."}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            disabled={!selectedItem}
            onClick={applySelection}
            type="button"
          >
            <HugeiconsIcon className="size-4" icon={ImageAdd02Icon} />
            Insertar seleccion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
