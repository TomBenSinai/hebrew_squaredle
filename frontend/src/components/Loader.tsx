import "./Loader.css";

interface Props {
  /** read to screen readers, and shown under the mark */
  label?: string;
  /** `lg`: the whole screen while the game loads, with the wordmark; `sm`: inside a card */
  size?: "sm" | "lg";
}

/** The logo's four tiles, the amber one walking round them like a swipe.
 *  index.html carries a copy of the `lg` one for the paint before the app loads. */
export function Loader({ label = "טוען", size = "sm" }: Props) {
  return (
    <div className={"loader " + size} role="status" aria-label={label}>
      <span className="loader-mark" aria-hidden="true"><i /><i /><i /><i /></span>
      {size === "lg"
        ? <span className="loader-word" aria-hidden="true">ריבועון</span>
        : label && <span className="loader-label" aria-hidden="true">{label}</span>}
    </div>
  );
}
