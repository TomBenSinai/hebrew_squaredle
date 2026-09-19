import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { DayProgress, FoundWord, PublicBoard } from "../api/types";
import { norm, withFinal } from "../lib/hebrew";
import { findPath, makeLayout, type Layout } from "../lib/layout";
import { pointsText } from "../lib/scoring";
import { progressStore } from "./progressStore";

export const MIN_LEN = 4;

export type ToastKind = "main" | "bonus" | "bad" | "info";
export interface Toast {
  kind: ToastKind;
  text: string;
  /** a found word inside `text`: tapping it opens its definition */
  word?: string;
}

export interface Game {
  board: PublicBoard;
  layout: Layout;
  found: FoundWord[];
  /** the word found last, underlined in the list */
  fresh: string | null;
  /** shown cells that some unfound main word still uses (null until known) */
  live: Set<number> | null;
  toast: Toast | null;
  /** a word's path lit up on the board for a moment */
  flash: { cells: number[]; bonus: boolean } | null;
  showWord: (word: string) => void;
  submit: (path: number[]) => void;
  rotate: () => void;
  isBonus: (word: string) => boolean;
}

/** One day's board and this player's progress on it. */
export function useGame(date: string | null): { game: Game | null; error: string | null } {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [progress, setProgress] = useState<DayProgress>({ found: [], rot: 0 });
  const [liveBase, setLiveBase] = useState<number[] | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
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
      setFresh(null);
      setLiveBase(null);
      setFlashWord(null);
    }).catch(() => { if (!stale) setError("לא הצלחנו לטעון את הלוח"); });
    return () => { stale = true; };
  }, [date]);

  const layout = useMemo(
    () => (board ? makeLayout(board.mask, board.letters, progress.rot) : null),
    [board, progress.rot],
  );

  // grey out letters no remaining main word needs; only main finds change this
  const mainKey = progress.found.filter(f => f.cat === "main").map(f => f.w).join(" ");
  useEffect(() => {
    if (!board) return;
    let stale = false;
    api.liveCells(board.date, mainKey ? mainKey.split(" ") : [])
      .then(r => { if (!stale) setLiveBase(r.cells); })
      .catch(() => {});
    return () => { stale = true; };
  }, [board, mainKey]);

  const live = useMemo(() => {
    if (!layout || !liveBase) return null;
    const set = new Set(liveBase);
    return new Set(layout.base.flatMap((b, i) => (set.has(b) ? [i] : [])));
  }, [layout, liveBase]);

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
    if (key.length < MIN_LEN) {
      if (key.length > 1) setToast({ kind: "info", text: "צריך לפחות 4 אותיות" });
      return;
    }
    const prev = progressRef.current.found.find(f => norm(f.w) === key);
    if (prev) {
      setToast(prev.cat === "bonus"
        ? { kind: "bonus", text: `בונוס · ${prev.w} כבר נמצאה`, word: prev.w }
        : { kind: "info", text: `${prev.w} כבר נמצאה`, word: prev.w });
      showWord(prev.w);
      return;
    }
    const date = board.date;
    api.check(date, path.map(i => layout.base[i])).then(r => {
      if (dateRef.current !== date) return;
      if (r.status !== "main" && r.status !== "bonus") {
        setToast({ kind: "bad", text: `${withFinal(key)} לא ברשימה` });
        return;
      }
      const { word: w, points, theme } = r;
      if (progressRef.current.found.some(f => f.w === w)) return;
      const found: FoundWord[] = [...progressRef.current.found, { w, cat: r.status, ...(theme ? { theme } : {}) }];
      update(date, p => ({ ...p, found }));
      const done = r.status === "main" && found.filter(f => f.cat === "main").length === board.mainTotal;
      setFresh(w);
      if (done) setToast({ kind: "main", text: `${w}! סיימתם את כל המילים 🎉`, word: w });
      else if (r.status === "bonus") setToast({ kind: "bonus", text: `בונוס! ${w} · ${points} נק׳`, word: w });
      else if (theme) setToast({ kind: "main", text: `★ ${w} · מילת נושא · ${pointsText(points)}`, word: w });
      else setToast({ kind: "main", text: `${w} · ${pointsText(points)}`, word: w });
    }).catch(() => setToast({ kind: "bad", text: "אין חיבור לשרת, נסו שוב" }));
  }, [board, layout, update, showWord]);

  const rotate = useCallback(() => {
    if (board) update(board.date, p => ({ ...p, rot: (p.rot + 1) % 4 }));
  }, [board, update]);

  const isBonus = useCallback(
    (w: string) => progress.found.some(f => f.w === w && f.cat === "bonus"),
    [progress.found],
  );

  if (!board || !layout || board.date !== date) return { game: null, error };
  return {
    game: { board, layout, found: progress.found, fresh, live, toast, flash, showWord, submit, rotate, isBonus },
    error,
  };
}
