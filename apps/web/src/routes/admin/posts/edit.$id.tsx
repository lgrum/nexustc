import { postEditSchema } from "@repo/shared/schemas";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";

import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ImageEditor } from "@/components/admin/image-editor";
import type { ImageEditorRef } from "@/components/admin/image-editor";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/posts/edit/$id")({
  component: RouteComponent,
  gcTime: 0,
  loader: async ({ params }) => ({
    oldPost: await orpcClient.post.admin.getEdit(params.id),
    prerequisites: await orpcClient.post.admin.createPostPrerequisites(),
  }),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const mutation = useMutation(orpc.post.admin.edit.mutationOptions());
  const imagesMutation = useMutation(
    orpc.post.admin.editImages.mutationOptions()
  );
  const groupedTerms = Object.groupBy(
    data.prerequisites.terms,
    (item) => item.taxonomy
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const imageEditorRef = useRef<ImageEditorRef>(null);

  const oldPost = data.oldPost!;
  const terms = Object.groupBy(oldPost.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldPost.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      changelog: oldPost.changelog ?? "",
      content: oldPost.content,
      creatorLink: oldPost.creatorLink,
      creatorName: oldPost.creatorName,
      documentStatus: oldPost.status,
      engine: terms.engine?.[0]?.term.id ?? "",
      graphics: terms.graphics?.[0].term.id ?? "",
      id: oldPost.id,
      languages: terms.language?.map((term) => term.term.id) ?? [],
      manualEngagementQuestions:
        oldPost.engagementOverrides?.map((item) => item.text) ?? [],
      platforms: terms.platform?.map((term) => term.term.id) ?? [],
      premiumLinks: oldPost.premiumLinks ?? "",
      status: terms.status?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      title: oldPost.title,
      type: "post" as const,
      version: oldPost.version ?? "",
    },
    onSubmit: async (formData) => {
      const imagePayload = imageEditorRef.current?.getPayload();

      await toast
        .promise(
          (async () => {
            await mutation.mutateAsync(formData.value);
            if (imagePayload) {
              await imagesMutation.mutateAsync({
                newFiles:
                  imagePayload.newFiles.length > 0
                    ? imagePayload.newFiles
                    : undefined,
                order: imagePayload.order,
                postId: oldPost.id,
                type: "post",
              });
            }
          })(),
          {
            error: (error) => ({
              duration: 10_000,
              message: `Error al editar post: ${error}`,
            }),
            loading: "Editando post...",
            success: "Post editado!",
          }
        )
        .unwrap();
      await queryClient.invalidateQueries(
        orpc.post.admin.getDashboardList.queryOptions()
      );
      navigate({ to: "/admin/posts" });
    },
    validators: {
      onSubmit: postEditSchema,
    },
  });

  const adsLinks = useStore(form.store, (state) => state.values.adsLinks);
  const premiumLinks = useStore(
    form.store,
    (state) => state.values.premiumLinks
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Editar Post</CardTitle>
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
                    label: term.name,
                    value: term.id,
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
                    label: term.name,
                    value: term.id,
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
                    label: term.name,
                    value: term.id,
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
                    label: term.name,
                    value: term.id,
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
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="tags">
            {(field) => (
              <field.MultiSelectField
                label="Tags"
                options={
                  groupedTerms.tag?.map((term) => ({
                    label: term.name,
                    value: term.id,
                  })) ?? []
                }
              />
            )}
          </form.AppField>

          <form.AppField name="languages">
            {(field) => (
              <field.MultiSelectField
                label="Idiomas"
                options={
                  groupedTerms.language?.map((term) => ({
                    label: term.name,
                    value: term.id,
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
                  { label: "Publicar", value: "publish" },
                  { label: "Pendiente", value: "pending" },
                  { label: "Borrador", value: "draft" },
                  { label: "Basura", value: "trash" },
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

          <section className="col-span-2">
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
                  label="Changelog"
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

          <ImageEditor
            initialImageKeys={oldPost.imageObjectKeys ?? []}
            ref={imageEditorRef}
          />
        </CardContent>
        <CardFooter>
          <form.AppForm>
            <form.SubmitButton className="w-full">Editar</form.SubmitButton>
          </form.AppForm>
        </CardFooter>
      </Card>
    </form>
  );
}
