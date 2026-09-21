import { useCallback, useEffect, useRef, useState } from "react";

export type SpinPhase = "idle" | "spin" | "settle";

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The board turns a quarter, then snaps back with the letters re-laid upright. */
export function useSpin(rotate: () => void) {
  const [phase, setPhase] = useState<SpinPhase>("idle");
  // Counts up rather than wrapping at 4, so the button's icon always turns onwards.
  const [turns, setTurns] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const spin = useCallback(() => {
    if (phase !== "idle") return;
    setTurns(t => t + 1);
    if (reduceMotion()) { rotate(); return; }
    setPhase("spin");
    timers.current = [
      setTimeout(() => { rotate(); setPhase("settle"); }, 470),
      setTimeout(() => setPhase("idle"), 470 + 340),
    ];
  }, [phase, rotate]);

  return { phase, turns, spin };
}
