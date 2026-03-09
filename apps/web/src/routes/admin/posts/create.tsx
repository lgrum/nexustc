/** biome-ignore-all lint/performance/useTopLevelRegex: it's a one-off thing, no performance impact */
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { postCreateSchema } from "@repo/shared/schemas";
import { useStore } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { Activity, useState } from "react";
import { toast } from "sonner";
import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import { SortableGrid } from "@/components/admin/sortable-grid";
import { Markdown } from "@/components/markdown";
import type { PostProps } from "@/components/posts/post-components";
import { PostPage } from "@/components/posts/post-components";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/hooks/use-app-form";
import { useMultipleFileUpload } from "@/hooks/use-multiple-file-upload";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/posts/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.post.admin.createPostPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { selectedFiles, setSelectedFiles, handleFileChange, removeFile } =
    useMultipleFileUpload();
  const groupedTerms = Object.groupBy(data.terms, (item) => item.taxonomy);
  const navigate = useNavigate();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [tagsContent, setTagsContent] = useState("");
  const [tagsDialogVisible, setTagsDialogVisible] = useState(false);

  const form = useAppForm({
    validators: {
      onSubmit: postCreateSchema,
    },
    defaultValues: {
      type: "post" as const,
      title: "",
      version: "",
      censorship: "",
      status: "",
      engine: "",
      graphics: "",
      content: "",
      creatorName: "",
      creatorLink: "",
      adsLinks: "",
      premiumLinks: "",
      changelog: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      platforms: [] as string[],
      tags: [] as string[],
      languages: [] as string[],
      manualEngagementQuestions: [] as string[],
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
              loading: "Creando post...",
              success: "Post creado!",
              error: (error) => ({
                message: `Error al crear post: ${error}`,
              }),
            }
          )
          .unwrap();

        navigate({
          to: "/admin/posts/create",
          reloadDocument: true,
          resetScroll: true,
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
  });

  const adsLinks = useStore(form.store, (state) => state.values.adsLinks);
  const premiumLinks = useStore(
    form.store,
    (state) => state.values.premiumLinks
  );

  const post = useStore(form.store, (state) => state.values);

  const extractTags = () => {
    if (tagsContent.trim() === "") {
      setTagsDialogVisible(false);
      return;
    }

    const tags = tagsContent.split(",").map((tag) => tag.trim());
    const foundTags: string[] = [];
    const notFoundTags: string[] = [];

    for (const tag of tags) {
      const foundTag = groupedTerms.tag?.find(
        (t) => t.name.toLowerCase() === tag.toLowerCase()
      );
      if (foundTag) {
        foundTags.push(foundTag.id);
      } else {
        notFoundTags.push(tag);
      }
    }

    form.setFieldValue("tags", foundTags);
    setTagsContent("");
    setTagsDialogVisible(false);
    if (notFoundTags.length > 0) {
      toast.error(
        `No se encontraron los siguientes tags: ${notFoundTags.join(", ")}`,
        {
          dismissible: true,
          duration: Number.POSITIVE_INFINITY,
          closeButton: true,
        }
      );
    }
  };

  const extractTemplate = async () => {
    try {
      const template = await navigator.clipboard.readText();
      const { lore, tags, creatorBlock, linksBlock } = parseTemplate(template);

      const tagIds: string[] = [];
      for (const tagName of tags) {
        const foundTag = groupedTerms.tag?.find(
          (t) => t.name.toLowerCase() === tagName.toLowerCase()
        );
        if (foundTag) {
          tagIds.push(foundTag.id);
        }
      }

      const values = {
        creatorName: form.getFieldValue("creatorName"),
        content: form.getFieldValue("content"),
        adsLinks: form.getFieldValue("adsLinks"),
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
      <Card>
        <CardHeader>
          <CardTitle>Crear Post</CardTitle>
          <CardAction>
            <Button onClick={extractTemplate} type="button" variant="outline">
              Extraer desde plantilla
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <form.AppField name="title">
            {(field) => (
              <field.TextField label="Nombre" placeholder="Nombre" required />
            )}
          </form.AppField>

          <form.AppField name="version">
            {(field) => (
              <field.TextField label="Versión" placeholder="Versión" />
            )}
          </form.AppField>

          <div className="col-span-2 flex flex-row gap-4">
            <div className="flex-1 space-y-4">
              <form.AppField name="adsLinks">
                {(field) => (
                  <field.TextareaField
                    className="h-40 resize-none"
                    label="Links con Anuncios"
                  />
                )}
              </form.AppField>
            </div>
            <Separator orientation="vertical" />
            <div className="flex flex-1 flex-col gap-4">
              <form.AppField name="premiumLinks">
                {(field) => (
                  <field.TextareaField
                    className="h-40 resize-none"
                    label="Links Premium"
                  />
                )}
              </form.AppField>
            </div>
          </div>

          <div className="col-span-2 flex flex-row gap-4">
            <div className="flex-1 space-y-4 rounded-md bg-background p-4 [&_a]:text-primary">
              <Markdown>{adsLinks}</Markdown>
            </div>
            <Separator orientation="vertical" />
            <div className="flex-1 space-y-4 rounded-md bg-background p-4 [&_a]:text-primary">
              <Markdown>{premiumLinks}</Markdown>
            </div>
          </div>

          <div className="col-span-2">
            <GenerateMarkdownLinkDialog />
          </div>

          <form.AppField name="censorship">
            {(field) => (
              <field.SelectField
                label="Censura"
                options={
                  groupedTerms.censorship?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="status">
            {(field) => (
              <field.SelectField
                label="Estado"
                options={
                  groupedTerms.status?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="engine">
            {(field) => (
              <field.SelectField
                label="Motor"
                options={
                  groupedTerms.engine?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="graphics">
            {(field) => (
              <field.SelectField
                label="Gráficos"
                options={
                  groupedTerms.graphics?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="platforms">
            {(field) => (
              <field.MultiSelectField
                label="Plataformas"
                options={
                  groupedTerms.platform?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <div className="flex flex-row items-end gap-2">
            <form.AppField name="tags">
              {(field) => (
                <field.MultiSelectField
                  className="w-full"
                  label="Tags"
                  options={
                    groupedTerms.tag?.map((term) => ({
                      value: term.id,
                      label: term.name,
                    })) ?? []
                  }
                />
              )}
            </form.AppField>
            <Dialog
              onOpenChange={(value) => setTagsDialogVisible(value)}
              open={tagsDialogVisible}
            >
              <DialogTrigger render={<Button />}>Insertar Tags</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Insertar Tags</DialogTitle>
                </DialogHeader>
                <Textarea
                  onChange={(e) => setTagsContent(e.target.value)}
                  value={tagsContent}
                />
                <DialogFooter>
                  <Button onClick={extractTags}>Extraer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <form.AppField name="languages">
            {(field) => (
              <field.MultiSelectField
                label="Idiomas"
                options={
                  groupedTerms.language?.map((term) => ({
                    value: term.id,
                    label: term.name,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="documentStatus">
            {(field) => (
              <field.SelectField
                label="Estado del Documento"
                options={[
                  { value: "publish", label: "Publicar" },
                  { value: "pending", label: "Pendiente" },
                  { value: "draft", label: "Borrador" },
                  { value: "trash", label: "Basura" },
                ]}
                required
              />
            )}
          </form.AppField>

          <form.AppField name="creatorName">
            {(field) => (
              <field.TextField
                className="w-full"
                label="Nombre del Creador"
                value={field.state.value}
              />
            )}
          </form.AppField>

          <form.AppField name="creatorLink">
            {(field) => (
              <field.TextField
                className="w-full"
                label="Link del Creador"
                value={field.state.value}
              />
            )}
          </form.AppField>

          <section className="col-span-2 space-y-4">
            <form.AppField name="content">
              {(field) => (
                <field.TextareaField
                  className="w-full"
                  label="Sinopsis"
                  value={field.state.value}
                />
              )}
            </form.AppField>
            <form.AppField name="changelog">
              {(field) => (
                <field.TextareaField
                  className="w-full"
                  label="Cambios"
                  value={field.state.value}
                />
              )}
            </form.AppField>
            <form.AppField name="manualEngagementQuestions">
              {(field) => (
                <ManualEngagementQuestionsField
                  errors={field.state.meta.errors}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.AppField>
          </section>

          <section className="col-span-2">
            <Label htmlFor="file-upload">Subir imágenes</Label>
            <Input
              accept="image/*"
              className="mt-1 w-full"
              id="file-upload"
              multiple
              name="file-upload"
              onChange={async (e) => {
                await toast.promise(handleFileChange(e), {
                  loading: "Convirtiendo imágenes...",
                  success: "Imágenes convertidas!",
                  error: (error) => `Error al convertir imágenes: ${error}`,
                });
              }}
              type="file"
            />
            {selectedFiles.length > 0 && (
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
                    <Card
                      className={`cursor-grab ${isDragging ? "border-secondary" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`}
                      data-label={file.name}
                      key={file.name}
                      onClick={onSelect}
                      ref={ref as React.Ref<HTMLDivElement>}
                    >
                      <CardHeader>
                        <CardTitle className="text-wrap text-sm">
                          {file.name}
                        </CardTitle>
                        <CardDescription>
                          {(file.size / 1024).toFixed(2)} KB
                        </CardDescription>
                        <CardAction>
                          <Button
                            disabled={form.state.isSubmitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(file.name);
                            }}
                            size="icon"
                            variant="ghost"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} />
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex justify-center">
                        <img
                          alt={`Preview of ${file.name}`}
                          className="max-h-32 rounded object-contain"
                          src={URL.createObjectURL(file)}
                        />
                      </CardContent>
                    </Card>
                  )}
                </SortableGrid>
              </div>
            )}
          </section>
        </CardContent>
        <CardFooter className="flex flex-row gap-4">
          <form.AppForm>
            <form.SubmitButton className="flex-1">Crear</form.SubmitButton>
          </form.AppForm>
          <Button
            className="flex-1"
            onClick={() => setPreviewVisible(true)}
            type="button"
            variant="secondary"
          >
            Vista Previa
          </Button>
        </CardFooter>
      </Card>
      <Activity mode={previewVisible ? "visible" : "hidden"}>
        <Preview
          post={{
            ...post,
            id: "0",
            likes: 0,
            views: 0,
            imageObjectKeys: selectedFiles.map(URL.createObjectURL),
            createdAt: new Date(),
            terms: post.platforms
              .concat(post.tags, post.languages, [
                post.censorship,
                post.engine,
                post.status,
                post.graphics,
              ])
              .map((term) => data.terms.find((t) => t.id === term))
              .filter((term) => term !== undefined),
            premiumLinksAccess: { status: "no_premium_links" as const },
            engagementPrompts: post.manualEngagementQuestions.map(
              (text, index) => ({
                id: `preview-${index}`,
                text,
                source: "manual" as const,
                tagTermId: null,
              })
            ),
          }}
          setVisible={setPreviewVisible}
          visible={previewVisible}
        />
      </Activity>
    </form>
  );
}

function Preview({
  post,
  visible,
  setVisible,
}: {
  post: PostProps;
  visible: boolean;
  setVisible: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  if (!visible) {
    return;
  }

  return (
    <div className="absolute top-0 z-999999 flex h-full w-full items-center bg-black/80">
      <section className="w-[50%] translate-x-[50%] space-y-4">
        <Button onClick={() => setVisible(false)} size="icon" type="button">
          <HugeiconsIcon className="size-8" icon={Cancel01Icon} />
        </Button>
        <PostPage post={post} />
      </section>
    </div>
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
  const tagsRaw = extract(/\*\*GÉNEROS \/ TAGS:\*\*\s*([\s\S]*?)\n\s*\n/i);

  // 3. LINKS BLOCK (PC + ANDROID, headers preserved)
  const linksBlock = extract(
    /(═══════════════\*\*\[JUEGOS PC\]\*\*═══════════════[\s\S]*?)\n\s*\n═════════════════════════════════════════════/i
  );

  // Remove decorative separators inside links block
  const cleanedLinksBlock = linksBlock.replace(/═{5,}/g, "").trim();

  // 4. LORE (between header and closing separator)
  const lore = extract(
    /\*\*SINOPSIS \/ RESUMEN \/ LORE:\s*\*\*\s*\n\s*═+\s*\n([\s\S]*?)\n\s*═+/i
  );

  return {
    creatorBlock,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    linksBlock: cleanedLinksBlock,
    lore,
  };
}
