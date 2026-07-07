import { db, eq, siteConfig } from "@repo/db";
import {
  DEFAULT_MARQUEE_ITEMS,
  marqueeItemsSchema,
} from "@repo/shared/schemas";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";

import { MainShell } from "./main-shell";

const MARQUEE_CONFIG_KEY = "main_marquee";

async function getMarqueeItems() {
  "use cache";
  cacheLife("hours");
  cacheTag("site-config");

  try {
    const result = await db
      .select({ value: siteConfig.value })
      .from(siteConfig)
      .where(eq(siteConfig.key, MARQUEE_CONFIG_KEY))
      .limit(1);

    const parsed = marqueeItemsSchema.safeParse(result[0]?.value);
    return parsed.success ? parsed.data : DEFAULT_MARQUEE_ITEMS;
  } catch {
    return DEFAULT_MARQUEE_ITEMS;
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const marqueeItems = await getMarqueeItems();

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MainShell marqueeItems={marqueeItems}>{children}</MainShell>
    </Suspense>
  );
}
