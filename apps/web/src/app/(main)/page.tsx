import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";

import { PageLoading } from "@/components/ui/spinning-dots";
import { orpcClient } from "@/lib/orpc";

import { createPageMetadata } from "../seo";
import { HomeClient } from "./home-client";

export const metadata: Metadata = createPageMetadata();

const safeResult = <T,>(data: T | undefined, error?: { code?: string }) =>
  data
    ? { data, error: undefined }
    : { data: undefined, error: { code: error?.code ?? "UNKNOWN" } };

async function getCachedHomeData() {
  "use cache";
  cacheLife("minutes");
  cacheTag("home");

  const [weeklyGamesResult, featuredPostsResult] = await Promise.allSettled([
    orpcClient.post.getWeekly(undefined, { context: { cache: true } }),
    orpcClient.post.getFeatured(undefined, { context: { cache: true } }),
  ]);

  return {
    featuredPosts:
      featuredPostsResult.status === "fulfilled"
        ? safeResult(featuredPostsResult.value)
        : safeResult(undefined, { code: "UNKNOWN" }),
    weeklyGames:
      weeklyGamesResult.status === "fulfilled"
        ? safeResult(weeklyGamesResult.value)
        : safeResult(undefined, { code: "UNKNOWN" }),
  };
}

async function getRecentUsersData() {
  try {
    return safeResult(await orpcClient.user.getRecentUsers());
  } catch {
    return safeResult(undefined, { code: "UNKNOWN" });
  }
}

async function HomePageContent() {
  const [cachedHomeData, recentUsers] = await Promise.all([
    getCachedHomeData(),
    getRecentUsersData(),
  ]);

  return <HomeClient loaderData={{ ...cachedHomeData, recentUsers }} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomePageContent />
    </Suspense>
  );
}
