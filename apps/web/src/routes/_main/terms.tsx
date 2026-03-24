import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "@/components/markdown";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/terms")({
  component: RouteComponent,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.page?.title
          ? `NeXusTC - ${loaderData.page.title}`
          : "NeXusTC - Términos y Condiciones",
      },
    ],
  }),
  loader: async () => {
    const data = await orpcClient.staticPage.getBySlug({ slug: "terms" });
    return { page: data };
  },
});

function RouteComponent() {
  const { page } = Route.useLoaderData();

  if (!page?.content) {
    return (
      <article className="prose dark:prose-invert px-4">
        <h1>Términos y Condiciones</h1>
        <p className="text-muted-foreground">
          El contenido de esta página aún no está disponible.
        </p>
      </article>
    );
  }

  return (
    <article className="px-4">
      <Markdown>{page.content}</Markdown>
    </article>
  );
}
