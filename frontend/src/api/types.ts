/** Shapes of the backend's JSON (backend/app/main.py). */

export interface DaySummary {
  date: string;
  number: number;
  shapeName: string;
  theme: string | null;
  mainTotal: number;
  mainLetters: number;
}

export interface DaysResponse {
  today: string;
  days: DaySummary[];
}

export interface PublicBoard extends DaySummary {
  letters: string;
  mask: string[];
  groups: { length: number; total: number }[];
  bonusTotal: number;
  themeTotal: number;
}

export type Category = "main" | "bonus";

export type CheckResult =
  | { status: Category; word: string; points: number; theme: boolean }
  | { status: "not_a_word" | "too_short" | "bad_path" };

/** Per stored cell, over the main words not found yet. */
export interface CellCounts {
  /** cells some of them still use */
  cells: number[];
  /** how many start at each cell; only sent once that hint is unlocked */
  starts?: number[];
  /** how many pass through each cell; only sent once that hint is unlocked */
  uses?: number[];
}

export interface FoundWord {
  w: string;
  cat: Category;
  theme?: boolean;
}

export interface DayProgress {
  found: FoundWord[];
  rot: number;
}

export interface MilogSense {
  text: string;
  examples: string[];
}

export interface MilogEntry {
  title: string;
  info: string;
  senses: MilogSense[];
}

export interface Definition {
  word: string;
  url: string;
  entries: MilogEntry[];
}
