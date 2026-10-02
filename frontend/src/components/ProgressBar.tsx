import type { CSSProperties, ReactNode } from "react";
import "./ProgressBar.css";

export interface Mark {
  /** 0..100 */
  at: number;
  /** any CSS color */
  color: string;
  /** what the point means: read out, and shown on hover, focus or tap unless `tip` is given */
  label: string;
  /** a richer tip than the label */
  tip?: ReactNode;
  /** a round pin with this icon, sitting on the bar, instead of a dot */
  icon?: ReactNode;
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
  const bar = (
    <div className="pbar" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <i style={{ width }} />
    </div>
  );
  if (!marks.length) return bar;
  // the marks sit outside the bar, which clips, so their labels can show above it
  return (
    <div className="pbarwrap">
      {bar}
      {marks.map((m, i) => (
        <span key={i} className={"mark" + (m.icon ? " pin" : "") + (value >= m.at ? " reached" : "")} tabIndex={0}
          role="note" aria-label={m.label}
          style={{ insetInlineStart: `${m.at}%`, "--mark": m.color, "--at": m.at } as CSSProperties}>
          {m.icon && <span className="pinface">{m.icon}</span>}
          <span className="tip" aria-hidden="true">{m.tip ?? m.label}</span>
        </span>
      ))}
    </div>
  );
}
