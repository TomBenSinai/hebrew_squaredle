import { ProgressBar, type Mark } from "../components";
import { HINTS } from "../lib/scoring";
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

// where each hint opens, in its own color
const HINT_MARKS: Mark[] = HINTS.map(h => ({ at: 100 * h.at, color: h.color, label: h.label }));

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
