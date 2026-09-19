import { useCallback, useEffect, useRef, useState } from "react";

export type SpinPhase = "idle" | "spin" | "settle";

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The board turns a quarter, then snaps back with the letters re-laid upright. */
export function useSpin(rotate: () => void) {
  const [phase, setPhase] = useState<SpinPhase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const spin = useCallback(() => {
    if (phase !== "idle") return;
    if (reduceMotion()) { rotate(); return; }
    setPhase("spin");
    timers.current = [
      setTimeout(() => { rotate(); setPhase("settle"); }, 470),
      setTimeout(() => setPhase("idle"), 470 + 340),
    ];
  }, [phase, rotate]);

  return { phase, spin };
}
