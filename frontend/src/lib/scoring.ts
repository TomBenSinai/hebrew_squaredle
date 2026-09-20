import { letterCount } from "./hebrew";
import type { FoundWord } from "../api/types";

const RANKS: [number, string][] = [
  [0, "יאללה מתחילים"], [0.1, "לאט לאט"], [0.25, "התקדמות יפה!"], [0.45, "כמעט בחצי..."],
  [0.65, "אליפותתת"], [0.85, "לא לוותר!"], [0.9, "כמעט שם"], [1, "כל הכבוד!"],
];

export function rankFor(frac: number): string {
  let rank = RANKS[0][1];
  for (const [t, name] of RANKS) if (frac >= t) rank = name;
  return rank;
}

/** Share of the day's main letters found: longer words move the bar further. */
export function letterFraction(found: FoundWord[], mainLetters: number): number {
  const got = found.filter(f => f.cat === "main").reduce((n, f) => n + letterCount(f.w), 0);
  return mainLetters ? got / mainLetters : 0;
}

export const MAX_GROUP = 8;
export const groupOf = (w: string) => Math.min(letterCount(w), MAX_GROUP);
export const groupTitle = (len: number) => (len >= MAX_GROUP ? `${MAX_GROUP}+ אותיות` : `${len} אותיות`);
export const leftText = (n: number) => (n === 1 ? "נותרה עוד מילה אחת" : `נותרו עוד ${n} מילים`);
export const pointsText = (pts: number) => (pts === 1 ? "נקודה" : `${pts} נק׳`);
