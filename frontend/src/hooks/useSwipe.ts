import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Layout } from "../lib/layout";

/**
 * Drag across tiles to spell a word. Every press starts a new word; only a
 * swipe (not a tap) sends it. Dragging back onto the previous tile undoes a step.
 */
export function useSwipe(
  layout: Layout,
  tiles: RefObject<(HTMLDivElement | null)[]>,
  onSwipe: (path: number[]) => void,
  disabled = false,
  /** a press that never left its tile (a swipe that found no neighbor isn't one) */
  onTap?: () => void,
) {
  const [path, setPath] = useState<number[]>([]);
  const pathRef = useRef<number[]>([]);
  const drag = useRef({ active: false, moved: false, left: false, start: new DOMRect(), rects: [] as DOMRect[] });

  const set = (p: number[]) => { pathRef.current = p; setPath(p); };

  const tileAt = (x: number, y: number) => {
    const rects = drag.current.rects;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width * 0.45) return i;
    }
    return -1;
  };

  const clear = useCallback(() => { drag.current.active = false; set([]); }, []);

  // a new layout (rotation, another day) invalidates the cells in the path
  useEffect(clear, [layout, clear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clear]);

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (disabled) return;
      drag.current.rects = (tiles.current ?? []).map(t => t?.getBoundingClientRect() ?? new DOMRect());
      const i = tileAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current.active = true;
      drag.current.moved = false;
      drag.current.left = false;
      drag.current.start = drag.current.rects[i];
      set([i]);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!drag.current.active) return;
      const s = drag.current.start;
      if (e.clientX < s.left || e.clientX > s.right || e.clientY < s.top || e.clientY > s.bottom) drag.current.left = true;
      const i = tileAt(e.clientX, e.clientY);
      const p = pathRef.current;
      if (i < 0) return;
      if (p.length >= 2 && i === p[p.length - 2]) set(p.slice(0, -1));                 // back up
      else if (!p.includes(i) && (!p.length || layout.neighbors[p[p.length - 1]].includes(i))) set([...p, i]);
      else return;
      drag.current.moved = true;
    },
    onPointerUp() {
      if (!drag.current.active) return;
      drag.current.active = false;
      const p = pathRef.current;
      set([]);
      if (drag.current.moved) onSwipe(p);
      else if (!drag.current.left) onTap?.();
    },
    onPointerCancel: clear,
  };

  return { path, handlers };
}
