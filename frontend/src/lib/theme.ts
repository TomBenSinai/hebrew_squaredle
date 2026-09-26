import { useCallback, useSyncExternalStore } from "react";
import { useMedia } from "../hooks/useMedia";

/**
 * Light or dark. Until the player picks one the page follows the system (the
 * tokens' prefers-color-scheme block); a pick is stored and set as
 * <html data-theme>, which index.html also applies before first paint.
 */
export type Theme = "light" | "dark";

const KEY = "ribuon:theme";
const listeners = new Set<() => void>();
let memory: Theme | null = null;

function stored(): Theme | null {
  if (memory) return memory;
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch { return null; }
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useTheme(): [Theme, () => void] {
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  const picked = useSyncExternalStore(subscribe, stored);
  const theme: Theme = picked ?? (systemDark ? "dark" : "light");
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    memory = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode etc. */ }
    document.documentElement.dataset.theme = next;
    listeners.forEach(notify => notify());
  }, [theme]);
  return [theme, toggle];
}
