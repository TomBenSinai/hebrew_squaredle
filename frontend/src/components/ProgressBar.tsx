import type { CSSProperties } from "react";
import "./ProgressBar.css";

export interface Mark {
  /** 0..100 */
  at: number;
  /** any CSS color */
  color: string;
  label: string;
}

interface Props {
  /** 0..100 */
  value: number;
  /** `bar`: the big striped loader; `slim`: the thin one in lists */
  variant?: "bar" | "slim";
  label?: string;
  /** points along the bar (big bar only): hollow until the fill reaches them */
  marks?: Mark[];
}

/** Fills from the start edge (the right in RTL). */
export function ProgressBar({ value, variant = "bar", label, marks = [] }: Props) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  if (variant === "slim") {
    return <span className="pbar slim" aria-hidden="true"><i style={{ width }} /></span>;
  }
  return (
    <div className="pbar" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <i style={{ width }} />
      {marks.map(m => (
        <b key={m.at} className={"mark" + (value >= m.at ? " reached" : "")} title={m.label}
          style={{ insetInlineStart: `${m.at}%`, "--mark": m.color } as CSSProperties} />
      ))}
    </div>
  );
}
