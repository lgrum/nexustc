import { auth } from "@repo/auth";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";

import {
  comicSearchParamsSchema,
  getComicTermIds,
} from "@/components/search/catalog-search";
import { orpcClient } from "@/lib/orpc";

import { ComicsClient } from "./comics-client";

const TOP_RANK_LIMIT = 10;
const TRENDING_LIMIT = 14;

type RawSearchParams = Record<string, string | string[] | undefined>;

function arrayParam(value: string | string[] | undefined) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeSearchParams(searchParams: RawSearchParams) {
  return comicSearchParamsSchema.parse({
    ...searchParams,
    tag: arrayParam(searchParams.tag),
  });
}

async function getCatalogData(
  params: ReturnType<typeof normalizeSearchParams>
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return params.query?.trim()
      ? fetchAnonymousCatalogData(params)
      : getAnonymousCatalogData(params);
  }

  const termIds = getComicTermIds(params);
  const searchResult = await orpcClient.post.search({
    maxPageCount: params.maxPages,
    minPageCount: params.minPages,
    orderBy: params.orderBy,
    page: params.page,
    query: params.query,
    termIds: termIds.length > 0 ? termIds : undefined,
    type: "comic",
  });

  return {
    filteredPosts: searchResult.items,
    pagination: searchResult.pagination,
  };
}

async function getAnonymousCatalogData(
  params: ReturnType<typeof normalizeSearchParams>
) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog:comics");

  return fetchAnonymousCatalogData(params);
}

async function fetchAnonymousCatalogData(
  params: ReturnType<typeof normalizeSearchParams>
) {
  const termIds = getComicTermIds(params);
  const searchResult = await orpcClient.post.search(
    {
      maxPageCount: params.maxPages,
      minPageCount: params.minPages,
      orderBy: params.orderBy,
      page: params.page,
      query: params.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "comic",
    },
    { context: { cache: true } }
  );

  return {
    filteredPosts: searchResult.items,
    pagination: searchResult.pagination,
  };
}

async function getAnonymousComicRails() {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog:comics");
  const [popular, trending] = await Promise.all([
    orpcClient.post.search(
      {
        orderBy: "views",
        pageSize: TOP_RANK_LIMIT,
        type: "comic",
      },
      { context: { cache: true } }
    ),
    orpcClient.post.search(
      {
        orderBy: "likes",
        pageSize: TRENDING_LIMIT,
        type: "comic",
      },
      { context: { cache: true } }
    ),
  ]);

  return {
    popularPosts: popular.items,
    trendingPosts: trending.items,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = normalizeSearchParams(await searchParams);
  const [catalogData, rails] = await Promise.all([
    getCatalogData(params),
    getAnonymousComicRails(),
  ]);

  return (
    <ComicsClient
      filteredPosts={catalogData.filteredPosts}
      pagination={catalogData.pagination}
      params={params}
      popularPosts={rails.popularPosts}
      trendingPosts={rails.trendingPosts}
    />
  );
}
