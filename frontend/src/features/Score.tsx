import { ProgressBar, type Mark } from "../components";
import { HINT_STARTS_AT, HINT_USES_AT } from "../lib/scoring";
import "./Score.css";

interface Props {
  found: number;
  total: number;
  /** all found words, bonus included */
  points: number;
  rank: string;
  /** 0..1, by letters */
  fraction: number;
  /** the word just found: bumps the points */
  fresh: string | null;
}

// where the tile numbers unlock, in the numbers' own colors
const HINT_MARKS: Mark[] = [
  { at: 100 * HINT_STARTS_AT, color: "var(--hint-starts)", label: "רמז ראשון - כמה מילים שמתחילות באות נותרו" },
  { at: 100 * HINT_USES_AT, color: "var(--hint-uses)", label: "רמז שני - כמה מילים שעוברות באות נותרו" },
];

export function Score({ found, total, points, rank, fraction, fresh }: Props) {
  return (
    <div className="score">
      <div className="count">
        <span className="num"><span dir="ltr">{found}<small>/{total}</small></span></span>
        <span className="label">מילים שמצאת</span>
        <span className="tally">
          <span className="points">
            <b key={fresh ?? ""} className={fresh ? "bump" : undefined}>{points}</b> <abbr title="נקודות">נק׳</abbr>
          </span>
          <span className="rank">{rank}</span>
        </span>
      </div>
      <ProgressBar value={100 * fraction} label="התקדמות" marks={HINT_MARKS} />
    </div>
  );
}
