import { useCallback, useEffect, useRef, useState } from "react";

export function useOverflowDetection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const checkOverflow = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      return;
    }
    const isOverflowing = container.scrollHeight > container.clientHeight;
    setHasOverflow(isOverflowing);
  }, []);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Cleanup previous observer
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      containerRef.current = node;

      if (node) {
        // Initial check
        checkOverflow(node);

        // Setup observer for future changes
        resizeObserverRef.current = new ResizeObserver(() => {
          checkOverflow(node);
        });
        resizeObserverRef.current.observe(node);
      }
    },
    [checkOverflow]
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    },
    []
  );

  return { containerRef: setRef, hasOverflow };
}
