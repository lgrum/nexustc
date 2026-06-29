import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { orpcClient } from "@/lib/orpc";

import { ComicCreatorClient } from "./comic-creator-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

const getComicCreator = cache(async (id: string) => {
  let creator: Awaited<
    ReturnType<typeof orpcClient.comicCreator.getById>
  > | null = null;
  try {
    creator = await orpcClient.comicCreator.getById({ id });
  } catch (error) {
    if (getErrorCode(error) !== "NOT_FOUND") {
      throw error;
    }
  }

  if (!creator) {
    notFound();
  }

  return creator;
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getComicCreator(id);
  return {
    title: `NeXusTC - ${data.creator.name}`,
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const data = await getComicCreator(id);

  return <ComicCreatorClient id={id} initialData={data} />;
}
