import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date as the window changes. */
export function useMedia(query: string): boolean {
  // stable per query, so React doesn't resubscribe on every render
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
