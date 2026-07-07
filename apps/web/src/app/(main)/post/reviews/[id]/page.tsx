import type { Metadata } from "next";

import { ReviewsClient } from "./reviews-client";

export const metadata: Metadata = {
  title: "NeXusTC - Valoraciones",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewsClient postId={id} />;
}
