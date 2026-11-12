/**
 * Routing cells along a polyline (docs/specs/02 §D.15; 05 §E.1; FR-44; BD-59). TASK-23 (T23.07).
 * A leg whose geometry is a display polyline (CONTINUE_SKIP) has no cell path, so `toLeg` cannot measure it. This
 * walks the polyline through the grid, cell by cell, in projected metres (Mars CRS; no Earth radius), and returns the
 * cells for `toLeg`. Pure and deterministic.
 */
import type { LoadedGrid } from "./grid";

/**
 * The cells a polyline passes through, in order of travel, as array offsets (05 §E.1). Consecutive repeats collapse;
 * a cell visited again later stays. Steps are to the 8 neighbours, like the router's: where the line passes exactly
 * through a cell corner it steps diagonally (the two side cells are touched at a point only and are not listed).
 * A vertex is in the cell `cellIndex` gives it (floor). The traversal stops at the first vertex or crossing outside the
 * grid, or at a non-finite vertex, and returns what it has (a segment that leaves the grid contributes the cells up to
 * the edge); a polyline that starts outside, or is empty, gives [].
 */
export function cellsAlongPath(grid: LoadedGrid, polyline: readonly (readonly [number, number])[]): number[] {
  const { width, height, cell_m, origin_m } = grid.meta;
  const out: number[] = [];
  const toCol = (x: number): number => Math.floor((x - origin_m[0]) / cell_m);
  const toRow = (y: number): number => Math.floor((origin_m[1] - y) / cell_m);
  const inside = (r: number, c: number): boolean => r >= 0 && r < height && c >= 0 && c < width;
  const push = (r: number, c: number): void => {
    const k = r * width + c;
    if (out[out.length - 1] !== k) out.push(k);
  };

  let prev: readonly [number, number] | null = null;
  for (const p of polyline) {
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return out;
    const c1 = toCol(x);
    const r1 = toRow(y);
    if (prev === null) {
      if (!inside(r1, c1)) return out;
      push(r1, c1);
      prev = p;
      continue;
    }

    // Cell-space coordinates of the segment: u grows east, v grows south (row 0 is north).
    const u0 = (prev[0] - origin_m[0]) / cell_m;
    const v0 = (origin_m[1] - prev[1]) / cell_m;
    const du = (x - origin_m[0]) / cell_m - u0;
    const dv = (origin_m[1] - y) / cell_m - v0;
    let c = Math.floor(u0);
    let r = Math.floor(v0);
    const stepC = du > 0 ? 1 : -1;
    const stepR = dv > 0 ? 1 : -1;
    // Parameter t (0 at prev, 1 at p) of the next cell edge in each direction; Infinity once that direction is done.
    const next = (done: boolean, d: number, u: number, cell: number, step: number): number => {
      if (done || d === 0) return Infinity;
      return ((step > 0 ? cell + 1 : cell) - u) / d;
    };
    let tC = next(c === c1, du, u0, c, stepC);
    let tR = next(r === r1, dv, v0, r, stepR);
    while (c !== c1 || r !== r1) {
      // Equal parameters: the line crosses a corner and steps diagonally.
      const stepInC = tC <= tR;
      const stepInR = tR <= tC;
      if (stepInC) c += stepC;
      if (stepInR) r += stepR;
      if (!inside(r, c)) return out;
      push(r, c);
      tC = next(c === c1, du, u0, c, stepC);
      tR = next(r === r1, dv, v0, r, stepR);
      if (tC === Infinity && tR === Infinity && (c !== c1 || r !== r1)) {
        // Float rounding left the end cell short of the DDA's last step: finish on the end cell.
        if (inside(r1, c1)) push(r1, c1);
        break;
      }
    }
    prev = p;
  }
  return out;
}
