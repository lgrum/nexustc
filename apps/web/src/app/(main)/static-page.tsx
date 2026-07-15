import { db, eq, staticPage } from "@repo/db";
import { cacheLife, cacheTag } from "next/cache";

import { Markdown } from "@/components/markdown";

import { createPageMetadata } from "../seo";

type StaticPageSlug = "about" | "legal" | "privacy" | "terms";

const fallbackBySlug = {
  about: {
    heading: "Sobre Nosotros",
    title: "Sobre Nosotros",
  },
  legal: {
    heading: "Aviso Legal",
    title: "Aviso Legal",
  },
  privacy: {
    heading: "Política de Privacidad",
    title: "Política de Privacidad",
  },
  terms: {
    heading: "Términos y Condiciones",
    title: "Términos y Condiciones",
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
  return createPageMetadata({
    path: `/${slug}`,
    title: page?.title ?? fallbackBySlug[slug].title,
  });
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
