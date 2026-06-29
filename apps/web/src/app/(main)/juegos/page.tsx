import { cacheLife, cacheTag } from "next/cache";

import {
  gameSearchParamsSchema,
  getGameTermIds,
} from "@/components/search/catalog-search";
import { orpcClient } from "@/lib/orpc";

import { GamesClient } from "./games-client";

type RawSearchParams = Record<string, string | string[] | undefined>;

function normalizeSearchParams(searchParams: RawSearchParams) {
  const input = {
    ...searchParams,
    engine: arrayParam(searchParams.engine),
    graphics: arrayParam(searchParams.graphics),
    platform: arrayParam(searchParams.platform),
    status: arrayParam(searchParams.status),
    tag: arrayParam(searchParams.tag),
  };

  return gameSearchParamsSchema.parse(input);
}

function arrayParam(value: string | string[] | undefined) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

async function fetchGamesData(
  params: ReturnType<typeof normalizeSearchParams>
) {
  const termIds = getGameTermIds(params);
  const searchResult = await orpcClient.post.search(
    {
      orderBy: params.orderBy,
      page: params.page,
      query: params.query,
      termIds: termIds.length > 0 ? termIds : undefined,
      type: "post",
    },
    { context: { cache: true } }
  );

  return {
    filteredPosts: searchResult.items,
    pagination: searchResult.pagination,
  };
}

async function getCachedGamesData(
  params: ReturnType<typeof normalizeSearchParams>
) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog:games");

  return fetchGamesData(params);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = normalizeSearchParams(await searchParams);
  const { filteredPosts, pagination } = params.query?.trim()
    ? await fetchGamesData(params)
    : await getCachedGamesData(params);

  return (
    <GamesClient
      filteredPosts={filteredPosts}
      pagination={pagination}
      params={params}
    />
  );
}
