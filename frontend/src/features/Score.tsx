import type { DayStats } from "../api/types";
import { GlobeIcon, ProgressBar, type Mark } from "../components";
import { HINTS } from "../lib/scoring";
import "./Score.css";

interface Props {
  found: number;
  total: number;
  /** bonus words found: extra, not part of the goal */
  bonus: number;
  rank: string;
  /** 0..1, by letters */
  fraction: number;
  /** tap the count to see the words; without it the count is plain text */
  onOpen?: () => void;
  /** how everyone did on the day (null until known) */
  crowd?: DayStats | null;
  isToday?: boolean;
}


// where each hint opens, in its own color
const HINT_MARKS: Mark[] = HINTS.map(h => ({ at: 100 * h.at, color: h.color, label: h.label }));

export function Score({ found, total, bonus, rank, fraction, onOpen, crowd, isToday }: Props) {
  const marks = crowd?.avgWords != null && crowd.avgFraction != null
    ? [...HINT_MARKS, crowdMark(crowd.avgWords, crowd.avgFraction, found, isToday)] : HINT_MARKS;
  const counter = (chev: boolean) => <>
    {bonus > 0 && <span className="bonus" dir="ltr" title="מילות בונוס">+{bonus}</span>}
    <span className="num"><span dir="ltr">{found}<small>/{total}</small></span></span>
    <span className="label">מילים שמצאת{chev && <Chevron />}</span>
  </>;
  return (
    <div className="score">
      <div className="count">
        {onOpen
          ? <button type="button" className="counter" onClick={onOpen} aria-haspopup="dialog">{counter(true)}</button>
          : <span className="counter plain">{counter(false)}</span>}
        <span className="rank">{rank}</span>
      </div>
      <ProgressBar value={100 * fraction} label="התקדמות" marks={marks} />
    </div>
  );
}

/** Everyone who played the day: a globe riding the bar at their average, its tip the numbers. */
function crowdMark(avgWords: number, avgFraction: number, found: number, isToday?: boolean): Mark {
  const avg = Math.round(avgWords);
  const line = `ממוצע ${avg} מילים`;
  const head = isToday ? "השחקנים היום" : "השחקנים ביום עצמו";
  return {
    at: 100 * avgFraction, color: "var(--ink)", icon: <GlobeIcon />,
    label: `${head}: ${line}`,
    tip: <>
      <span className="tiphead">{head}</span>
      {line}
      {found > avg && <><br /><span className="tipup">אתם מעל הממוצע</span></>}
    </>,
  };
}

/** Points forward in RTL (left), the way the list opens. */
function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
