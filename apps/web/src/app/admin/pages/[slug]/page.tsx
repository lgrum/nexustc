import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";
import type { StaticPageSlug } from "./client-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const PAGE_TITLES: Record<StaticPageSlug, string> = {
  about: "Sobre Nosotros",
  legal: "Aviso Legal",
  privacy: "Política de Privacidad",
  terms: "Términos y Condiciones",
};

export default async function Page({ params }: PageProps) {
  const { slug: slugParam } = await params;
  const slug = slugParam as StaticPageSlug;
  const data = await orpcClient.staticPage.getForEdit({ slug });
  const initialData = {
    content: data.content || "",
    title: data.title || PAGE_TITLES[slug] || "",
  };

  return <ClientPage initialData={initialData} slug={slug} />;
}
