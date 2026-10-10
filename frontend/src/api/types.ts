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
  /** today's ריבועוני ("mini-<date>"), for logged-in players; null with none made (missing from older APIs) */
  mini?: string | null;
}

export interface PublicBoard extends DaySummary {
  letters: string;
  mask: string[];
  groups: { length: number; total: number }[];
  bonusTotal: number;
  themeTotal: number;
  /** the words hashed, for checking swipes locally (lib/answers.ts); missing from older APIs */
  salt?: string;
  answers?: Answer[];
}

export interface Answer {
  h: string;
  d: string;
}

export type Category = "main" | "bonus";

export type CheckResult =
  | { status: Category; word: string; points: number; theme: boolean }
  | { status: "not_a_word" | "too_short" | "bad_path" };

/** A main word not found yet, spelled out only at its ends. */
export interface Reveal {
  /** how many letters it has */
  n: number;
  /** the letters shown at its start */
  pre: string;
  /** the letters shown at its end, the last one in final form ("" when none) */
  post: string;
  /** how many of its group's main words, found or not, come before it by a-b
   *  (missing from an API older than it) */
  at?: number;
}

/** What the server tells the player about the main words not found yet. */
export interface CellCounts {
  /** cells some of them still use */
  cells: number[];
  /** how many start at each cell; only sent once that hint is unlocked */
  starts?: number[];
  /** how many pass through each cell; only sent once that hint is unlocked */
  uses?: number[];
  /** each of them part-spelled; only sent once that hint is unlocked */
  reveals?: Reveal[];
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

export interface User {
  name: string;
  email: string | null;
  /** the name the leaderboard shows; null: not on it */
  nickname: string | null;
}

export interface AuthInfo {
  /** the ways to log in the server offers (neither: login is hidden) */
  providers: { google: boolean; email: boolean };
  user: User | null;
  /** this login made the account, so what this device played goes into it */
  newAccount: boolean;
}

/** One listed player's row (backend/app/leaderboard.py). */
export interface Ranked {
  /** place, shared by equal rows */
  rank: number;
  name: string;
  /** this row is the asking player's */
  me: boolean;
}

/** The asking player, listed or not, placed among the listed. */
export interface MyPlace {
  rank: number;
  listed: boolean;
}

export interface DayRow { main: number; bonus: number; done: boolean }
export interface StreakRow { streak: number; days: number }

export interface Ranking<Row> {
  /** listed players with a row */
  players: number;
  top: (Ranked & Row)[];
  me: (MyPlace & Row) | null;
}

export interface Leaderboard {
  day: Ranking<DayRow> & { date: string; mainTotal: number };
  streaks: Ranking<StreakRow>;
}

/** Everyone's average on a day, counted on the day itself; no names, no counts.
 *  null while too few have played. */
export interface DayStats {
  avgWords: number | null;
  /** average share of the main letters found, 0..1 (the progress bar's measure) */
  avgFraction: number | null;
}
