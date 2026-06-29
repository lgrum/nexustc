import { db, eq, staticPage } from "@repo/db";
import { cacheLife, cacheTag } from "next/cache";

import { Markdown } from "@/components/markdown";

type StaticPageSlug = "about" | "legal" | "privacy" | "terms";

const fallbackBySlug = {
  about: {
    heading: "Sobre Nosotros",
    title: "NeXusTC - Sobre Nosotros",
  },
  legal: {
    heading: "Aviso Legal",
    title: "NeXusTC - Aviso Legal",
  },
  privacy: {
    heading: "Politica de Privacidad",
    title: "NeXusTC - Politica de Privacidad",
  },
  terms: {
    heading: "Terminos y Condiciones",
    title: "NeXusTC - Terminos y Condiciones",
  },
} as const;

export async function getStaticPage(slug: StaticPageSlug) {
  "use cache";
  cacheLife("max");
  cacheTag("static-pages", `static-page:${slug}`);

  const [page] = await db
    .select()
    .from(staticPage)
    .where(eq(staticPage.slug, slug))
    .limit(1);

  return page ?? null;
}

export async function getStaticPageMetadata(slug: StaticPageSlug) {
  const page = await getStaticPage(slug);
  return {
    title: page?.title ? `NeXusTC - ${page.title}` : fallbackBySlug[slug].title,
  };
}

export async function StaticPage({ slug }: { slug: StaticPageSlug }) {
  const page = await getStaticPage(slug);

  if (!page?.content) {
    return (
      <article className="prose dark:prose-invert px-4">
        <h1>{fallbackBySlug[slug].heading}</h1>
        <p className="text-muted-foreground">
          El contenido de esta pagina aun no esta disponible.
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
