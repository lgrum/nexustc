import { useEffect, useRef } from "react";
import type { DependencyList } from "react";

export function useDebounceEffect(
  fn: () => void,
  waitTime: number,
  deps: DependencyList
) {
  // 1. Keep a reference to the latest function
  const fnRef = useRef(fn);

  // 2. Update the ref on every render so it's always fresh
  useEffect(() => {
    fnRef.current = fn;
  }); // No dependency array ensures this runs on every render

  useEffect(() => {
    // 3. The timeout uses the ref, not the closure
    const t = setTimeout(() => {
      fnRef.current();
    }, waitTime);

    return () => {
      clearTimeout(t);
    };
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps: We intentionally defer dependency management to the user
  }, deps);
}
