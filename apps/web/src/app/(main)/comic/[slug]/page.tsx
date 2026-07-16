import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { createContentMetadata } from "@/app/seo";
import { orpcClient } from "@/lib/orpc";

import { ComicClient } from "./comic-client";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function getComicInput(idOrSlug: string) {
  return NANOID_PATTERN.test(idOrSlug)
    ? idOrSlug
    : { slug: idOrSlug, type: "comic" as const };
}

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

async function getAnonymousComic(idOrSlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("content", `content:${idOrSlug}`);

  return await orpcClient.post.getPostById(getComicInput(idOrSlug), {
    context: { cache: true },
  });
}

const getComic = cache(async (idOrSlug: string) => {
  const session = await auth.api.getSession({ headers: await headers() });

  let comic: Awaited<ReturnType<typeof orpcClient.post.getPostById>> | null =
    null;
  try {
    comic = session?.user
      ? await orpcClient.post.getPostById(getComicInput(idOrSlug))
      : await getAnonymousComic(idOrSlug);
  } catch (error) {
    if (getErrorCode(error) !== "NOT_FOUND") {
      throw error;
    }
  }

  if (comic?.type !== "comic") {
    notFound();
  }

  return comic;
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const comic = await getComic(slug);
  const title = comic.earlyAccess.isRestrictedView
    ? "NeXusTC - VIP Early Access"
    : `NeXusTC - ${comic.title}`;

  return createContentMetadata({
    canonicalPath: `/comic/${encodeURIComponent(comic.slug)}`,
    contentTitle: comic.title,
    identifier: comic.slug,
    pageTitle: title,
    type: "comic",
    updatedAt: comic.updatedAt ?? comic.createdAt,
  });
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const comic = await getComic(slug);

  return <ComicClient comic={comic} slug={slug} />;
}
