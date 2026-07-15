import { Suspense } from "react";

import { LoadingSpinner } from "@/components/loading-spinner";

import { MediaClient } from "./media-client";

export default function MediaPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MediaClient />
    </Suspense>
  );
}
