import { db, eq } from "@repo/db";
import { chronosPage } from "@repo/db/schema/app";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { ChronosClient } from "./chronos-client";

export const metadata: Metadata = {
  title: "TheChronos",
};

async function getChronosPage() {
  "use cache";
  cacheLife("days");
  cacheTag("chronos");

  const [page] = await db
    .select()
    .from(chronosPage)
    .where(eq(chronosPage.isActive, true))
    .limit(1);

  return (
    page ?? {
      carouselImageKeys: [],
      createdAt: new Date(),
      headerImageKey: null,
      id: "",
      isActive: true,
      markdownContent: "",
      markdownImageKeys: [],
      stickyImageKey: null,
      updatedAt: new Date(),
    }
  );
}

export default async function Page() {
  const data = await getChronosPage();
  return <ChronosClient data={data} />;
}
