import type { CSSProperties } from "react";
import { Modal, Sheet, SheetBody } from "../components";
import type { FoundWord, PublicBoard } from "../api/types";
import { groupOf, groupTitle, leftText } from "../lib/scoring";
import "./WordsModal.css";

interface ListProps {
  board: PublicBoard;
  found: FoundWord[];
  fresh: string | null;
  onWord: (word: string) => void;
}

/** On a phone: a modal opened from the "words" button. */
export function WordsModal({ open, onClose, ...list }: ListProps & { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="מילים">
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

/** Found words grouped by length, with how many are left in each group. */
function WordsList({ board, found, fresh, onWord }: ListProps) {
  const main = found.filter(f => f.cat === "main").map(f => f.w);
  const bonus = found.filter(f => f.cat === "bonus").map(f => f.w);
  const groups: GroupProps[] = [];
  if (board.theme && board.themeTotal) {
    const got = found.filter(f => f.theme).map(f => f.w);
    groups.push({ title: `מילות הנושא: ${board.theme}`, words: got, left: board.themeTotal - got.length, kind: "theme" });
  }
  for (const { length, total } of board.groups) {
    const got = main.filter(w => groupOf(w) === length);
    groups.push({ title: groupTitle(length), words: got, left: total - got.length });
  }
  groups.push({ title: "בונוס", words: bonus, left: board.bonusTotal - bonus.length, kind: "bonus" });
  return <>{groups.map((g, i) => <WordGroup key={g.title} {...g} index={i} fresh={fresh} onWord={onWord} />)}</>;
}

interface GroupProps {
  title: string;
  words: string[];
  left: number;
  kind?: "theme" | "bonus";
}

function WordGroup({ title, words, left, kind, index, fresh, onWord }:
  GroupProps & { index: number; fresh: string | null; onWord: (w: string) => void }) {
  return (
    <div className={"wgroup" + (kind ? " " + kind : "")} style={{ "--i": index } as CSSProperties}>
      <h3>{title}</h3>
      {words.length > 0 && (
        <div className="wlist">
          {words.map(w => (
            <button key={w} type="button" className={"w" + (w === fresh ? " fresh" : "")}
              title="הגדרה" onClick={() => onWord(w)}>{w}</button>
          ))}
        </div>
      )}
      <p className={"wleft" + (left === 0 ? " done" : "")}>{left === 0 ? "כל המילים נמצאו ✓" : leftText(left)}</p>
    </div>
  );
}
