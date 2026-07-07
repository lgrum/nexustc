import { listPublishedNewsArticles } from "@repo/api/services/notification";
import { db } from "@repo/db";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { createPageMetadata } from "../../seo";
import { NewsClient } from "./news-client";

const NEWS_LIMIT = 36;

export const metadata: Metadata = {
  ...createPageMetadata({
    description: "Noticias, anuncios y novedades oficiales de NeXusTC.",
    path: "/news",
    title: "Noticias",
  }),
};

async function getNewsArticles() {
  "use cache";
  cacheLife("hours");
  cacheTag("news");

  return await listPublishedNewsArticles(db, { limit: NEWS_LIMIT });
}

export default async function Page() {
  const articles = await getNewsArticles();

  return <NewsClient articles={articles} />;
}
