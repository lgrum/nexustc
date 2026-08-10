import { act, renderHook } from "@testing-library/react";

import { useComicPageCheckpoints } from "./use-comic-page-checkpoints";

const api = vi.hoisted(() => ({
  startSession: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpcClient: {
    comicProgress: api,
  },
}));

class MockIntersectionObserver {
  static instance: MockIntersectionObserver;
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instance = this;
  }

  // oxlint-disable-next-line class-methods-use-this
  disconnect() {}
  // oxlint-disable-next-line class-methods-use-this
  observe() {}
  // oxlint-disable-next-line class-methods-use-this
  unobserve() {}

  emit(target: Element, intersectionRatio: number) {
    this.callback(
      [{ intersectionRatio, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe(useComicPageCheckpoints, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    setDocumentVisibility("visible");
    api.startSession.mockResolvedValue({
      readingSessionId: "session-1",
      trackingAvailable: true,
    });
    api.update.mockResolvedValue({ processed: true, trackingAvailable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("submits only after one page stays at least 60% visible for two seconds", async () => {
    const page = document.createElement("img");
    const { result } = renderHook(() =>
      useComicPageCheckpoints({ comicId: "comic-1", enabled: true })
    );
    await act(() => Promise.resolve());

    act(() => {
      result.current.trackPageElement(page, 2);
      MockIntersectionObserver.instance.emit(page, 0.59);
      vi.advanceTimersByTime(2000);
    });
    expect(api.update).not.toHaveBeenCalled();

    act(() => {
      MockIntersectionObserver.instance.emit(page, 0.6);
      vi.advanceTimersByTime(1999);
    });
    expect(api.update).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(api.update).toHaveBeenCalledWith({
      comicId: "comic-1",
      documentVisible: true,
      page: 2,
      readingSessionId: "session-1",
      visibleDurationMs: 2000,
      visiblePercentage: 60,
    });
  });

  it("does not credit hidden-tab time and reports unavailable tracking", async () => {
    api.startSession.mockResolvedValue({
      readingSessionId: null,
      trackingAvailable: false,
    });
    const page = document.createElement("img");
    const { result } = renderHook(() =>
      useComicPageCheckpoints({ comicId: "comic-1", enabled: true })
    );
    await act(() => Promise.resolve());

    act(() => {
      result.current.trackPageElement(page, 1);
      setDocumentVisibility("hidden");
      MockIntersectionObserver.instance.emit(page, 0.9);
      vi.advanceTimersByTime(5000);
    });

    expect(api.update).not.toHaveBeenCalled();
    expect(result.current.trackingUnavailable).toBe(true);
  });

  it("rearms a page when a failed checkpoint settles after the page exits", async () => {
    let resolveCheckpoint: ((value: unknown) => void) | undefined;
    api.update
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCheckpoint = resolve;
        })
      )
      .mockResolvedValue({ processed: true, trackingAvailable: true });
    const page = document.createElement("img");
    const { result } = renderHook(() =>
      useComicPageCheckpoints({ comicId: "comic-1", enabled: true })
    );
    await act(() => Promise.resolve());

    act(() => {
      result.current.trackPageElement(page, 3);
      MockIntersectionObserver.instance.emit(page, 0.8);
      vi.advanceTimersByTime(2000);
      MockIntersectionObserver.instance.emit(page, 0.1);
    });
    expect(api.update).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCheckpoint?.({ processed: false, trackingAvailable: true });
      await Promise.resolve();
    });
    act(() => {
      MockIntersectionObserver.instance.emit(page, 0.8);
      vi.advanceTimersByTime(2000);
    });
    expect(api.update).toHaveBeenCalledTimes(2);
  });
});
