import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  comicAdminEditFormSchema,
  createDeferredMediaSelectionFromExistingIds,
} from "@/lib/deferred-media";
import { getClientErrorMessage, orpc, orpcClient } from "@/lib/orpc";

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
  const confirm = useConfirm();
  const mutation = useMutation(orpc.comic.admin.edit.mutationOptions());
  const { terms: prerequisiteTerms } = data.prerequisites;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const oldComic = data.oldComic!;
  const terms = Object.groupBy(oldComic.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldComic.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      coverImageSelection: createDeferredMediaSelectionFromExistingIds(
        oldComic.coverMedia?.id ? [oldComic.coverMedia.id] : []
      ),
      creatorId: oldComic.creatorId ?? null,
      creatorLink: oldComic.creatorLink,
      creatorName: oldComic.creatorName,
      documentStatus: oldComic.status,
      id: oldComic.id,
      manualEngagementQuestions:
        oldComic.engagementOverrides?.map((item) => item.text) ?? [],
      mediaSelection: createDeferredMediaSelectionFromExistingIds(
        oldComic.media?.map((item) => item.id) ?? []
      ),
      premiumLinks: oldComic.premiumLinks ?? "",
      seriesId: oldComic.seriesId ?? null,
      seriesOrder: oldComic.seriesOrder ?? 0,
      seriesTitle: "",
      status: terms.status?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      thumbnailImageCount: 1 as 1 | 4,
      title: oldComic.title,
      translatorId: oldComic.translatorId ?? null,
      type: "comic" as const,
    },
    onSubmit: async (formData) => {
      const slugCheck = await orpcClient.comic.admin.checkSlug({
        excludeId: formData.value.id,
        title: formData.value.title,
      });

      if (slugCheck.duplicate) {
        const isConfirmed = await confirm({
          cancelText: "Cancelar",
          confirmText: "Usar slug alternativo",
          description: `Ya existe "${slugCheck.existingTitle}" con el slug "${slugCheck.baseSlug}". Si continuas, se guardara como "${slugCheck.slug}".`,
          title: "Slug duplicado",
        });

        if (!isConfirmed) {
          return;
        }
      }

      await toast
        .promise(
          mutation.mutateAsync({
            ...formData.value,
            acceptSlugDeduplication: slugCheck.duplicate || undefined,
          }),
          {
            error: (error) => ({
              duration: 10_000,
              message: `Error al editar comic: ${getClientErrorMessage(error)}`,
            }),
            loading: "Editando comic...",
            success: "Comic editado!",
          }
        )
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.comic.admin.getDashboardList.queryOptions()
      );
      navigate({ to: "/admin/comics" });
    },
    validators: {
      onSubmit: comicAdminEditFormSchema,
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <h1 className="font-semibold text-2xl">Editar Comic</h1>
      <div className="space-y-4">
        <form.AppForm>
          <ComicFormFields
            series={data.prerequisites.series}
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
