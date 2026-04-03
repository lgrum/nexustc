import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { comicCreateSchema } from "@repo/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ComicFormFields } from "@/components/admin/comics/comic-form-fields";
import { useAppForm } from "@/hooks/use-app-form";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/comics/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.comic.admin.createComicPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { terms } = data;
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      manualEngagementQuestions: [] as string[],
      mediaIds: [] as string[],
      premiumLinks: "",
      status: "",
      tags: [] as string[],
      title: "",
      type: "comic" as const,
    },
    onSubmit: async (formData) => {
      try {
        await toast
          .promise(orpcClient.comic.admin.create(formData.value), {
            error: (error) => ({
              duration: 10_000,
              message: `Error al crear comic: ${error}`,
            }),
            loading: "Creando comic...",
            success: "Comic creado!",
          })
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
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <h1 className="font-semibold text-2xl">Crear Comic</h1>
      <div className="space-y-4">
        <form.AppForm>
          <ComicFormFields terms={terms} />
          <div>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}
