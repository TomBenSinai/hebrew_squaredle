import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { Tile, type TileState } from "../components";
import type { Layout } from "../lib/layout";
import type { SpinPhase } from "../hooks/useSpin";
import "./Board.css";

interface Props {
  layout: Layout;
  path: number[];
  live: Set<number> | null;
  flash: { cells: number[]; bonus: boolean } | null;
  spin: SpinPhase;
  tileRefs: RefObject<(HTMLDivElement | null)[]>;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

/** The letter grid (any shape) with the swipe trace drawn over it. */
export function Board({ layout, path, live, flash, spin, tileRefs, handlers }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState({ box: "0 0 0 0", points: "", width: 0 });

  // the trace joins tile centres, so it's measured after layout (and on resize)
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      const rect = board.getBoundingClientRect();
      const points = path.map(i => {
        const r = tileRefs.current[i]?.getBoundingClientRect();
        return r ? `${r.left - rect.left + r.width / 2},${r.top - rect.top + r.height / 2}` : "";
      }).join(" ");
      setTrace({ box: `0 0 ${rect.width} ${rect.height}`, points, width: rect.width / 16 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board);
    return () => ro.disconnect();
  }, [path, layout, tileRefs]);

  const flashSet = new Set(flash?.cells);
  const stateOf = (i: number): TileState =>
    path.includes(i) ? "on" : flashSet.has(i) ? (flash!.bonus ? "show-bonus" : "show") : "idle";

  return (
    <div className="board" ref={boardRef} {...handlers}>
      <svg className="trace" viewBox={trace.box} aria-hidden="true">
        <polyline points={trace.points} strokeWidth={trace.width} />
      </svg>
      <div className={"tiles" + (spin === "spin" ? " spin" : spin === "settle" ? " settle" : "")}>
        {layout.letters.map((ch, i) => (
          <Tile key={`${layout.base[i]}`} ref={el => { tileRefs.current[i] = el; }}
            letter={ch} row={layout.cells[i][0]} col={layout.cells[i][1]}
            state={stateOf(i)} dead={live ? !live.has(i) : false} />
        ))}
      </div>
    </div>
  );
}

/** Size variables for the board's container: the shape's bounding box. */
export const boardVars = (layout: Layout) => ({
  "--rows": layout.rows,
  "--cols": layout.cols,
  "--maxd": Math.max(layout.rows, layout.cols),
}) as CSSProperties;
