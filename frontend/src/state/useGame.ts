import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { CellCounts, DayProgress, FoundWord, PublicBoard } from "../api/types";
import { norm, withFinal } from "../lib/hebrew";
import { findPath, makeLayout, type Layout } from "../lib/layout";
import { hintLevel, letterFraction, pointsText, type HintLevel } from "../lib/scoring";
import { progressStore } from "./progressStore";

export const MIN_LEN = 4;

export type ToastKind = "main" | "bonus" | "bad" | "info";
export interface Toast {
  kind: ToastKind;
  text: string;
  /** a found word inside `text`: tapping it opens its definition */
  word?: string;
  /** a second line: the find unlocked the next tile numbers */
  note?: { kind: "hint-starts" | "hint-uses"; text: string };
}

const HINT_NOTES = {
  1: { kind: "hint-starts", text: "נפתח רמז חדש! המספר האדום - כמה מילים שמתחילות באות הזו נותרו" },
  2: { kind: "hint-uses", text: "נפתח רמז חדש! המספר הכחול - כמה מילים שעוברות באות הזו נותרו" },
} as const;

export interface Game {
  board: PublicBoard;
  layout: Layout;
  found: FoundWord[];
  /** the word found last, underlined in the list */
  fresh: string | null;
  /** shown cells that some unfound main word still uses (null until known) */
  live: Set<number> | null;
  /** tile numbers the player has unlocked, per shown cell (null until known) */
  hints: Hints | null;
  toast: Toast | null;
  /** a swiped word waiting for the server's answer, shown in place of the toast */
  pending: string | null;
  /** a word's path lit up on the board for a moment */
  flash: { cells: number[]; bonus: boolean } | null;
  showWord: (word: string) => void;
  submit: (path: number[]) => void;
  rotate: () => void;
  isBonus: (word: string) => boolean;
}

export interface Hints {
  level: HintLevel;
  /** unfound main words that start at each shown cell */
  starts?: number[];
  /** unfound main words that pass through each shown cell */
  uses?: number[];
}

