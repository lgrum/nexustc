import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { orpcClient } from "@/lib/orpc";

const VIEW_DELAY_MS = 2000;
const VIEW_THRESHOLD = 0.35;
const ANONYMOUS_VIEWER_ID_STORAGE_KEY = "nexustc:anonymous-viewer-id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bytesToUuid(bytes: Uint8Array) {
  const uuidBytes = [...bytes];
  uuidBytes[6] = ((uuidBytes[6] ?? 0) % 16) + 64;
  uuidBytes[8] = ((uuidBytes[8] ?? 0) % 64) + 128;

  const hex = uuidBytes.map((byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function createAnonymousViewerId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return bytesToUuid(bytes);
}

function getAnonymousViewerId() {
  try {
    const existingId = window.localStorage.getItem(
      ANONYMOUS_VIEWER_ID_STORAGE_KEY
    );

    if (existingId && UUID_PATTERN.test(existingId)) {
      return existingId;
    }

    const nextId = createAnonymousViewerId();
    window.localStorage.setItem(ANONYMOUS_VIEWER_ID_STORAGE_KEY, nextId);

    return nextId;
  } catch {
    // Some browsers deny localStorage access; the API can still use request headers.
  }
}

type UsePostViewTrackerParams = {
  enabled: boolean;
  postId: string;
  targetRef: RefObject<Element | null>;
};

export function usePostViewTracker({
  enabled,
  postId,
  targetRef,
}: UsePostViewTrackerParams) {
  const recordedPostIdRef = useRef<string | null>(null);
  const { mutate } = useMutation({
    mutationFn: ({
      anonymousViewerId,
      trackedPostId,
    }: {
      anonymousViewerId?: string;
      trackedPostId: string;
    }) =>
      orpcClient.post.recordView({
        anonymousViewerId,
        postId: trackedPostId,
      }),
  });

  useEffect(() => {
    if (!enabled || recordedPostIdRef.current === postId) {
      return;
    }

    const target = targetRef.current;

    if (!target) {
      return;
    }

    let visible = false;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer === null) {
        return;
      }

      window.clearTimeout(timer);
      timer = null;
    };

    const recordView = () => {
      if (
        recordedPostIdRef.current === postId ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      recordedPostIdRef.current = postId;
      mutate({
        anonymousViewerId: getAnonymousViewerId(),
        trackedPostId: postId,
      });
    };

    const startTimer = () => {
      if (
        timer !== null ||
        recordedPostIdRef.current === postId ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      timer = window.setTimeout(recordView, VIEW_DELAY_MS);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);

        if (visible) {
          startTimer();
          return;
        }

        clearTimer();
      },
      { threshold: VIEW_THRESHOLD }
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && visible) {
        startTimer();
        return;
      }

      clearTimer();
    };

    observer.observe(target);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
  }, [enabled, mutate, postId, targetRef]);
}
