/**
 * A synthetic world for the link tests (T26.06, T26.02; backend package 17): the F9 `losFlatWall` grid
 * (`packages/compute/tests/fixtures/v2grids.ts`: 5 m cells, mast 10 m at the origin, suit antenna 2 m, a 20 m wall at x = 500,
 * grid x -500..1500, y -250..250) with the wall shortened to |y| <= WALL_HALF_LEN_M so that a relay beside it can see both
 * sides (a full-height wall shadows everything behind it from every point on the hab's side).
 *
 * Synthetic shape, never data. The comm layer is built with compute's own `lineOfSight`, the oracle the engine uses.
 */
import { lineOfSight, type LoadedGrid } from "@marswalk/compute";
import { losFlatWall } from "../../../../packages/compute/tests/fixtures/v2grids";

/** Declared test shape: the wall covers |y| <= 100 m, so a relay at y = 200 m (inside the grid) is not shadowed by it. */
export const WALL_HALF_LEN_M = 100;

export function partialWall(): ReturnType<typeof losFlatWall> {
  const wall = losFlatWall();
  const { meta, elevation } = wall.grid;
  for (let i = 0; i < meta.height; i++) {
    const y = meta.origin_m[1] - (i + 0.5) * meta.cell_m;
    if (Math.abs(y) <= WALL_HALF_LEN_M) continue;
    for (let j = 0; j < meta.width; j++) if (elevation[i * meta.width + j] === wall.shape.wallHeight_m) elevation[i * meta.width + j] = 0;
  }
  return wall;
}

/** The static comm layer of a mast: 1 where `lineOfSight` from the mast to a target of `target_m` height holds, else 0. */
export function commLayer(grid: LoadedGrid, mast: { x_m: number; y_m: number; height_m: number }, target_m: number): Uint8Array {
  const { meta } = grid;
  const out = new Uint8Array(meta.width * meta.height);
  for (let i = 0; i < meta.height; i++) {
    for (let j = 0; j < meta.width; j++) {
      const x = meta.origin_m[0] + (j + 0.5) * meta.cell_m;
      const y = meta.origin_m[1] - (i + 0.5) * meta.cell_m;
      out[i * meta.width + j] = lineOfSight(grid, mast, { x_m: x, y_m: y, height_m: target_m }) ? 1 : 0;
    }
  }
  return out;
}
