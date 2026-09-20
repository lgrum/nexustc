import { act, renderHook } from "@testing-library/react";

import { useCatalogSearchSync } from "./use-catalog-search-sync";

describe(useCatalogSearchSync, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reset the page when restored form state is not dirty", () => {
    const onSearchChange = vi.fn();
    const { rerender } = renderHook(
      ({ query, isDirty }) =>
        useCatalogSearchSync({
          buildSearchParams: () => ({ page: 1, query }),
          deps: [query],
          isDirty,
          onSearchChange,
        }),
      { initialProps: { isDirty: false, query: "" } }
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ isDirty: false, query: "restored" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("syncs a user-edited form back to page one", () => {
    const onSearchChange = vi.fn();
    const { rerender } = renderHook(
      ({ query, isDirty }) =>
        useCatalogSearchSync({
          buildSearchParams: () => ({ page: 1, query }),
          deps: [query],
          isDirty,
          onSearchChange,
        }),
      { initialProps: { isDirty: false, query: "" } }
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ isDirty: true, query: "new search" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSearchChange).toHaveBeenCalledWith({
      page: 1,
      query: "new search",
    });
  });
});
