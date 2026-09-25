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

/** The second tile number (words using a letter) is switched off for now: it never unlocks. */
export const SHOW_USES_HINT = false;

export type HintId = "sort" | "reveal" | "starts" | "uses";

export interface HintDef {
  id: HintId;
  /** share of main letters that opens it; keep in step with backend/app/boards.py */
  at: number;
  /** its own color, on the progress bar and in the message that opens it */
  color: string;
  /** one line: the mark on the progress bar */
  label: string;
  /** the line under the find that opened it */
  note: string;
}

/** Help that opens up as the player gets further in, weakest first. */
export const HINTS: HintDef[] = [
  {
    id: "starts", at: 0.3, color: "var(--hint-starts)",
    label: "רמז: כמה מילים שמתחילות באות נותרו",
    note: "נפתח רמז חדש! המספר האדום - כמה מילים שמתחילות באות הזו נותרו",
  },
  {
    id: "sort", at: 0.5, color: "var(--hint-sort)",
    label: "רמז: מיון רשימת המילים לפי א-ב",
    note: "נפתח רמז חדש! אפשר למיין את רשימת המילים לפי א-ב",
  },
  {
    id: "reveal", at: 0.6, color: "var(--hint-reveal)",
    label: "רמז: אותיות מהמילים שנותרו",
    note: "נפתח רמז חדש! ברשימת המילים נחשפות אותיות מהמילים שעוד לא מצאתם",
  },
  ...(SHOW_USES_HINT
    ? [{
        id: "uses" as const, at: 0.75, color: "var(--hint-uses)",
        label: "רמז: כמה מילים שעוברות באות נותרו",
        note: "נפתח רמז חדש! המספר הכחול - כמה מילים שעוברות באות הזו נותרו",
      }]
    : []),
];

export const hintById = (id: HintId) => HINTS.find(h => h.id === id);

/** Which hints this much progress has opened. */
export const openHints = (frac: number): Set<HintId> =>
  new Set(HINTS.filter(h => frac >= h.at).map(h => h.id));

export const MAX_GROUP = 8;
export const groupOfLength = (n: number) => Math.min(n, MAX_GROUP);
export const groupOf = (w: string) => groupOfLength(letterCount(w));
export const groupTitle = (len: number) => (len >= MAX_GROUP ? `${MAX_GROUP}+ אותיות` : `${len} אותיות`);
export const leftText = (n: number) => (n === 1 ? "נותרה עוד מילה אחת" : `נותרו עוד ${n} מילים`);
