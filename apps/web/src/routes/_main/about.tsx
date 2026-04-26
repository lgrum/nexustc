import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "@/components/markdown";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/about")({
  component: RouteComponent,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.page?.title
          ? `NeXusTC - ${loaderData.page.title}`
          : "NeXusTC - Sobre Nosotros",
      },
    ],
  }),
  loader: async () => {
    const data = await orpcClient.staticPage.getBySlug({ slug: "about" });
    return { page: data };
  },
});

function RouteComponent() {
  const { page } = Route.useLoaderData();

  if (!page?.content) {
    return (
      <article className="prose dark:prose-invert px-4">
        <h1>Sobre Nosotros</h1>
        <p className="text-muted-foreground">
          El contenido de esta página aún no está disponible.
        </p>
      </article>
    );
  }

  return (
    <main className="flex justify-center">
      <article className="prose dark:prose-invert px-4">
        <Markdown>{page.content}</Markdown>
      </article>
    </main>
  );
}
