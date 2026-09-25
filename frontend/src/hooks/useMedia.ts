import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date as the window changes. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    notify => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
  );
}
