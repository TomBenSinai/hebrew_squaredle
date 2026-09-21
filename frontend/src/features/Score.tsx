import { ProgressBar } from "../components";
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
      <ProgressBar value={100 * fraction} label="התקדמות" />
    </div>
  );
}
