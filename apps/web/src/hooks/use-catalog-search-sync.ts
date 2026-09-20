import { useRef } from "react";
import type { DependencyList } from "react";

import { useDebounceEffect } from "./use-debounce-effect";

type CatalogSearchSyncOptions<T> = {
  buildSearchParams: () => T;
  deps: DependencyList;
  isDirty: boolean;
  onSearchChange: (params: T) => void;
};

export function useCatalogSearchSync<T>({
  buildSearchParams,
  deps,
  isDirty,
  onSearchChange,
}: CatalogSearchSyncOptions<T>) {
  const hasInitializedSearchSync = useRef(false);

  useDebounceEffect(
    () => {
      if (!hasInitializedSearchSync.current) {
        hasInitializedSearchSync.current = true;
        return;
      }

      if (!isDirty) {
        return;
      }

      onSearchChange(buildSearchParams());
    },
    300,
    [isDirty, ...deps]
  );
}
