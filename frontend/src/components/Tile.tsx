import type { Ref } from "react";
import "./Tile.css";

export type TileState = "idle" | "on" | "show" | "show-bonus";

interface Props {
  letter: string;
  row: number;
  col: number;
  state?: TileState;
  /** no main word left uses this letter */
  dead?: boolean;
  /** main words left that start here (top corner); hidden when undefined or 0 */
  starts?: number;
  /** main words left that pass through here (bottom corner); hidden when undefined or 0 */
  uses?: number;
  ref?: Ref<HTMLDivElement>;
}

/** One letter on the board, placed on the board's CSS grid. */
export function Tile({ letter, row, col, state = "idle", dead, starts, uses, ref }: Props) {
  const cls = ["tile",
    state === "on" && "on",
    (state === "show" || state === "show-bonus") && "show",
    state === "show-bonus" && "bonus",
    dead && "dead"].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls} style={{ gridRow: row + 1, gridColumn: col + 1 }} aria-label={"האות " + letter}>
      {letter}
      {/* keyed by the count, so it pops again each time it drops */}
      {!!starts && <span key={`s${starts}`} className="hint starts" aria-hidden="true">{starts}</span>}
      {!!uses && <span key={`u${uses}`} className="hint uses" aria-hidden="true">{uses}</span>}
    </div>
  );
}
