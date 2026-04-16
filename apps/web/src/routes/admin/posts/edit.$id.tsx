import { EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { PostFormFields } from "@/components/admin/posts/post-form-fields";
import { useAppForm } from "@/hooks/use-app-form";
import {
  createDeferredMediaSelectionFromExistingIds,
  postAdminEditFormSchema,
} from "@/lib/deferred-media";
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
  const prerequisiteTerms = data.prerequisites.terms;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const oldPost = data.oldPost!;
  const terms = Object.groupBy(oldPost.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldPost.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      changelog: oldPost.changelog ?? "",
      content: oldPost.content,
      creatorId: oldPost.creatorId ?? null,
      creatorLink: oldPost.creatorLink,
      creatorName: oldPost.creatorName,
      documentStatus: oldPost.status,
      earlyAccessEnabled:
        oldPost.earlyAccessEnabled ?? EARLY_ACCESS_DEFAULTS.enabled,
      engine: terms.engine?.[0]?.term.id ?? "",
      graphics: terms.graphics?.[0]?.term.id ?? "",
      id: oldPost.id,
      languages: terms.language?.map((term) => term.term.id) ?? [],
      manualEngagementQuestions:
        oldPost.engagementOverrides?.map((item) => item.text) ?? [],
      mediaSelection: createDeferredMediaSelectionFromExistingIds(
        oldPost.media?.map((item) => item.id) ?? []
      ),
      platforms: terms.platform?.map((term) => term.term.id) ?? [],
      premiumLinksAccessLevel: oldPost.premiumLinksAccessLevel ?? "auto",
      premiumLinks: oldPost.premiumLinks ?? "",
      status: terms.status?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      title: oldPost.title,
      type: "post" as const,
      vip12EarlyAccessHours:
        oldPost.vip12EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip12Hours,
      vip8EarlyAccessHours:
        oldPost.vip8EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip8Hours,
      version: oldPost.version ?? "",
    },
    onSubmit: async (formData) => {
      await toast
        .promise(mutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al editar post: ${error}`,
          }),
          loading: "Editando post...",
          success: "Post editado!",
        })
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.post.admin.getDashboardList.queryOptions()
      );
      navigate({ to: "/admin/posts" });
    },
    validators: {
      onSubmit: postAdminEditFormSchema,
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
      <h1 className="font-semibold text-2xl">Editar Post</h1>
      <div className="space-y-4">
        <form.AppForm>
          <PostFormFields terms={prerequisiteTerms} />
          <div>
            <form.SubmitButton className="w-full">Editar</form.SubmitButton>
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}
