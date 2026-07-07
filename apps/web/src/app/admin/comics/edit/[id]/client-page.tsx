"use client";

import { EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  comicAdminEditFormSchema,
  createDeferredMediaSelectionFromExistingIds,
} from "@/lib/deferred-media";
import { getClientErrorMessage, orpc, orpcClient } from "@/lib/orpc";

type OldComic = NonNullable<
  Awaited<ReturnType<typeof orpcClient.comic.admin.getEdit>>
>;
type Prerequisites = Awaited<
  ReturnType<typeof orpcClient.comic.admin.createComicPrerequisites>
>;

export function ClientPage({
  oldComic,
  prerequisites,
}: {
  oldComic: OldComic;
  prerequisites: Prerequisites;
}) {
  const confirm = useConfirm();
  const mutation = useMutation(orpc.comic.admin.edit.mutationOptions());
  const prerequisiteTerms = prerequisites.terms as unknown as ComponentProps<
    typeof ComicFormFields
  >["terms"];
  const router = useRouter();
  const queryClient = useQueryClient();

  const terms = Object.groupBy(oldComic.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldComic.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      coverImageSelection: createDeferredMediaSelectionFromExistingIds(
        oldComic.coverMedia?.id ? [oldComic.coverMedia.id] : []
      ),
      creatorId: oldComic.comicCreatorId ?? null,
      creatorLink: oldComic.creatorLink,
      creatorName: oldComic.creatorName,
      documentStatus: oldComic.status,
      earlyAccessEnabled:
        oldComic.earlyAccessEnabled ?? EARLY_ACCESS_DEFAULTS.enabled,
      id: oldComic.id,
      manualEngagementQuestions:
        oldComic.engagementOverrides?.map((item) => item.text) ?? [],
      mediaSelection: createDeferredMediaSelectionFromExistingIds(
        oldComic.media?.map((item) => item.id) ?? []
      ),
      premiumLinks: oldComic.premiumLinks ?? "",
      releasedAt: oldComic.releasedAt,
      seriesId: oldComic.seriesId ?? null,
      seriesOrder: oldComic.seriesOrder ?? 0,
      seriesTitle: "",
      status: terms.status?.[0]?.term.id ?? "",
      style: terms.style?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      thumbnailImageCount: 1 as 1 | 4,
      title: oldComic.title,
      translatorId: oldComic.translatorId ?? null,
      type: "comic" as const,
      vip12EarlyAccessHours:
        oldComic.vip12EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip12Hours,
      vip8EarlyAccessHours:
        oldComic.vip8EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip8Hours,
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
      router.push("/admin/comics");
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = comicAdminEditFormSchema.safeParse(value);
        return result.success ? undefined : result.error;
      },
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
            series={prerequisites.series}
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
