import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  comicAdminFormSchema,
  createEmptyDeferredMediaSelection,
} from "@/lib/deferred-media";
import { getClientErrorMessage, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/comics/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.comic.admin.createComicPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { series, terms } = data;
  const confirm = useConfirm();
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      coverImageSelection: createEmptyDeferredMediaSelection(),
      creatorId: null as string | null,
      creatorLink: "",
      creatorName: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      earlyAccessEnabled: Boolean(EARLY_ACCESS_DEFAULTS.enabled),
      manualEngagementQuestions: [] as string[],
      mediaSelection: createEmptyDeferredMediaSelection(),
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
      vip12EarlyAccessHours: Number(EARLY_ACCESS_DEFAULTS.vip12Hours),
      vip8EarlyAccessHours: Number(EARLY_ACCESS_DEFAULTS.vip8Hours),
    },
    onSubmit: async (formData) => {
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

        await toast
          .promise(
            orpcClient.comic.admin.create({
              ...formData.value,
              acceptSlugDeduplication: slugCheck.duplicate || undefined,
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

        navigate({
          reloadDocument: true,
          resetScroll: true,
          to: "/admin/comics/create",
        });
      } catch (error) {
        toast.error(`Error al crear comic: ${getClientErrorMessage(error)}`, {
          dismissible: true,
          duration: 10_000,
        });
      } finally {
        toast.dismiss("creating");
      }
    },
    validators: {
      onSubmit: comicAdminFormSchema,
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
