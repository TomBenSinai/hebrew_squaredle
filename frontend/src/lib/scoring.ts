import { letterCount } from "./hebrew";
import type { FoundWord } from "../api/types";

const RANKS: [number, string][] = [
  [0, "יאללה מתחילים"], [0.1, "לאט לאט"], [0.25, "לא לוותר!"], [0.45, "כמעט בחצי..."],
  [0.65, "התקדמות יפה!"], [0.85, "כמעט שם"], [0.9, "אליפותתת"], [1, "כל הכבוד!"],
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

/** Tile numbers unlock with progress: first how many words start at a letter, then how many use it. */
export const HINT_STARTS_AT = 0.25;
export const HINT_USES_AT = 0.5;
export type HintLevel = 0 | 1 | 2;
export const hintLevel = (frac: number): HintLevel =>
  frac >= HINT_USES_AT ? 2 : frac >= HINT_STARTS_AT ? 1 : 0;

/** Same as word_points in wordgame.py: by letter count, bonus words double. */
const POINTS_BY_LENGTH: Record<number, number> = { 4: 1, 5: 2, 6: 3, 7: 5 };
export const wordPoints = (f: FoundWord) =>
  (POINTS_BY_LENGTH[letterCount(f.w)] ?? 11) * (f.cat === "bonus" ? 2 : 1);
export const totalPoints = (found: FoundWord[]) => found.reduce((n, f) => n + wordPoints(f), 0);

export const MAX_GROUP = 8;
export const groupOf = (w: string) => Math.min(letterCount(w), MAX_GROUP);
export const groupTitle = (len: number) => (len >= MAX_GROUP ? `${MAX_GROUP}+ אותיות` : `${len} אותיות`);
export const leftText = (n: number) => (n === 1 ? "נותרה עוד מילה אחת" : `נותרו עוד ${n} מילים`);
export const pointsText = (pts: number) => (pts === 1 ? "נקודה" : `${pts} נק׳`);
