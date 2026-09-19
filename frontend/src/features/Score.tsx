import { ProgressBar } from "../components";
import "./Score.css";

interface Props {
  found: number;
  total: number;
  rank: string;
  /** 0..1, by letters */
  fraction: number;
}

export function Score({ found, total, rank, fraction }: Props) {
  return (
    <div className="score">
      <div className="count">
        <span className="num"><span dir="ltr">{found}<small>/{total}</small></span></span>
        <span className="label">מילים שמצאת</span>
        <span className="rank">{rank}</span>
      </div>
      <ProgressBar value={100 * fraction} label="התקדמות" />
    </div>
  );
}
