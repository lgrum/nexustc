import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { createContentMetadata } from "@/app/seo";
import { orpcClient } from "@/lib/orpc";

import { PostClient } from "./post-client";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

type PageProps = {
  params: Promise<{ id: string }>;
};

function getPostInput(idOrSlug: string) {
  return NANOID_PATTERN.test(idOrSlug)
    ? idOrSlug
    : { slug: idOrSlug, type: "post" as const };
}

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

async function getAnonymousPost(idOrSlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("content", `content:${idOrSlug}`);

  return await orpcClient.post.getPostById(getPostInput(idOrSlug), {
    context: { cache: true },
  });
}

const getPost = cache(async (idOrSlug: string) => {
  const session = await auth.api.getSession({ headers: await headers() });

  let post: Awaited<ReturnType<typeof orpcClient.post.getPostById>> | null =
    null;
  try {
    post = session?.user
      ? await orpcClient.post.getPostById(getPostInput(idOrSlug))
      : await getAnonymousPost(idOrSlug);
  } catch (error) {
    if (getErrorCode(error) !== "NOT_FOUND") {
      throw error;
    }
  }

  if (post?.type !== "post") {
    notFound();
  }

  return post;
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  const title = post.earlyAccess.isRestrictedView
    ? "NeXusTC - VIP Early Access"
    : `NeXusTC - ${post.title}`;

  return createContentMetadata({
    canonicalPath: `/post/${encodeURIComponent(post.slug)}`,
    contentTitle: post.title,
    identifier: post.slug,
    pageTitle: title,
    type: "post",
    updatedAt: post.updatedAt ?? post.createdAt,
  });
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const post = await getPost(id);

  return <PostClient id={id} post={post} />;
}
