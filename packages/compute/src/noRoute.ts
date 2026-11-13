/**
 * No-route failure classification and nearest reachable cell calculation (docs/specs/02 §D.2; 05 NoRouteReason).
 * FR-07. Implemented by TASK-05 (T05.19).
 */
import { FLAG_BITS, type NoRouteReason } from "@marswalk/protocol";
import { decodeSlopeDeg, type LoadedGrid } from "./grid";

export interface NoRouteInfo {
  reason: NoRouteReason;
  nearest_reachable: { x_m: number; y_m: number };
}

/**
 * Determine the reason why a leg could not be routed and find the nearest
 * explored/reachable cell to the destination.
 *
 * Mixed barriers (BD-46): the reason is the barrier kind that is most frequent on the explored boundary; ties go to
 * hazard, then slope, then no-data. The slope limit is the caller's (the scenario's), never a default here.
 */
export function determineNoRoute(
  grid: LoadedGrid,
  target: { x_m: number; y_m: number },
  exploredCells: Set<number> | number[],
  hardSlopeLimitDeg: number,
): NoRouteInfo {
  const { width, height, cell_m, origin_m } = grid.meta;
  const [origin_x, origin_y] = origin_m;

  const cells = Array.isArray(exploredCells) ? exploredCells : Array.from(exploredCells);

  if (cells.length === 0) {
    return {
      reason: "START_BLOCKED",
      nearest_reachable: { x_m: target.x_m, y_m: target.y_m },
    };
  }

  // 1. Find nearest reachable cell by Euclidean distance to target
  let bestDist = Infinity;
  let bestCell = cells[0];
  let bestX = origin_x + ((bestCell % width) + 0.5) * cell_m;
  let bestY = origin_y - (Math.floor(bestCell / width) + 0.5) * cell_m;

  for (const cell of cells) {
    const r = Math.floor(cell / width);
    const c = cell % width;
    const cx = origin_x + (c + 0.5) * cell_m;
    const cy = origin_y - (r + 0.5) * cell_m;
    const dist = Math.hypot(cx - target.x_m, cy - target.y_m);

    if (dist < bestDist - 1e-9) {
      bestDist = dist;
      bestCell = cell;
      bestX = cx;
      bestY = cy;
    } else if (Math.abs(dist - bestDist) <= 1e-9 && cell < bestCell) {
      // Deterministic tie-break by cell index
      bestCell = cell;
      bestX = cx;
      bestY = cy;
    }
  }

  // 2. Classify barrier along the boundary of the explored component
  // Use typed arrays instead of allocating Sets over up to 1.4 M explored cells (TASK-05 / #74)
  const totalCells = width * height;
  const isExplored = new Uint8Array(totalCells);
  for (let i = 0; i < cells.length; i++) {
    isExplored[cells[i]] = 1;
  }

  const isBoundary = new Uint8Array(totalCells);
  const boundaryCells: number[] = [];

  const neighbors: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const r = Math.floor(cell / width);
    const c = cell % width;

    for (let k = 0; k < 8; k++) {
      const nr = r + neighbors[k][0];
      const nc = c + neighbors[k][1];
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
        const nIdx = nr * width + nc;
        if (isExplored[nIdx] === 0 && isBoundary[nIdx] === 0) {
          isBoundary[nIdx] = 1;
          boundaryCells.push(nIdx);
        }
      }
    }
  }

  let hazardCount = 0;
  let noDataCount = 0;
  let slopeCount = 0;

  for (const bIdx of boundaryCells) {
    const flags = grid.flags[bIdx];
    const isHazard = (flags & (1 << FLAG_BITS.HARD_HAZARD)) !== 0;
    const isNoData =
      (flags & (1 << FLAG_BITS.NO_DATA)) !== 0 ||
      isNaN(grid.elevation[bIdx]) ||
      grid.slopeP90[bIdx] === 255;
    const slope = decodeSlopeDeg(grid.slopeP90[bIdx]);
    const isSlopeOver = slope !== null && slope > hardSlopeLimitDeg;

    if (isHazard) hazardCount++;
    if (isNoData) noDataCount++;
    if (isSlopeOver) slopeCount++;
  }

  let reason: NoRouteReason = "DISCONNECTED_BY_SLOPE";

  if (hazardCount > 0 && hazardCount >= slopeCount && hazardCount >= noDataCount) {
    reason = "DISCONNECTED_BY_HAZARD";
  } else if (slopeCount > 0 && slopeCount >= noDataCount && slopeCount >= hazardCount) {
    reason = "DISCONNECTED_BY_SLOPE";
  } else if (noDataCount > 0) {
    reason = "DISCONNECTED_BY_NODATA";
  }

  return {
    reason,
    nearest_reachable: { x_m: bestX, y_m: bestY },
  };
}
