"use client";

import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { COMIC_EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  isRecoverableComicUploadSessionError,
  uploadDeferredComicSelection,
} from "@/lib/comic-page-upload-client";
import {
  comicAdminFormSchema,
  createComicMediaSelectionInput,
  createEmptyComicDeferredMediaSelection,
  createEmptyDeferredMediaSelection,
  isDeferredPendingMediaItem,
  resetComicUploadSessionSelection,
} from "@/lib/deferred-media";
import { getClientErrorMessage, orpcClient } from "@/lib/orpc";

type Prerequisites = Awaited<
  ReturnType<typeof orpcClient.comic.admin.createComicPrerequisites>
>;

export function ClientPage({
  prerequisites,
}: {
  prerequisites: Prerequisites;
}) {
  const { series } = prerequisites;
  const terms = prerequisites.terms as unknown as ComponentProps<
    typeof ComicFormFields
  >["terms"];
  const confirm = useConfirm();
  const router = useRouter();

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      comicUploadSessionId: undefined as string | undefined,
      coverImageSelection: createEmptyDeferredMediaSelection(),
      creatorId: null as string | null,
      creatorLink: "",
      creatorName: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      earlyAccessEnabled: Boolean(COMIC_EARLY_ACCESS_DEFAULTS.enabled),
      manualEngagementQuestions: [] as string[],
      mediaSelection: createEmptyComicDeferredMediaSelection(),
      premiumLinks: "",
      releasedAt: null as Date | null,
      seriesId: null as string | null,
      seriesOrder: 0,
      seriesTitle: "",
      status: "",
      style: "",
      tags: [] as string[],
      thumbnailImageCount: 1 as 1 | 4,
      title: "",
      translatorId: null as string | null,
      type: "comic" as const,
      vip12EarlyAccessHours: Number(COMIC_EARLY_ACCESS_DEFAULTS.vip8Hours),
      vip8EarlyAccessHours: Number(COMIC_EARLY_ACCESS_DEFAULTS.vip5Hours),
    },
    onSubmit: async (formData) => {
      let { comicUploadSessionId, mediaSelection } = formData.value;

      try {
        const slugCheck = await orpcClient.comic.admin.checkSlug({
          title: formData.value.title,
        });

        if (slugCheck.duplicate) {
          const isConfirmed = await confirm({
            cancelText: "Cancelar",
            confirmText: "Usar slug alternativo",
            description: `Ya existe "${slugCheck.existingTitle}" con el slug "${slugCheck.baseSlug}". Si continuas, se subira como "${slugCheck.slug}".`,
            title: "Slug duplicado",
          });

          if (!isConfirmed) {
            return;
          }
        }

        if (mediaSelection.some(isDeferredPendingMediaItem)) {
          if (!comicUploadSessionId) {
            const uploadSession =
              await orpcClient.comic.admin.beginCreateUpload({
                title: formData.value.title,
              });
            comicUploadSessionId = uploadSession.sessionId;
            form.setFieldValue("comicUploadSessionId", uploadSession.sessionId);
          }

          mediaSelection = await uploadDeferredComicSelection({
            onProgress: (completed, total) => {
              if (
                completed === 0 ||
                completed === total ||
                completed % 10 === 0
              ) {
                toast.loading(`Subiendo paginas ${completed}/${total}`, {
                  id: "comic-page-upload",
                });
              }
            },
            onSelectionChange: (selection) => {
              mediaSelection = selection;
              form.setFieldValue("mediaSelection", selection);
            },
            selection: mediaSelection,
            sessionId: comicUploadSessionId,
          });
        }
        toast.dismiss("comic-page-upload");

        await toast
          .promise(
            orpcClient.comic.admin.create({
              ...formData.value,
              acceptSlugDeduplication: slugCheck.duplicate || undefined,
              comicUploadSessionId,
              mediaSelection: createComicMediaSelectionInput(mediaSelection),
            }),
            {
              error: (error) => ({
                duration: 10_000,
                message: `Error al crear comic: ${getClientErrorMessage(error)}`,
              }),
              loading: "Creando comic...",
              success: "Comic creado!",
            }
          )
          .unwrap();

        form.reset();
        router.replace("/admin/comics/create");
        router.refresh();
      } catch (error) {
        if (isRecoverableComicUploadSessionError(error)) {
          comicUploadSessionId = undefined;
          mediaSelection = resetComicUploadSessionSelection(mediaSelection);
          form.setFieldValue("comicUploadSessionId", undefined);
          form.setFieldValue("mediaSelection", mediaSelection);
        }

        toast.error(`Error al crear comic: ${getClientErrorMessage(error)}`, {
          dismissible: true,
          duration: 10_000,
        });
      } finally {
        toast.dismiss("comic-page-upload");
        toast.dismiss("creating");
      }
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = comicAdminFormSchema.safeParse(value);
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
      <h1 className="font-semibold text-2xl">Crear Comic</h1>
      <div className="space-y-4">
        <form.AppForm>
          <ComicFormFields series={series} terms={terms} />
          <div>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}
