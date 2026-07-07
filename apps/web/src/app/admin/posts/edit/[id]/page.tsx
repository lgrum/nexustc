import { notFound } from "next/navigation";

import { orpcClient } from "@/lib/orpc";

import { ClientPage } from "./client-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const [oldPost, prerequisites] = await Promise.all([
    orpcClient.post.admin.getEdit(id),
    orpcClient.post.admin.createPostPrerequisites(),
  ]);

  if (!oldPost) {
    notFound();
  }

  return <ClientPage oldPost={oldPost} prerequisites={prerequisites} />;
}
