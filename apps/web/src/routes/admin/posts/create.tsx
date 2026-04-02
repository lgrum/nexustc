import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { postCreateSchema } from "@repo/shared/schemas";
import { useStore } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { toast } from "sonner";

import { PostFormFields } from "@/components/admin/posts/post-form-fields";
import { SortableGrid } from "@/components/admin/sortable-grid";
import type { PostProps } from "@/components/posts/post-components";
import { PostPage } from "@/components/posts/post-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppForm } from "@/hooks/use-app-form";
import { useMultipleFileUpload } from "@/hooks/use-multiple-file-upload";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/posts/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.post.admin.createPostPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { terms } = data;
  const { selectedFiles, setSelectedFiles, handleFileChange, removeFile } =
    useMultipleFileUpload();
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      changelog: "",
      content: "",
      creatorLink: "",
      creatorName: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      engine: "",
      graphics: "",
      languages: [] as string[],
      manualEngagementQuestions: [] as string[],
      platforms: [] as string[],
      premiumLinks: "",
      status: "",
      tags: [] as string[],
      title: "",
      type: "post" as const,
      version: "",
    },
    onSubmit: async (formData) => {
      try {
        await toast
          .promise(
            orpcClient.post.admin.create({
              ...formData.value,
              files: selectedFiles,
            }),
            {
              error: (error) => ({
                message: `Error al crear post: ${error}`,
              }),
              loading: "Creando post...",
              success: "Post creado!",
            }
          )
          .unwrap();

        navigate({
          reloadDocument: true,
          resetScroll: true,
          to: "/admin/posts/create",
        });
      } catch (error) {
        toast.error(`Error al crear post: ${error}`, {
          dismissible: true,
          duration: 10_000,
        });
      } finally {
        toast.dismiss("uploading");
        toast.dismiss("creating");
      }
    },
    validators: {
      onSubmit: postCreateSchema,
    },
  });

  const post = useStore(form.store, (state) => state.values);

  const extractTemplate = async () => {
    try {
      const template = await navigator.clipboard.readText();
      const { lore, tags, creatorBlock, linksBlock } = parseTemplate(template);

      const tagIds: string[] = [];
      for (const tagName of tags) {
        const foundTag = terms.find(
          (term) =>
            term.taxonomy === "tag" &&
            term.name.toLowerCase() === tagName.toLowerCase()
        );
        if (foundTag) {
          tagIds.push(foundTag.id);
        }
      }

      const values = {
        adsLinks: form.getFieldValue("adsLinks"),
        content: form.getFieldValue("content"),
        creatorName: form.getFieldValue("creatorName"),
        tags: form.getFieldValue("tags"),
      };

      form.setFieldValue("creatorName", creatorBlock ?? values.creatorName);
      form.setFieldValue("content", lore ?? values.content);
      form.setFieldValue("adsLinks", linksBlock ?? values.adsLinks);
      form.setFieldValue("tags", tagIds.length > 0 ? tagIds : values.tags);
    } catch (error) {
      toast.error(`No se pudo leer el portapapeles: ${error}`);
    }
  };

  return (
    <form
      className="relative flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Crear Post</h1>
        <Button onClick={extractTemplate} type="button" variant="outline">
          Extraer desde plantilla
        </Button>
      </div>
      <div className="space-y-4">
        <form.AppForm>
          <PostFormFields
            terms={terms}
            mediaSection={
              <section className="col-span-2">
                <Label htmlFor="file-upload">Subir imÃ¡genes</Label>
                <Input
                  accept="image/*"
                  className="mt-1 w-full"
                  id="file-upload"
                  multiple
                  name="file-upload"
                  onChange={async (e) => {
                    await toast.promise(handleFileChange(e), {
                      error: (error) =>
                        `Error al convertir imÃ¡genes: ${error}`,
                      loading: "Convirtiendo imÃ¡genes...",
                      success: "ImÃ¡genes convertidas!",
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
          />
          <div className="flex flex-row gap-4">
            <form.SubmitButton className="flex-1">Crear</form.SubmitButton>
            <Preview
              post={{
                ...post,
                createdAt: new Date(),
                engagementPrompts: post.manualEngagementQuestions.map(
                  (text, index) => ({
                    id: `preview-${index}`,
                    source: "manual" as const,
                    tagTermId: null,
                    text,
                  })
                ),
                id: "0",
                imageObjectKeys: selectedFiles.map(URL.createObjectURL),
                likes: 0,
                premiumLinksAccess: { status: "no_premium_links" as const },
                terms: [
                  ...post.platforms,
                  ...post.tags,
                  ...post.languages,
                  post.censorship,
                  post.engine,
                  post.status,
                  post.graphics,
                ]
                  .map((term) => terms.find((item) => item.id === term))
                  .filter((term) => term !== undefined),
                updatedAt: new Date(),
                views: 0,
              }}
            />
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}

function Preview({ post }: { post: PostProps }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger
        render={<Button className="flex-1" type="button" variant="secondary" />}
      >
        Vista Previa
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs" />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup className="data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-scroll rounded-xl bg-background p-4 text-sm outline-none ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-300 max-h-[90dvh]">
          <PostPage post={post} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type ParsedTemplate = {
  creatorBlock: string;
  tags: string[];
  linksBlock: string;
  lore: string;
};

export function parseTemplate(md: string): ParsedTemplate {
  const extract = (regex: RegExp): string => {
    const match = md.match(regex);
    return match ? match[1].trim() : "";
  };

  // 1. CREATOR BLOCK (as-is, no separators)
  const creatorBlock = extract(/(\*\*CREADOR:[\s\S]*?\)\s*)\n\s*\n/i);

  // 2. TAGS
  const tagsRaw = extract(/\*\*GÃ‰NEROS \/ TAGS:\*\*\s*([\s\S]*?)\n\s*\n/i);

  // 3. LINKS BLOCK (PC + ANDROID, headers preserved)
  const linksBlock = extract(
    /(â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\*\*\[JUEGOS PC\]\*\*â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•[\s\S]*?)\n\s*\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•/i
  );

  // Remove decorative separators inside links block
  const cleanedLinksBlock = linksBlock.replaceAll(/â•{5,}/g, "").trim();

  // 4. LORE (between header and closing separator)
  const lore = extract(
    /\*\*SINOPSIS \/ RESUMEN \/ LORE:\s*\*\*\s*\n\s*â•+\s*\n([\s\S]*?)\n\s*â•+/i
  );

  return {
    creatorBlock,
    linksBlock: cleanedLinksBlock,
    lore,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
  };
}
