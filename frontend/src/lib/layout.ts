import { norm } from "./hebrew";

/**
 * A board is any shape drawn on a grid: mask rows of X (cell) and . (empty).
 * Cells are numbered in reading order; two cells touch if they are next to
 * each other in any of the 8 directions (an empty spot blocks the path).
 */
export type Cell = readonly [row: number, col: number];

export interface Layout {
  rows: number;
  cols: number;
  cells: Cell[];            // position of each shown cell
  letters: string[];        // letter of each shown cell
  neighbors: number[][];    // shown cell -> touching shown cells
  base: number[];           // shown cell -> cell index on the stored (unrotated) board
}

export function cellsOf(mask: string[]): Cell[] {
  const out: Cell[] = [];
  mask.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "X") out.push([r, c]); }));
  return out;
}

function neighborsOf(cells: Cell[]): number[][] {
  const at = new Map(cells.map(([r, c], i) => [`${r},${c}`, i]));
  return cells.map(([r, c]) => {
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const j = at.get(`${r + dr},${c + dc}`);
      if ((dr || dc) && j !== undefined) out.push(j);
    }
    return out;
  });
}

/** The board turned `times` quarters: cell (r, c) moves to (c, rows-1-r). */
export function makeLayout(mask: string[], letters: string, times: number): Layout {
  let m = mask;
  let items = cellsOf(mask).map((_, i) => ({ letter: letters[i], base: i }));
  for (let t = 0; t < times % 4; t++) {
    const R = m.length, C = m[0].length;
    const moved = cellsOf(m).map(([r, c], i) => ({ r: c, c: R - 1 - r, ...items[i] }));
    const grid = Array.from({ length: C }, () => Array<string>(R).fill("."));
    moved.forEach(({ r, c }) => { grid[r][c] = "X"; });
    m = grid.map(row => row.join(""));
    moved.sort((a, b) => a.r - b.r || a.c - b.c);
    items = moved.map(({ letter, base }) => ({ letter, base }));
  }
  const cells = cellsOf(m);
  return {
    rows: m.length,
    cols: m[0].length,
    cells,
    letters: items.map(x => x.letter),
    neighbors: neighborsOf(cells),
    base: items.map(x => x.base),
  };
}

/** One path (shown cells) that spells the word, or null. */
export function findPath(layout: Layout, word: string): number[] | null {
  const w = norm(word), L = layout.letters;
  const go = (k: number, cell: number, used: number[]): number[] | null => {
    if (k === w.length) return used;
    for (const n of layout.neighbors[cell]) if (L[n] === w[k] && !used.includes(n)) {
      const r = go(k + 1, n, [...used, n]);
      if (r) return r;
    }
    return null;
  };
  for (let s = 0; s < L.length; s++) if (L[s] === w[0]) { const r = go(1, s, [s]); if (r) return r; }
  return null;
}