/** One day's board and this player's progress on it. */
export function useGame(date: string | null): { game: Game | null; error: string | null } {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [progress, setProgress] = useState<DayProgress>({ found: [], rot: 0 });
  // with the main finds they were counted for (mainKey below)
  const [counts, setCounts] = useState<(CellCounts & { key: string }) | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // only the latest swipe may set the message (answers can arrive out of order)
  const submitSeq = useRef(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashWord, setFlashWord] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dateRef = useRef(date);
  dateRef.current = date;
  // the latest progress, readable at once (swipes can come faster than renders)
  const progressRef = useRef(progress);

  useEffect(() => {
    if (!date) return;
    let stale = false;
    setError(null);
    api.board(date).then(b => {
      if (stale) return;
      setBoard(b);
      progressRef.current = progressStore.load(date);
      setProgress(progressRef.current);
      setToast(null);
      setPending(null);
      submitSeq.current++;
      setFresh(null);
      setCounts(null);
      setFlashWord(null);
    }).catch(() => { if (!stale) setError("לא הצלחנו לטעון את הלוח"); });
    return () => { stale = true; };
  }, [date]);

  const layout = useMemo(
    () => (board ? makeLayout(board.mask, board.letters, progress.rot) : null),
    [board, progress.rot],
  );

  // grey out letters no remaining main word needs, and count what's left on
  // each; only main finds change this
  const mainKey = progress.found.filter(f => f.cat === "main").map(f => f.w).join(" ");
  useEffect(() => {
    if (!board) return;
    let stale = false;
    api.liveCells(board.date, mainKey ? mainKey.split(" ") : [])
      .then(r => { if (!stale) setCounts({ ...r, key: mainKey }); })
      .catch(() => {});
    return () => { stale = true; };
  }, [board, mainKey]);

  const live = useMemo(() => {
    if (!layout || !counts) return null;
    const set = new Set(counts.cells);
    return new Set(layout.base.flatMap((b, i) => (set.has(b) ? [i] : [])));
  }, [layout, counts]);

  const level = board ? hintLevel(letterFraction(progress.found, board.mainLetters)) : 0;
  // numbers counted before the latest find would still include it: show none
  // until the new counts arrive (the greying above can lag, it only errs safe)
  const hints = useMemo((): Hints | null => {
    if (!layout || !counts || counts.key !== mainKey) return null;
    const { starts, uses } = counts;
    return {
      level,
      starts: starts && layout.base.map(b => starts[b]),
      uses: uses && layout.base.map(b => uses[b]),
    };
  }, [layout, counts, mainKey, level]);

  const update = useCallback((date: string, fn: (p: DayProgress) => DayProgress) => {
    const next = fn(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    progressStore.save(date, next);
    return next;
  }, []);

  const showWord = useCallback((w: string) => {
    clearTimeout(flashTimer.current);
    setFlashWord(w);
    flashTimer.current = setTimeout(() => setFlashWord(null), 1600);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const flash = useMemo(() => {
    if (!layout || !flashWord) return null;
    const bonus = progress.found.some(f => f.w === flashWord && f.cat === "bonus");
    return { cells: findPath(layout, flashWord) ?? [], bonus };
  }, [layout, flashWord, progress.found]);

  const submit = useCallback((path: number[]) => {
    if (!board || !layout) return;
    const key = path.map(i => layout.letters[i]).join("");
    const seq = ++submitSeq.current;
    setPending(null);
    if (key.length < MIN_LEN) {
      if (key.length > 1) setToast({ kind: "info", text: "צריך לפחות 4 אותיות" });
      return;
    }
    const prev = progressRef.current.found.find(f => norm(f.w) === key);
    if (prev) {
      setToast(prev.cat === "bonus"
        ? { kind: "bonus", text: `בונוס · ${prev.w} כבר נמצאה`, word: prev.w }
        : { kind: "info", text: `${prev.w} כבר נמצאה`, word: prev.w });
      return;
    }
    const date = board.date;
    // keep the swiped word up until the answer comes, instead of the old message
    setToast(null);
    setPending(withFinal(key));
    const say = (t: Toast) => {
      if (submitSeq.current !== seq) return;
      setPending(null);
      setToast(t);
    };
    api.check(date, path.map(i => layout.base[i])).then(r => {
      if (dateRef.current !== date) return;
      if (r.status !== "main" && r.status !== "bonus") {
        say({ kind: "bad", text: `${withFinal(key)} לא ברשימה` });
        return;
      }
      const { word: w, points, theme } = r;
      if (progressRef.current.found.some(f => f.w === w)) {
        say({ kind: "info", text: `${w} כבר נמצאה`, word: w });
        return;
      }
      const before = progressRef.current.found;
      const found: FoundWord[] = [...before, { w, cat: r.status, ...(theme ? { theme } : {}) }];
      update(date, p => ({ ...p, found }));
      // this find opened the next tile numbers: say so under its own message
      const levelOf = (f: FoundWord[]) => hintLevel(letterFraction(f, board.mainLetters));
      const unlocked = levelOf(found);
      const note = unlocked > levelOf(before) ? HINT_NOTES[unlocked as 1 | 2] : undefined;
      const done = r.status === "main" && found.filter(f => f.cat === "main").length === board.mainTotal;
      setFresh(w);
      if (done) say({ kind: "main", text: `${w}! סיימתם את כל המילים 🎉`, word: w });
      else if (r.status === "bonus") say({ kind: "bonus", text: `בונוס! ${w} · ${points} נק׳`, word: w });
      else if (theme) say({ kind: "main", text: `★ ${w} · מילת נושא · ${pointsText(points)}`, word: w, note });
      else say({ kind: "main", text: `${w} · ${pointsText(points)}`, word: w, note });
    }).catch(() => say({ kind: "bad", text: "אין חיבור לשרת, נסו שוב" }));
  }, [board, layout, update]);

  const rotate = useCallback(() => {
    if (board) update(board.date, p => ({ ...p, rot: (p.rot + 1) % 4 }));
  }, [board, update]);

  const isBonus = useCallback(
    (w: string) => progress.found.some(f => f.w === w && f.cat === "bonus"),
    [progress.found],
  );

  if (!board || !layout || board.date !== date) return { game: null, error };
  return {
    game: { board, layout, found: progress.found, fresh, live, hints, toast, pending, flash, showWord, submit, rotate, isBonus },
    error,
  };
}
