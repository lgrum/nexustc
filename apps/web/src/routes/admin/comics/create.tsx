import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { comicCreateSchema } from "@repo/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { SortableGrid } from "@/components/admin/sortable-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppForm } from "@/hooks/use-app-form";
import { useMultipleFileUpload } from "@/hooks/use-multiple-file-upload";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/comics/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.comic.admin.createComicPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { selectedFiles, setSelectedFiles, handleFileChange, removeFile } =
    useMultipleFileUpload();
  const { terms } = data;
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      manualEngagementQuestions: [] as string[],
      premiumLinks: "",
      status: "",
      tags: [] as string[],
      title: "",
      type: "comic" as const,
    },
    onSubmit: async (formData) => {
      try {
        await toast
          .promise(
            orpcClient.comic.admin.create({
              ...formData.value,
              files: selectedFiles,
            }),
            {
              error: (error) => ({
                duration: 10_000,
                message: `Error al crear comic: ${error}`,
              }),
              loading: "Creando comic...",
              success: "Comic creado!",
            }
          )
          .unwrap();

        navigate({
          reloadDocument: true,
          resetScroll: true,
          to: "/admin/comics/create",
        });
      } catch (error) {
        toast.error(`Error al crear comic: ${error}`, {
          dismissible: true,
          duration: 10_000,
        });
      } finally {
        toast.dismiss("uploading");
        toast.dismiss("creating");
      }
    },
    validators: {
      onSubmit: comicCreateSchema,
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <h1 className="font-semibold text-2xl">Crear Comic</h1>
      <div className="space-y-4">
        <form.AppForm>
          <ComicFormFields
            mediaSection={
              <section className="col-span-2">
                <Label htmlFor="file-upload">Subir imagenes</Label>
                <Input
                  accept="image/*"
                  className="mt-1 w-full"
                  id="file-upload"
                  multiple
                  name="file-upload"
                  onChange={async (e) => {
                    await toast.promise(handleFileChange(e), {
                      error: (error) => `Error al convertir imágenes: ${error}`,
                      loading: "Convirtiendo imágenes...",
                      success: "Imágenes convertidas!",
                    });
                  }}
                  type="file"
                />
                {selectedFiles.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <h3 className="font-semibold text-md">
                      Archivos seleccionados:
                    </h3>
                    <SortableGrid
                      className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6"
                      getItemId={(file) => file.name}
                      items={selectedFiles}
                      setItems={setSelectedFiles}
                    >
                      {(
                        file,
                        _index,
                        { ref, isDragging, isSelected, onSelect }
                      ) => (
                        <button
                          className={`cursor-grab rounded-xl border bg-card p-4 ${isDragging ? "border-secondary" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`}
                          data-label={file.name}
                          key={file.name}
                          onClick={onSelect}
                          ref={ref as React.Ref<HTMLButtonElement>}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <h3 className="text-sm text-wrap font-semibold">
                                {file.name}
                              </h3>
                              <p className="text-muted-foreground text-sm">
                                {(file.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                            <Button
                              disabled={form.state.isSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.name);
                              }}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} />
                            </Button>
                          </div>
                          <div className="flex justify-center px-2 pt-4">
                            <img
                              alt={`Preview of ${file.name}`}
                              className="max-h-32 rounded object-contain"
                              src={URL.createObjectURL(file)}
                            />
                          </div>
                        </button>
                      )}
                    </SortableGrid>
                  </div>
                ) : null}
              </section>
            }
            terms={terms}
          />
          <div>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}
