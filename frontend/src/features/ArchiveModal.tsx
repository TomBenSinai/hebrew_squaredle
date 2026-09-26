import type { CSSProperties } from "react";
import { Modal, SheetBody, ProgressBar, ShapeIcon } from "../components";
import type { DayProgress, DaySummary } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import { letterFraction } from "../lib/scoring";
import "./ArchiveModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  days: DaySummary[];            // oldest first
  today: string;
  current: string;
  progress: Record<string, DayProgress>;
  onPick: (date: string) => void;
}

/** Every day so far, newest first, with this player's progress on each. */
export function ArchiveModal({ open, onClose, days, today, current, progress, onPick }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="ארכיון">
      <SheetBody>
        <div className="days">
          {[...days].reverse().map((d, k) => (
            <DayRow key={d.date} day={d} index={k} isToday={d.date === today} isCurrent={d.date === current}
              progress={progress[d.date]} onPick={() => onPick(d.date)} />
          ))}
        </div>
      </SheetBody>
    </Modal>
  );
}

interface RowProps {
  day: DaySummary;
  index: number;
  isToday: boolean;
  isCurrent: boolean;
  progress?: DayProgress;
  onPick: () => void;
}

function DayRow({ day, index, isToday, isCurrent, progress, onPick }: RowProps) {
  const found = progress?.found ?? [];
  const n = found.filter(f => f.cat === "main").length;
  const done = n === day.mainTotal;
  return (
    <button type="button" className={"day" + (isCurrent ? " current" : "") + (done ? " done" : "")}
      style={{ "--i": Math.min(index, 16) } as CSSProperties}
      aria-current={isCurrent || undefined} onClick={onPick}>
      <span className="dname">{isToday ? "היום" : weekday(day.date)} · {shortDate(day.date)}</span>
      <span className="dsub">
        לוח {day.number}
        {day.shapeName && <> · <span className="shape" title="צורת הלוח"><ShapeIcon />{day.shapeName}</span></>}
        {day.theme && ` · ★ ${day.theme}`}
      </span>
      <span className="dstat">
        <span className="dcount">{done ? "הושלם ✓" : <><b>{n}</b>/{day.mainTotal}</>}</span>
        <ProgressBar variant="slim" value={100 * letterFraction(found, day.mainLetters)} />
      </span>
    </button>
  );
}
