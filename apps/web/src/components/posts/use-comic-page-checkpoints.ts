import { useCallback, useEffect, useRef, useState } from "react";

import { orpcClient } from "@/lib/orpc";

const MIN_VISIBLE_RATIO = 0.6;
const MIN_VISIBLE_TIME_MS = 2000;

type ObservedPage = {
  page: number;
  ratio: number;
  retryOnExit: boolean;
  submitted: boolean;
  timeoutId: number | null;
};

export function useComicPageCheckpoints(params: {
  comicId: string;
  enabled: boolean;
}) {
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pagesRef = useRef(new Map<Element, ObservedPage>());
  const readingSessionIdRef = useRef<string | null>(null);

  const clearTimer = useCallback((page: ObservedPage) => {
    if (page.timeoutId !== null) {
      window.clearTimeout(page.timeoutId);
      page.timeoutId = null;
    }
  }, []);

  const scheduleCheckpoint = useCallback(
    (page: ObservedPage) => {
      if (
        page.timeoutId !== null ||
        page.submitted ||
        page.ratio < MIN_VISIBLE_RATIO ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      page.timeoutId = window.setTimeout(async () => {
        page.timeoutId = null;
        const readingSessionId = readingSessionIdRef.current;
        if (
          !readingSessionId ||
          page.ratio < MIN_VISIBLE_RATIO ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        page.submitted = true;
        try {
          const result = await orpcClient.comicProgress.update({
            comicId: params.comicId,
            documentVisible: true,
            page: page.page,
            readingSessionId,
            visibleDurationMs: MIN_VISIBLE_TIME_MS,
            visiblePercentage: Math.round(page.ratio * 100),
          });
          if (!result.trackingAvailable) {
            setTrackingUnavailable(true);
          }
          page.retryOnExit = !result.processed;
        } catch {
          setTrackingUnavailable(true);
          page.retryOnExit = true;
        }
      }, MIN_VISIBLE_TIME_MS);
    },
    [params.comicId]
  );

  useEffect(() => {
    if (!params.enabled) {
      return;
    }
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = pagesRef.current.get(entry.target);
          if (!page) {
            continue;
          }
          page.ratio = entry.intersectionRatio;
          if (entry.intersectionRatio >= MIN_VISIBLE_RATIO) {
            scheduleCheckpoint(page);
          } else {
            clearTimer(page);
            if (page.retryOnExit) {
              page.retryOnExit = false;
              page.submitted = false;
            }
          }
        }
      },
      { threshold: [MIN_VISIBLE_RATIO] }
    );
    observerRef.current = observer;
    for (const element of pagesRef.current.keys()) {
      observer.observe(element);
    }

    const handleVisibilityChange = () => {
      for (const page of pagesRef.current.values()) {
        if (document.visibilityState === "visible") {
          scheduleCheckpoint(page);
        } else {
          clearTimer(page);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      try {
        const session = await orpcClient.comicProgress.startSession({
          comicId: params.comicId,
        });
        if (cancelled) {
          return;
        }
        readingSessionIdRef.current = session.readingSessionId;
        setTrackingUnavailable(!session.trackingAvailable);
        for (const page of pagesRef.current.values()) {
          scheduleCheckpoint(page);
        }
      } catch {
        if (!cancelled) {
          setTrackingUnavailable(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      observer.disconnect();
      observerRef.current = null;
      readingSessionIdRef.current = null;
      for (const page of pagesRef.current.values()) {
        clearTimer(page);
      }
    };
  }, [clearTimer, params.comicId, params.enabled, scheduleCheckpoint]);

  const trackPageElement = useCallback(
    (element: Element | null, pageNumber: number) => {
      for (const [registeredElement, page] of pagesRef.current) {
        if (page.page === pageNumber && registeredElement !== element) {
          clearTimer(page);
          observerRef.current?.unobserve(registeredElement);
          pagesRef.current.delete(registeredElement);
        }
      }
      if (!element) {
        return;
      }
      const existing = pagesRef.current.get(element);
      if (existing?.page === pageNumber) {
        return;
      }
      if (existing) {
        clearTimer(existing);
      }
      pagesRef.current.set(element, {
        page: pageNumber,
        ratio: 0,
        retryOnExit: false,
        submitted: false,
        timeoutId: null,
      });
      observerRef.current?.observe(element);
    },
    [clearTimer]
  );

  return { trackingUnavailable, trackPageElement };
}
