import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";
import { orpcClient } from "@/lib/orpc";

import { createPageMetadata } from "../seo";
import { HomeClient } from "./home-client";

export const metadata: Metadata = createPageMetadata();

const safeResult = <T,>(data: T | undefined, error?: { code?: string }) =>
  data
    ? { data, error: undefined }
    : { data: undefined, error: { code: error?.code ?? "UNKNOWN" } };

async function getHomeData() {
  "use cache";
  cacheLife("minutes");
  cacheTag("home");

  const [recentUsersResult, weeklyGamesResult, featuredPostsResult] =
    await Promise.allSettled([
      orpcClient.user.getRecentUsers(undefined, { context: { cache: true } }),
      orpcClient.post.getWeekly(undefined, { context: { cache: true } }),
      orpcClient.post.getFeatured(undefined, { context: { cache: true } }),
    ]);

  return {
    featuredPosts:
      featuredPostsResult.status === "fulfilled"
        ? safeResult(featuredPostsResult.value)
        : safeResult(undefined, { code: "UNKNOWN" }),
    recentUsers:
      recentUsersResult.status === "fulfilled"
        ? safeResult(recentUsersResult.value)
        : safeResult(undefined, { code: "UNKNOWN" }),
    weeklyGames:
      weeklyGamesResult.status === "fulfilled"
        ? safeResult(weeklyGamesResult.value)
        : safeResult(undefined, { code: "UNKNOWN" }),
  };
}

async function HomePageContent() {
  const loaderData = await getHomeData();
  return <HomeClient loaderData={loaderData} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner className="my-20" />}>
      <HomePageContent />
    </Suspense>
  );
}
