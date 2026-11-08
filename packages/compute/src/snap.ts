/**
 * Snapping clicked waypoints to the nearest passable cell (docs/specs/02 §D.2 "Snapping").
 * FR-06. Implemented by TASK-05 (T05.20).
 */
import { FLAG_BITS, type MissionScenario } from "@marswalk/protocol";
import { decodeSlopeDeg, type LoadedGrid } from "./grid";

export const SNAP_RADIUS_M = 50;

/**
 * Nearest passable cell within snapRadiusM (default SNAP_RADIUS_M), or null.
 * A cell is passable if slope_p90 <= hard_slope_limit_deg and no HARD_HAZARD / NO_DATA flags.
 *
 * Deterministic tie-breaking: when multiple cells have the same minimal distance,
 * the cell with the lowest cell index is chosen.
 */
export function snapToPassable(
  grid: LoadedGrid,
  x_m: number,
  y_m: number,
  scenario: MissionScenario | { hard_slope_limit_deg: number },
  snapRadiusM = SNAP_RADIUS_M,
): { x_m: number; y_m: number; distance_m: number } | null {
  const hardLimit =
    "hard_slope_limit_deg" in scenario ? scenario.hard_slope_limit_deg : 15;

  const { width, height, cell_m, origin_m } = grid.meta;
  const [origin_x, origin_y] = origin_m;

  const minX = x_m - snapRadiusM;
  const maxX = x_m + snapRadiusM;
  const minY = y_m - snapRadiusM;
  const maxY = y_m + snapRadiusM;

  const colMin = Math.max(0, Math.floor((minX - origin_x) / cell_m) - 1);
  const colMax = Math.min(width - 1, Math.ceil((maxX - origin_x) / cell_m) + 1);
  const rowMin = Math.max(0, Math.floor((origin_y - maxY) / cell_m) - 1);
  const rowMax = Math.min(height - 1, Math.ceil((origin_y - minY) / cell_m) + 1);

  if (colMin > colMax || rowMin > rowMax) {
    return null;
  }

  let bestDist = Infinity;
  let bestCell = -1;
  let bestX = 0;
  let bestY = 0;

  for (let r = rowMin; r <= rowMax; r++) {
    const rowOffset = r * width;
    const cy = origin_y - (r + 0.5) * cell_m;

    for (let c = colMin; c <= colMax; c++) {
      const idx = rowOffset + c;

      // Passability check per 02 §D.2
      const flagByte = grid.flags[idx];
      if ((flagByte & (1 << FLAG_BITS.NO_DATA)) !== 0) continue;
      if ((flagByte & (1 << FLAG_BITS.HARD_HAZARD)) !== 0) continue;

      if (grid.elevation && isNaN(grid.elevation[idx])) continue;

      const rawSlope = grid.slopeP90[idx];
      if (rawSlope === 255) continue;

      const slopeDeg = decodeSlopeDeg(rawSlope);
      if (slopeDeg === null || slopeDeg > hardLimit) continue;

      const cx = origin_x + (c + 0.5) * cell_m;
      const dist = Math.hypot(cx - x_m, cy - y_m);

      if (dist > snapRadiusM + 1e-9) continue;

      if (dist < bestDist - 1e-9) {
        bestDist = dist;
        bestCell = idx;
        bestX = cx;
        bestY = cy;
      } else if (Math.abs(dist - bestDist) <= 1e-9 && (bestCell === -1 || idx < bestCell)) {
        bestDist = dist;
        bestCell = idx;
        bestX = cx;
        bestY = cy;
      }
    }
  }

  if (bestCell === -1) {
    return null;
  }

  return {
    x_m: bestX,
    y_m: bestY,
    distance_m: bestDist,
  };
}
