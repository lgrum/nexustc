import { comicEditSchema } from "@repo/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { ImageEditor } from "@/components/admin/image-editor";
import type { ImageEditorRef } from "@/components/admin/image-editor";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/comics/edit/$id")({
  component: RouteComponent,
  gcTime: 0,
  loader: async ({ params }) => ({
    oldComic: await orpcClient.comic.admin.getEdit(params.id),
    prerequisites: await orpcClient.comic.admin.createComicPrerequisites(),
  }),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const mutation = useMutation(orpc.comic.admin.edit.mutationOptions());
  const imagesMutation = useMutation(
    orpc.comic.admin.editImages.mutationOptions()
  );
  const { terms: prerequisiteTerms } = data.prerequisites;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const imageEditorRef = useRef<ImageEditorRef>(null);

  const oldComic = data.oldComic!;
  const terms = Object.groupBy(oldComic.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldComic.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      documentStatus: oldComic.status,
      id: oldComic.id,
      manualEngagementQuestions:
        oldComic.engagementOverrides?.map((item) => item.text) ?? [],
      premiumLinks: oldComic.premiumLinks ?? "",
      status: terms.status?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      title: oldComic.title,
      type: "comic" as const,
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
                postId: oldComic.id,
                type: "comic",
              });
            }
          })(),
          {
            error: (error) => ({
              duration: 10_000,
              message: `Error al editar cómic: ${error}`,
            }),
            loading: "Editando cómic...",
            success: "Cómic editado!",
          }
        )
        .unwrap();
      await queryClient.invalidateQueries(
        orpc.comic.admin.getDashboardList.queryOptions()
      );
      navigate({ to: "/admin/comics" });
    },
    validators: {
      onSubmit: comicEditSchema,
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
      <h1 className="font-semibold text-2xl">Editar Cómic</h1>
      <div className="space-y-4">
        <form.AppForm>
          <ComicFormFields
            mediaSection={
              <ImageEditor
                initialImageKeys={oldComic.imageObjectKeys ?? []}
                ref={imageEditorRef}
              />
            }
            terms={prerequisiteTerms}
          />
          <div>
            <form.SubmitButton className="w-full">Editar</form.SubmitButton>
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}
