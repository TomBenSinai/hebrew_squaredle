import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { CellCounts, DayProgress, FoundWord, PublicBoard, Reveal } from "../api/types";
import { norm, withFinal } from "../lib/hebrew";
import { useFlash } from "../hooks/useFlash";
import { findPath, makeLayout, type Layout } from "../lib/layout";
import { hintById, letterFraction, openHints, type HintId } from "../lib/scoring";
import { progressStore } from "./progressStore";

export const MIN_LEN = 4;

export type ToastKind = "main" | "bonus" | "bad" | "info";
export interface Toast {
  kind: ToastKind;
  text: string;
  /** a found word inside `text`: tapping it opens its definition */
  word?: string;
  /** a second line: the find opened a new hint */
  note?: { hint: HintId; text: string };
}

/** The messages a swipe can get, shared with the tutorial so it teaches the real thing. */
export const say = {
  /** null: a lone tile is no attempt at a word, so it gets no message */
  tooShort: (key: string): Toast | null => (key.length > 1 ? { kind: "info", text: `צריך לפחות ${MIN_LEN} אותיות` } : null),
  notInList: (key: string): Toast => ({ kind: "bad", text: `${withFinal(key)} לא ברשימה` }),
  again: (w: string): Toast => ({ kind: "info", text: `${w} כבר נמצאה`, word: w }),
  found: (w: string): Toast => ({ kind: "main", text: w, word: w }),
};

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
  /** the main words still missing, part-spelled; null until the hint is open */
  reveals: Reveal[] | null;
  toast: Toast | null;
  /** a swiped word waiting for the server's answer, shown in place of the toast */
  pending: string | null;
  /** a word's path lit up on the board for a moment */
  flash: { cells: number[]; bonus: boolean } | null;
  showWord: (word: string) => void;
  submit: (path: number[]) => void;
  rotate: () => void;
}

export interface Hints {
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
  const [flashWord, showWord] = useFlash<string>();
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    // the numbers stay hidden until counts for these finds arrive, so keep
    // trying: back off up to 30s, and go again as soon as we're back online
    let delay = 2000;
    const load = () => {
      clearTimeout(timer);
      api.liveCells(board.date, mainKey ? mainKey.split(" ") : [])
        .then(r => { if (!stale) setCounts({ ...r, key: mainKey }); })
        .catch(() => {
          if (stale) return;
          timer = setTimeout(load, delay);
          delay = Math.min(delay * 2, 30000);
        });
    };
    load();
    window.addEventListener("online", load);
    return () => {
      stale = true;
      clearTimeout(timer);
      window.removeEventListener("online", load);
    };
  }, [board, mainKey]);

  const live = useMemo(() => {
    if (!layout || !counts) return null;
    const set = new Set(counts.cells);
    return new Set(layout.base.flatMap((b, i) => (set.has(b) ? [i] : [])));
  }, [layout, counts]);

  // the server only sends what the player has unlocked, but numbers counted
  // before the latest find would still include it: show none until the new
  // counts arrive (the greying above can lag, it only errs safe)
  const shownCounts = counts && counts.key === mainKey ? counts : null;
  const hints = useMemo((): Hints | null => {
    if (!layout || !shownCounts) return null;
    const { starts, uses } = shownCounts;
    return {
      starts: starts && layout.base.map(b => starts[b]),
      uses: uses && layout.base.map(b => uses[b]),
    };
  }, [layout, shownCounts]);
  // the slots must not blank out on every find while the new counts load: keep
  // the ones we have and drop those the words found since then have filled
  // (slots that spell the same are interchangeable, so one slot per word)
  const reveals = useMemo((): Reveal[] | null => {
    if (!counts?.reveals) return null;
    if (counts.key === mainKey) return counts.reveals;
    const had = new Set(counts.key ? counts.key.split(" ") : []);
    const left = [...counts.reveals];
    for (const w of mainKey ? mainKey.split(" ") : []) {
      if (had.has(w)) continue;
      const key = norm(w);
      const i = left.findIndex(r => r.n === key.length && key.startsWith(r.pre) && key.endsWith(norm(r.post)));
      if (i >= 0) left.splice(i, 1);
    }
    return left;
  }, [counts, mainKey]);

  const update = useCallback((date: string, fn: (p: DayProgress) => DayProgress) => {
    const next = fn(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    progressStore.save(date, next);
    return next;
  }, []);

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
      setToast(say.tooShort(key));
      return;
    }
    const prev = progressRef.current.found.find(f => norm(f.w) === key);
    if (prev) {
      setToast(prev.cat === "bonus"
        ? { kind: "bonus", text: `בונוס · ${prev.w} כבר נמצאה`, word: prev.w }
        : say.again(prev.w));
      return;
    }
    const date = board.date;
    // keep the swiped word up until the answer comes, instead of the old message
    setToast(null);
    setPending(withFinal(key));
    // answers can arrive out of order: the newest swipe owns the readout
    const latest = () => submitSeq.current === seq;
    const answer = (t: Toast) => {
      if (!latest()) return;
      setPending(null);
      setToast(t);
    };
    api.check(date, path.map(i => layout.base[i])).then(r => {
      if (dateRef.current !== date) return;
      if (r.status !== "main" && r.status !== "bonus") {
        answer(say.notInList(key));
        return;
      }
      const { word: w, theme } = r;
      if (progressRef.current.found.some(f => f.w === w)) {
        answer(say.again(w));
        return;
      }
      const before = progressRef.current.found;
      const found: FoundWord[] = [...before, { w, cat: r.status, ...(theme ? { theme } : {}) }];
      update(date, p => ({ ...p, found }));
      // this find opened a new hint: say so under its own message
      const openFor = (f: FoundWord[]) => openHints(letterFraction(f, board.mainLetters));
      const was = openFor(before);
      const opened = [...openFor(found)].find(id => !was.has(id));
      const hint = opened && hintById(opened);
      const note = hint ? { hint: hint.id, text: hint.note } : undefined;
      const done = r.status === "main" && found.filter(f => f.cat === "main").length === board.mainTotal;
      // the word is scored either way, but a newer swipe keeps the underline
      if (latest()) setFresh(w);
      if (done) answer({ kind: "main", text: `${w}! סיימתם את כל המילים`, word: w });
      else if (r.status === "bonus") answer({ kind: "bonus", text: `בונוס! ${w}`, word: w });
      else if (theme) answer({ kind: "main", text: `★ ${w} · מילת נושא`, word: w, note });
      else answer({ ...say.found(w), note });
    }).catch(() => answer({ kind: "bad", text: "אין חיבור לשרת, נסו שוב" }));
  }, [board, layout, update]);

  const rotate = useCallback(() => {
    if (board) update(board.date, p => ({ ...p, rot: (p.rot + 1) % 4 }));
  }, [board, update]);

  if (!board || !layout || board.date !== date) return { game: null, error };
  return {
    game: { board, layout, found: progress.found, fresh, live, hints, reveals, toast, pending, flash, showWord, submit, rotate },
    error,
  };
}
