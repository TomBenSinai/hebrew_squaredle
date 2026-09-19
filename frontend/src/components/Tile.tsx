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
  ref?: Ref<HTMLDivElement>;
}

/** One letter on the board, placed on the board's CSS grid. */
export function Tile({ letter, row, col, state = "idle", dead, ref }: Props) {
  const cls = ["tile",
    state === "on" && "on",
    (state === "show" || state === "show-bonus") && "show",
    state === "show-bonus" && "bonus",
    dead && "dead"].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls} style={{ gridRow: row + 1, gridColumn: col + 1 }} aria-label={"האות " + letter}>
      {letter}
    </div>
  );
}
