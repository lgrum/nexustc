import { Suspense } from "react";

import { PageLoading } from "@/components/ui/spinning-dots";

import { MediaClient } from "./media-client";

export default function MediaPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MediaClient />
    </Suspense>
  );
}
