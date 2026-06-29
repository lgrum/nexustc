import { notFound } from "next/navigation";

import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const [oldComic, prerequisites] = await Promise.all([
    orpcClient.comic.admin.getEdit(id),
    orpcClient.comic.admin.createComicPrerequisites(),
  ]);

  if (!oldComic) {
    notFound();
  }

  return <ClientPage oldComic={oldComic} prerequisites={prerequisites} />;
}
