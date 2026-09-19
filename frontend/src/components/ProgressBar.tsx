import "./ProgressBar.css";

interface Props {
  /** 0..100 */
  value: number;
  /** `bar`: the big striped loader; `slim`: the thin one in lists */
  variant?: "bar" | "slim";
  label?: string;
}

/** Fills from the start edge (the right in RTL). */
export function ProgressBar({ value, variant = "bar", label }: Props) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  if (variant === "slim") {
    return <span className="pbar slim" aria-hidden="true"><i style={{ width }} /></span>;
  }
  return (
    <div className="pbar" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <i style={{ width }} />
    </div>
  );
}
