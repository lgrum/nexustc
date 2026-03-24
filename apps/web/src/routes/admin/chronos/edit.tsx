import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import MDEditor from "@uiw/react-md-editor";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SortableGrid } from "@/components/admin/sortable-grid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMultipleFileUpload } from "@/hooks/use-multiple-file-upload";
import { orpcClient, queryClient } from "@/lib/orpc";
import {
  convertImage,
  getBucketUrl,
  uploadBlobWithProgress,
} from "@/lib/utils";

type ChronosData = {
  stickyImageKey: string | null;
  headerImageKey: string | null;
  carouselImageKeys: string[];
  markdownContent: string;
  markdownImageKeys: string[];
};

export const Route = createFileRoute("/admin/chronos/edit")({
  component: RouteComponent,
  loader: async () => {
    const data = await orpcClient.chronos.getForEdit();
    return {
      initialData: {
        carouselImageKeys: data.carouselImageKeys ?? [],
        headerImageKey: data.headerImageKey,
        markdownContent: data.markdownContent,
        markdownImageKeys: data.markdownImageKeys ?? [],
        stickyImageKey: data.stickyImageKey,
      },
    };
  },
  staleTime: 0,
});

function RouteComponent() {
  const { initialData } = Route.useLoaderData();
  const [currentData, setCurrentData] = useState<ChronosData>(initialData);
  const [savedData, setSavedData] = useState<ChronosData>(initialData);
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [stickyImageFile, setStickyImageFile] = useState<File | null>(null);
  const [stickyImagePreview, setStickyImagePreview] = useState<string | null>(
    null
  );
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerImagePreview, setHeaderImagePreview] = useState<string | null>(
    null
  );
  const [uploadingStickyImage, setUploadingStickyImage] = useState(false);
  const [uploadingHeaderImage, setUploadingHeaderImage] = useState(false);
  const [uploadingCarouselImages, setUploadingCarouselImages] = useState(false);

  const carousel = useMultipleFileUpload();

  const [uploadingHelperImages, setUploadingHelperImages] = useState(false);

  const helperImages = useMemo(
    () =>
      currentData.markdownImageKeys.map((key) => ({
        key,
        url: getBucketUrl(key),
      })),
    [currentData.markdownImageKeys]
  );

  const hasChanges = useMemo(
    () =>
      currentData.stickyImageKey !== savedData.stickyImageKey ||
      currentData.headerImageKey !== savedData.headerImageKey ||
      JSON.stringify(currentData.carouselImageKeys) !==
        JSON.stringify(savedData.carouselImageKeys) ||
      currentData.markdownContent !== savedData.markdownContent ||
      JSON.stringify(currentData.markdownImageKeys) !==
        JSON.stringify(savedData.markdownImageKeys) ||
      stickyImageFile !== null ||
      headerImageFile !== null ||
      carousel.selectedFiles.length > 0,
    [
      currentData,
      savedData,
      stickyImageFile,
      headerImageFile,
      carousel.selectedFiles,
    ]
  );

  const blocker = useBlocker({
    enableBeforeUnload: true,
    shouldBlockFn: () => hasChanges,
    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === "blocked") {
      setBlockerDialogOpen(true);
    }
  }, [blocker.status]);

  const handleStickyImageSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files?.[0]) {
      const [file] = event.target.files;
      const converted = await convertImage(file, "webp", 0.8);
      setStickyImageFile(converted);
      setStickyImagePreview(URL.createObjectURL(converted));
    }
  };

  const handleHeaderImageSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files?.[0]) {
      const [file] = event.target.files;
      const converted = await convertImage(file, "webp", 0.8);
      setHeaderImageFile(converted);
      setHeaderImagePreview(URL.createObjectURL(converted));
    }
  };

  const uploadStickyImage = async (): Promise<string | null> => {
    if (!stickyImageFile) {
      return currentData.stickyImageKey;
    }

    setUploadingStickyImage(true);
    try {
      const [presignedUrl] = await orpcClient.chronos.getPresignedUrls({
        objects: [
          {
            contentLength: stickyImageFile.size,
            extension: "webp",
          },
        ],
        type: "sticky",
      });

      await uploadBlobWithProgress(
        stickyImageFile,
        presignedUrl.presignedUrl,
        () => {
          // Intentionally empty
        }
      );

      return presignedUrl.objectKey;
    } finally {
      setUploadingStickyImage(false);
    }
  };

  const uploadHeaderImage = async (): Promise<string | null> => {
    if (!headerImageFile) {
      return currentData.headerImageKey;
    }

    setUploadingHeaderImage(true);
    try {
      const [presignedUrl] = await orpcClient.chronos.getPresignedUrls({
        objects: [
          {
            contentLength: headerImageFile.size,
            extension: "webp",
          },
        ],
        type: "header",
      });

      await uploadBlobWithProgress(
        headerImageFile,
        presignedUrl.presignedUrl,
        () => {
          // Intentionally empty
        }
      );

      return presignedUrl.objectKey;
    } finally {
      setUploadingHeaderImage(false);
    }
  };

  const uploadCarouselImages = async (): Promise<string[]> => {
    if (carousel.selectedFiles.length === 0) {
      return currentData.carouselImageKeys;
    }

    setUploadingCarouselImages(true);
    try {
      const presignedUrls = await orpcClient.chronos.getPresignedUrls({
        objects: carousel.selectedFiles.map((file) => ({
          contentLength: file.size,
          extension: file.name.split(".").pop() ?? "webp",
        })),
        type: "carousel",
      });

      await Promise.all(
        presignedUrls.map((url, index) => {
          const file = carousel.selectedFiles[index];

          return fetch(url.presignedUrl, {
            body: file,
            headers: {
              "Content-Type": file.type ?? "application/octet-stream",
            },
            method: "PUT",
          }).then((response) => {
            if (!response.ok) {
              throw new Error(
                `Error al subir imagen ${file.name}: ${response.statusText}`
              );
            }
          });
        })
      );

      const newKeys = presignedUrls.map((url) => url.objectKey);
      return [...currentData.carouselImageKeys, ...newKeys];
    } finally {
      setUploadingCarouselImages(false);
    }
  };

  const handleHelperImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files?.length) {
      return;
    }

    const files = [...event.target.files];
    setUploadingHelperImages(true);

    try {
      const convertedFiles = await Promise.all(
        files.map((file) =>
          file.type.startsWith("image/gif")
            ? file
            : convertImage(file, "webp", 0.8)
        )
      );

      const presignedUrls = await orpcClient.chronos.getPresignedUrls({
        objects: convertedFiles.map((file) => ({
          contentLength: file.size,
          extension: file.name.split(".").pop() ?? "webp",
        })),
        type: "markdown",
      });

      await Promise.all(
        presignedUrls.map((url, index) =>
          uploadBlobWithProgress(
            convertedFiles[index],
            url.presignedUrl,
            () => {
              // Intentionally empty
            }
          )
        )
      );

      const newKeys = presignedUrls.map((url) => url.objectKey);

      setCurrentData((prev) => ({
        ...prev,
        markdownImageKeys: [...prev.markdownImageKeys, ...newKeys],
      }));
      toast.success(
        `${newKeys.length} imagen${newKeys.length > 1 ? "es subidas" : " subida"}`,
        { duration: 2000 }
      );
    } catch {
      toast.error("Error al subir imágenes", { duration: 3000 });
    } finally {
      setUploadingHelperImages(false);
      event.target.value = "";
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copiada al portapapeles", { duration: 1500 });
    } catch {
      toast.error("Error al copiar URL", { duration: 2000 });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const [stickyKey, headerKey, carouselKeys] = await Promise.all([
        uploadStickyImage(),
        uploadHeaderImage(),
        uploadCarouselImages(),
      ]);

      return orpcClient.chronos.update({
        carouselImageKeys: carouselKeys,
        headerImageKey: headerKey ?? undefined,
        markdownContent: currentData.markdownContent,
        markdownImageKeys: currentData.markdownImageKeys,
        stickyImageKey: stickyKey ?? undefined,
      });
    },
    onError: (error) => {
      toast.error(
        `Error al actualizar página de Chronos: ${error instanceof Error ? error.message : "Error desconocido"}`,
        { duration: 5000 }
      );
    },
    onSuccess: async (data) => {
      const newData = {
        carouselImageKeys: data.carouselImageKeys ?? [],
        headerImageKey: data.headerImageKey,
        markdownContent: data.markdownContent,
        markdownImageKeys: data.markdownImageKeys ?? [],
        stickyImageKey: data.stickyImageKey,
      };

      setSavedData(newData);
      setCurrentData(newData);
      setStickyImageFile(null);
      setStickyImagePreview(null);
      setHeaderImageFile(null);
      setHeaderImagePreview(null);
      carousel.setSelectedFiles([]);

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey;
          return typeof key === "string" && key.includes("chronos");
        },
      });

      toast.success("Página de Chronos actualizada correctamente", {
        duration: 3000,
      });
    },
  });

  const removeCarouselImage = (key: string) => {
    setCurrentData((prev) => ({
      ...prev,
      carouselImageKeys: prev.carouselImageKeys.filter((k) => k !== key),
    }));
  };

  const handleSave = () => {
    updateMutation.mutate();
  };

  const handleDiscard = () => {
    setCurrentData(savedData);
    setStickyImageFile(null);
    setStickyImagePreview(null);
    setHeaderImageFile(null);
    setHeaderImagePreview(null);
    carousel.setSelectedFiles([]);
  };

  const isUploading =
    uploadingStickyImage || uploadingHeaderImage || uploadingCarouselImages;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Editar Página Chronos</h1>

      <div className="flex flex-row items-center gap-4">
        <Button
          disabled={!hasChanges || isUploading}
          loading={updateMutation.isPending}
          onClick={handleSave}
        >
          Guardar Cambios
        </Button>
        <Button
          disabled={!hasChanges}
          onClick={handleDiscard}
          variant="outline"
        >
          Descartar Cambios
        </Button>
        {hasChanges && <Badge variant="outline">Cambios sin guardar</Badge>}
        {isUploading && <Badge variant="secondary">Subiendo imágenes...</Badge>}
      </div>

      {/* Sticky Image Section */}
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Imagen Lateral Izquierda</h2>
        <p className="text-muted-foreground text-sm">
          Imagen estática que aparece en el lado izquierdo de la página
        </p>

        {(stickyImagePreview || currentData.stickyImageKey) && (
          <div className="relative w-full max-w-sm">
            <img
              alt="Sticky preview"
              className="w-full rounded-md border object-cover"
              src={
                stickyImagePreview ??
                getBucketUrl(currentData.stickyImageKey ?? "")
              }
            />
            <Button
              className="absolute top-2 right-2"
              onClick={() => {
                setStickyImageFile(null);
                setStickyImagePreview(null);
                setCurrentData((prev) => ({ ...prev, stickyImageKey: null }));
              }}
              size="sm"
              variant="destructive"
            >
              Eliminar
            </Button>
          </div>
        )}

        <div>
          <Input
            accept="image/*"
            onChange={handleStickyImageSelect}
            type="file"
          />
        </div>
      </section>

      {/* Header Image Section */}
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Imagen de Cabecera</h2>
        <p className="text-muted-foreground text-sm">
          Imagen que aparece en la parte superior del contenido central
        </p>

        {(headerImagePreview || currentData.headerImageKey) && (
          <div className="relative w-full max-w-2xl">
            <img
              alt="Header preview"
              className="w-full rounded-lg border object-cover shadow-md"
              src={
                headerImagePreview ??
                getBucketUrl(currentData.headerImageKey ?? "")
              }
            />
            <Button
              className="absolute top-2 right-2"
              onClick={() => {
                setHeaderImageFile(null);
                setHeaderImagePreview(null);
                setCurrentData((prev) => ({ ...prev, headerImageKey: null }));
              }}
              size="sm"
              variant="destructive"
            >
              Eliminar
            </Button>
          </div>
        )}

        <div>
          <Input
            accept="image/*"
            onChange={handleHeaderImageSelect}
            type="file"
          />
        </div>
      </section>

      {/* Carousel Images Section */}
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Carrusel Derecho</h2>
        <p className="text-muted-foreground text-sm">
          Imágenes que se desplazarán verticalmente en el lado derecho
        </p>

        {/* Existing carousel images */}
        {currentData.carouselImageKeys.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {currentData.carouselImageKeys.map((key) => (
              <div className="relative" key={key}>
                <img
                  alt="Carousel"
                  className="aspect-video w-full rounded-md border object-cover"
                  src={getBucketUrl(key)}
                />
                <Button
                  className="absolute top-2 right-2"
                  onClick={() => removeCarouselImage(key)}
                  size="sm"
                  variant="destructive"
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* New carousel images */}
        {carousel.selectedFiles.length > 0 && (
          <div>
            <h3 className="mb-2 font-medium text-sm">Nuevas imágenes</h3>
            <SortableGrid
              className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
              getItemId={(file) => file.name}
              items={carousel.selectedFiles}
              setItems={carousel.setSelectedFiles}
            >
              {(file, _index, { ref, isDragging, isSelected, onSelect }) => (
                <div
                  className={`relative ${isDragging ? "border-secondary" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`}
                  key={file.name}
                  onClick={onSelect}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelect();
                    }
                  }}
                  ref={ref as React.Ref<HTMLDivElement>}
                  role="gridcell"
                  tabIndex={0}
                >
                  <img
                    alt={file.name}
                    className="aspect-video w-full rounded-md border object-cover"
                    src={URL.createObjectURL(file)}
                  />
                  <Button
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      carousel.removeFile(file.name);
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    ×
                  </Button>
                </div>
              )}
            </SortableGrid>
          </div>
        )}

        <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors hover:border-secondary">
          <HugeiconsIcon
            className="size-8 text-muted-foreground"
            icon={Upload01Icon}
          />
          <p className="text-muted-foreground text-sm">
            Arrastra imágenes aquí o haz clic para seleccionar
          </p>
          <Input
            accept="image/*"
            className="hidden"
            id="carousel-upload"
            multiple
            onChange={carousel.handleFileChange}
            type="file"
          />
          <Button
            onClick={() =>
              (
                document.querySelector(
                  "#carousel-upload"
                ) as HTMLInputElement | null
              )?.click()
            }
            type="button"
            variant="outline"
          >
            Seleccionar Imágenes
          </Button>
        </div>
      </section>

      {/* Markdown Editor Section */}
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Contenido Central</h2>
        <p className="text-muted-foreground text-sm">
          Contenido en formato Markdown que aparecerá en el centro de la página
        </p>

        <div data-color-mode="dark">
          <MDEditor
            height={600}
            onChange={(value) =>
              setCurrentData((prev) => ({
                ...prev,
                markdownContent: value ?? "",
              }))
            }
            preview="live"
            value={currentData.markdownContent}
          />
        </div>
      </section>

      {/* Helper Images Section */}
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Imágenes para Markdown</h2>
        <p className="text-muted-foreground text-sm">
          Sube imágenes para usarlas en el contenido Markdown. Haz clic en una
          imagen para copiar su URL.
        </p>

        <div className="flex items-center gap-4">
          <Input
            accept="image/*"
            className="max-w-xs"
            disabled={uploadingHelperImages}
            id="helper-upload"
            multiple
            onChange={handleHelperImageUpload}
            type="file"
          />
          {uploadingHelperImages && (
            <Badge variant="secondary">Subiendo...</Badge>
          )}
        </div>

        {helperImages.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            {helperImages.map((image) => (
              <button
                className="group relative cursor-pointer overflow-hidden rounded-md border transition-all hover:ring-2 hover:ring-primary"
                key={image.key}
                onClick={() => copyToClipboard(image.url)}
                type="button"
              >
                <img
                  alt="Helper"
                  className="aspect-square w-full object-cover"
                  src={image.url}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="font-medium text-sm text-white">
                    Copiar URL
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {helperImages.length === 0 && (
          <p className="text-muted-foreground text-sm italic">
            Las imágenes subidas aparecerán aquí
          </p>
        )}
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          setBlockerDialogOpen(open);
          if (!open && blocker.status === "blocked") {
            blocker.reset?.();
          }
        }}
        open={blockerDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. ¿Estás seguro de que quieres salir sin
              guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                blocker.reset?.();
                setBlockerDialogOpen(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                blocker.proceed?.();
                setBlockerDialogOpen(false);
              }}
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
