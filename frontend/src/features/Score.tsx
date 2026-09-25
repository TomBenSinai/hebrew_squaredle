import { ProgressBar, type Mark } from "../components";
import { HINT_STARTS_AT, HINT_USES_AT, SHOW_USES_HINT } from "../lib/scoring";
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
}

// where the tile numbers unlock, in the numbers' own colors
const HINT_MARKS: Mark[] = SHOW_USES_HINT
  ? [
      { at: 100 * HINT_STARTS_AT, color: "var(--hint-starts)", label: "רמז ראשון - כמה מילים שמתחילות באות נותרו" },
      { at: 100 * HINT_USES_AT, color: "var(--hint-uses)", label: "רמז שני - כמה מילים שעוברות באות נותרו" },
    ]
  : [{ at: 100 * HINT_STARTS_AT, color: "var(--hint-starts)", label: "רמז - כמה מילים שמתחילות באות נותרו" }];

export function Score({ found, total, bonus, rank, fraction, onOpen }: Props) {
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
      <ProgressBar value={100 * fraction} label="התקדמות" marks={HINT_MARKS} />
    </div>
  );
}

/** Points to the start of reading (left in RTL): "open". */
function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
