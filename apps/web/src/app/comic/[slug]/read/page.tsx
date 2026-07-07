import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { orpcClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

import { ComicReadClient } from "./comic-read-client";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

async function getAnonymousComic(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("content", `content:${slug}`);

  return await orpcClient.post.getPostById(getComicInput(slug), {
    context: { cache: true },
  });
}

const getComic = cache(async (slug: string) => {
  const session = await auth.api.getSession({ headers: await headers() });

  let comic: Awaited<ReturnType<typeof orpcClient.post.getPostById>> | null =
    null;
  try {
    comic = session?.user
      ? await orpcClient.post.getPostById(getComicInput(slug))
      : await getAnonymousComic(slug);
  } catch (error) {
    if (getErrorCode(error) !== "NOT_FOUND") {
      throw error;
    }
  }

  if (comic?.type !== "comic" || comic.earlyAccess.isRestrictedView) {
    notFound();
  }

  return comic;
});

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const comic = await getComic(slug);
  const coverObjectKey = getCoverImageObjectKey(
    comic.imageObjectKeys,
    comic.coverImageObjectKey
  );
  const imageUrl = coverObjectKey ? getBucketUrl(coverObjectKey) : undefined;
  const title = `NeXusTC - Leer ${comic.title}`;

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

export default async function Page({ params, searchParams }: PageProps) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const comic = await getComic(slug);
  const mode = getStringParam(search.mode);
  const page = Number(getStringParam(search.page) ?? 0);

  return (
    <ComicReadClient
      comic={comic}
      initialMode={
        mode === "cascade"
          ? "cascade"
          : mode === "fullscreen"
            ? "fullscreen"
            : undefined
      }
      initialPage={Number.isInteger(page) && page >= 0 ? page : 0}
      slug={slug}
    />
  );
}
