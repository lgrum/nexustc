"use client";

import { EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { PostFormFields } from "@/components/admin/posts/post-form-fields";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  createDeferredMediaSelectionFromExistingIds,
  postAdminEditFormSchema,
} from "@/lib/deferred-media";
import { getClientErrorMessage, orpc, orpcClient } from "@/lib/orpc";

type OldPost = NonNullable<
  Awaited<ReturnType<typeof orpcClient.post.admin.getEdit>>
>;
type Prerequisites = Awaited<
  ReturnType<typeof orpcClient.post.admin.createPostPrerequisites>
>;

export function ClientPage({
  oldPost,
  prerequisites,
}: {
  oldPost: OldPost;
  prerequisites: Prerequisites;
}) {
  const confirm = useConfirm();
  const mutation = useMutation(orpc.post.admin.edit.mutationOptions());
  const prerequisiteTerms = prerequisites.terms as unknown as ComponentProps<
    typeof PostFormFields
  >["terms"];
  const router = useRouter();
  const queryClient = useQueryClient();

  const terms = Object.groupBy(oldPost.terms, (item) => item.term.taxonomy);

  const form = useAppForm({
    defaultValues: {
      adsLinks: oldPost.adsLinks ?? "",
      censorship: terms.censorship?.[0]?.term.id ?? "",
      changelog: oldPost.changelog ?? "",
      content: oldPost.content,
      coverImageSelection: createDeferredMediaSelectionFromExistingIds(
        oldPost.coverMedia?.id ? [oldPost.coverMedia.id] : []
      ),
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
      releasedAt: oldPost.releasedAt,
      seriesId: oldPost.seriesId ?? null,
      seriesOrder: oldPost.seriesOrder ?? 0,
      seriesTitle: "",
      status: terms.status?.[0]?.term.id ?? "",
      tags: terms.tag?.map((term) => term.term.id) ?? [],
      thumbnailImageCount: (oldPost.thumbnailImageCount === 1 ? 1 : 4) as 1 | 4,
      title: oldPost.title,
      type: "post" as const,
      vip12EarlyAccessHours:
        oldPost.vip12EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip12Hours,
      vip8EarlyAccessHours:
        oldPost.vip8EarlyAccessHours ?? EARLY_ACCESS_DEFAULTS.vip8Hours,
      version: oldPost.version ?? "",
    },
    onSubmit: async (formData) => {
      const slugCheck = await orpcClient.post.admin.checkSlug({
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
              message: `Error al editar post: ${getClientErrorMessage(error)}`,
            }),
            loading: "Editando post...",
            success: "Post editado!",
          }
        )
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.post.admin.getDashboardList.queryOptions()
      );
      router.push("/admin/posts");
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = postAdminEditFormSchema.safeParse(value);
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
      <h1 className="font-semibold text-2xl">Editar Post</h1>
      <div className="space-y-4">
        <form.AppForm>
          <PostFormFields
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
