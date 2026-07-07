import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";

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

async function getAnonymousVipFeed(page: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag("vip-feed");

  return await orpcClient.post.getVipFeed(
    { page },
    { context: { cache: true } }
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [requestHeaders, rawSearchParams] = await Promise.all([
    headers(),
    searchParams,
  ]);
  const session = await auth.api.getSession({ headers: requestHeaders });
  const page = getPage(rawSearchParams);
  const feed = session?.user
    ? await orpcClient.post.getVipFeed({ page })
    : await getAnonymousVipFeed(page);

  return <VipClient feed={feed} />;
}
