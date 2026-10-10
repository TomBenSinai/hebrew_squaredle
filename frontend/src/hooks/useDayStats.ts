import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DayStats } from "../api/types";

const EVERY = 30_000;

/**
 * How everyone did on `date` (for the progress bar), fetched on load and again
 * every so often while the page is visible. null until known or with no server,
 * and for a null `date` (a board with no stats: ריבועוני).
 */
export function useDayStats(date: string | null): DayStats | null {
  const [stats, setStats] = useState<DayStats | null>(null);
  useEffect(() => {
    let live = true;
    setStats(null);
    if (!date) return;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api.stats(date).then(s => { if (live) setStats(s); }, () => {});
    };
    load();
    const t = setInterval(load, EVERY);
    document.addEventListener("visibilitychange", load);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [date]);
  return stats;
}
