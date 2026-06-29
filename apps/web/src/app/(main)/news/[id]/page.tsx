import { getPublishedNewsArticleById } from "@repo/api/services/notification";
import { db } from "@repo/db";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import { getBucketUrl } from "@/lib/utils";

import { NewsArticleClient } from "./news-article-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function getArticle(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("news", `news:${id}`);

  const article = await getPublishedNewsArticleById(db, id);
  if (!article) {
    notFound();
  }

  return article;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);
  const imageUrl = article.bannerImageObjectKey
    ? getBucketUrl(article.bannerImageObjectKey)
    : undefined;
  const title = `NeXusTC - ${article.title}`;

  return {
    title,
    openGraph: {
      images: imageUrl ? [imageUrl] : undefined,
      title,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      images: imageUrl ? [imageUrl] : undefined,
      title,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const article = await getArticle(id);

  return <NewsArticleClient article={article} />;
}
