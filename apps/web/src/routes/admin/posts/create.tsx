import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { DOCUMENT_STATUSES } from "@repo/shared/constants";
import { postCreateSchema } from "@repo/shared/schemas";
import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { PostFormFields } from "@/components/admin/posts/post-form-fields";
import type { PostProps } from "@/components/posts/post-components";
import { PostPage } from "@/components/posts/post-components";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/posts/create")({
  component: RouteComponent,
  loader: async () => await orpcClient.post.admin.createPostPrerequisites(),
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { terms } = data;
  const navigate = useNavigate();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      adsLinks: "",
      censorship: "",
      changelog: "",
      content: "",
      creatorLink: "",
      creatorName: "",
      documentStatus: "draft" as (typeof DOCUMENT_STATUSES)[number],
      engine: "",
      graphics: "",
      languages: [] as string[],
      manualEngagementQuestions: [] as string[],
      mediaIds: [] as string[],
      platforms: [] as string[],
      premiumLinks: "",
      status: "",
      tags: [] as string[],
      title: "",
      type: "post" as const,
      version: "",
    },
    onSubmit: async (formData) => {
      try {
        await toast
          .promise(orpcClient.post.admin.create(formData.value), {
            error: (error) => ({
              message: `Error al crear post: ${error}`,
            }),
            loading: "Creando post...",
            success: "Post creado!",
          })
          .unwrap();

        navigate({
          reloadDocument: true,
          resetScroll: true,
          to: "/admin/posts/create",
        });
      } catch (error) {
        toast.error(`Error al crear post: ${error}`, {
          dismissible: true,
          duration: 10_000,
        });
      } finally {
        toast.dismiss("creating");
      }
    },
    validators: {
      onSubmit: postCreateSchema,
    },
  });

  const post = useStore(form.store, (state) => state.values);
  const mediaMap = new Map(mediaLibrary.map((item) => [item.id, item]));
  const selectedMediaKeys = post.mediaIds
    .map((mediaId) => mediaMap.get(mediaId)?.objectKey)
    .filter((objectKey): objectKey is string => objectKey !== undefined);

  const extractTemplate = async () => {
    try {
      const template = await navigator.clipboard.readText();
      const { creatorBlock, linksBlock, lore, tags } = parseTemplate(template);

      const tagIds: string[] = [];
      for (const tagName of tags) {
        const foundTag = terms.find(
          (term) =>
            term.taxonomy === "tag" &&
            term.name.toLowerCase() === tagName.toLowerCase()
        );
        if (foundTag) {
          tagIds.push(foundTag.id);
        }
      }

      const values = {
        adsLinks: form.getFieldValue("adsLinks"),
        content: form.getFieldValue("content"),
        creatorName: form.getFieldValue("creatorName"),
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
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Crear Post</h1>
        <Button onClick={extractTemplate} type="button" variant="outline">
          Extraer desde plantilla
        </Button>
      </div>
      <div className="space-y-4">
        <form.AppForm>
          <PostFormFields terms={terms} />
          <div className="flex flex-row gap-4">
            <form.SubmitButton className="flex-1">Crear</form.SubmitButton>
            <Preview
              post={{
                ...post,
                createdAt: new Date(),
                engagementPrompts: post.manualEngagementQuestions.map(
                  (text, index) => ({
                    id: `preview-${index}`,
                    source: "manual" as const,
                    tagTermId: null,
                    text,
                  })
                ),
                id: "0",
                imageObjectKeys: selectedMediaKeys,
                likes: 0,
                premiumLinksAccess: { status: "no_premium_links" as const },
                terms: [
                  ...post.platforms,
                  ...post.tags,
                  ...post.languages,
                  post.censorship,
                  post.engine,
                  post.status,
                  post.graphics,
                ]
                  .map((term) => terms.find((item) => item.id === term))
                  .filter((term) => term !== undefined),
                updatedAt: new Date(),
                views: 0,
              }}
            />
          </div>
        </form.AppForm>
      </div>
    </form>
  );
}

function Preview({ post }: { post: PostProps }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger
        render={<Button className="flex-1" type="button" variant="secondary" />}
      >
        Vista Previa
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs" />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup className="data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-scroll rounded-xl bg-background p-4 text-sm outline-none ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-300">
          <PostPage post={post} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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

  const creatorBlock = extract(/(\*\*CREADOR:[\s\S]*?\)\s*)\n\s*\n/i);
  const tagsRaw = extract(/\*\*GÃƒâ€°NEROS \/ TAGS:\*\*\s*([\s\S]*?)\n\s*\n/i);
  const linksBlock = extract(
    /(Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â\*\*\[JUEGOS PC\]\*\*Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â[\s\S]*?)\n\s*\nÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â/i
  );
  const cleanedLinksBlock = linksBlock.replaceAll(/Ã¢â€¢Â{5,}/g, "").trim();
  const lore = extract(
    /\*\*SINOPSIS \/ RESUMEN \/ LORE:\s*\*\*\s*\n\s*Ã¢â€¢Â+\s*\n([\s\S]*?)\n\s*Ã¢â€¢Â+/i
  );

  return {
    creatorBlock,
    linksBlock: cleanedLinksBlock,
    lore,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
  };
}
