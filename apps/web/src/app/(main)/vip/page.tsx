import type { Metadata } from "next";

import { orpcClient } from "@/lib/orpc";

import { createPageMetadata } from "../../seo";
import { VipClient } from "./vip-client";

export const metadata: Metadata = createPageMetadata({
  description: "Contenido VIP y novedades premium para miembros de NeXusTC.",
  path: "/vip",
  title: "VIP",
});

type RawSearchParams = Record<string, string | string[] | undefined>;

function getPage(searchParams: RawSearchParams) {
  const rawPage = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const page = Number(rawPage ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  const page = getPage(rawSearchParams);
  const feed = await orpcClient.post.getVipFeed({ page });

  return <VipClient feed={feed} />;
}
