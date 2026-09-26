import { useCallback, useState, type CSSProperties } from "react";
import { Modal, Sheet, SheetBody } from "../components";
import type { FoundWord, PublicBoard, Reveal } from "../api/types";
import { norm } from "../lib/hebrew";
import { groupOf, groupOfLength, groupTitle, leftText, type HintId } from "../lib/scoring";
import "./WordsModal.css";

interface ListProps {
  board: PublicBoard;
  found: FoundWord[];
  fresh: string | null;
  /** the main words still missing, part-spelled; null while the hint is shut */
  reveals: Reveal[] | null;
  /** the hints this player has opened on this board */
  hintsOpen: Set<HintId>;
  /** sort the groups by alphabet; held above so panel and modal stay in step */
  az: boolean;
  onToggleSort: () => void;
  onWord: (word: string) => void;
}

/** On a phone: a modal opened by tapping the word count. */
export function WordsModal({ open, onClose, sheetClassName, ...list }:
  ListProps & { open: boolean; onClose: () => void; sheetClassName?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="מילים" sheetClassName={sheetClassName}>
      <SheetBody><WordsList {...list} /></SheetBody>
    </Modal>
  );
}

/** On a computer: always shown beside the board. */
export function WordsPanel({ className, ...list }: ListProps & { className?: string }) {
  return (
    <aside className={className} aria-label="המילים">
      <Sheet title={<>מילים <small className="wcount">{list.found.length}</small></>} className="wordspanel">
        <SheetBody><WordsList {...list} /></SheetBody>
      </Sheet>
    </aside>
  );
}

const SORT_KEY = "ribuon:words-az";
const readSort = () => { try { return localStorage.getItem(SORT_KEY) === "1"; } catch { return false; } };
const writeSort = (on: boolean) => { try { localStorage.setItem(SORT_KEY, on ? "1" : "0"); } catch { /* private mode */ } };

/**
 * The a-b sort, remembered across visits. The panel and the modal are both
 * mounted at once, so this belongs to the screen that holds them: one state,
 * or turning it on in one would leave the other unsorted.
 */
export function useWordSort() {
  const [az, setAz] = useState(readSort);
  const toggleSort = useCallback(() => setAz(on => { writeSort(!on); return !on; }), []);
  return { az, toggleSort };
}

/** One line of a group: a word already found, or a slot for one still missing. */
type Entry = { word: string } | { slot: Reveal };
const sortKey = (e: Entry) => ("word" in e ? norm(e.word) : e.slot.pre);

/**
 * Found words grouped by length, with how many are left in each group. Two
 * hints land here: sorting the groups by alphabet, and slots that part-spell
 * the main words still missing.
 */
function WordsList({ board, found, fresh, reveals, hintsOpen, az, onToggleSort, onWord }: ListProps) {
  const main = found.filter(f => f.cat === "main").map(f => f.w);
  const bonus = found.filter(f => f.cat === "bonus").map(f => f.w);
  const canSort = hintsOpen.has("sort");
  const slotsOf = (length: number) =>
    hintsOpen.has("reveal") && reveals
      ? reveals.filter(r => groupOfLength(r.n) === length)
          .sort((a, b) => a.pre.localeCompare(b.pre, "he") || a.post.localeCompare(b.post, "he"))
          .map((slot): Entry => ({ slot }))
      : [];

  const groups: GroupProps[] = [];
  if (board.theme && board.themeTotal) {
    const got = found.filter(f => f.theme).map(f => f.w);
    groups.push({
      title: `מילות הנושא: ${board.theme}`, entries: got.map(word => ({ word })),
      left: board.themeTotal - got.length, kind: "theme",
    });
  }
  for (const { length, total } of board.groups) {
    const got = main.filter(w => groupOf(w) === length);
    groups.push({
      title: groupTitle(length),
      entries: [...got.map((word): Entry => ({ word })), ...slotsOf(length)],
      left: total - got.length,
    });
  }
  // (the tutorial's practice board has none; bonus words found still show)
  if (board.bonusTotal || bonus.length) groups.push({
    title: "בונוס", entries: bonus.map(word => ({ word })),
    left: Math.max(board.bonusTotal - bonus.length, 0), kind: "bonus",
  });

  if (canSort && az) {
    for (const g of groups) g.entries = [...g.entries].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "he"));
  }
  return (
    <>
      {canSort && (
        <div className="wsort">
          <button type="button" className={"sortbtn" + (az ? " on" : "")} aria-pressed={az} onClick={onToggleSort}>
            מיון לפי א-ב
          </button>
        </div>
      )}
      {groups.map((g, i) => <WordGroup key={g.title} {...g} index={i} fresh={fresh} onWord={onWord} />)}
    </>
  );
}

interface GroupProps {
  title: string;
  entries: Entry[];
  left: number;
  kind?: "theme" | "bonus";
}

function WordGroup({ title, entries, left, kind, index, fresh, onWord }:
  GroupProps & { index: number; fresh: string | null; onWord: (w: string) => void }) {
  return (
    <div className={"wgroup" + (kind ? " " + kind : "")} style={{ "--i": index } as CSSProperties}>
      <h3>{title}</h3>
      {entries.length > 0 && (
        <div className="wlist">
          {entries.map((e, i) => ("word" in e
            ? <button key={e.word} type="button" className={"w" + (e.word === fresh ? " fresh" : "")}
                title="הגדרה" onClick={() => onWord(e.word)}>{e.word}</button>
            : <Slot key={`slot${i}`} reveal={e.slot} />))}
        </div>
      )}
      <p className={"wleft" + (left === 0 ? " done" : "")}>{left === 0 ? "כל המילים נמצאו ✓" : leftText(left)}</p>
    </div>
  );
}

/** A word not found yet: its opening (and sometimes closing) letters, the rest blanked. */
function Slot({ reveal: { n, pre, post } }: { reveal: Reveal }) {
  const blanks = n - pre.length - post.length;
  // the dots are hidden from screen readers, so the whole hint rides on this
  // name; a plain span has no role to carry one, hence role="img"
  const label = `מילה בת ${n} אותיות שמתחילה ב־${pre}` + (post ? ` ומסתיימת ב־${post}` : "");
  return (
    <span className="w slot" role="img" aria-label={label}>
      <span className="on">{pre}</span>
      {Array.from({ length: blanks }, (_, i) => <span key={i} className="off" aria-hidden="true">·</span>)}
      {post && <span className="on">{post}</span>}
    </span>
  );
}
