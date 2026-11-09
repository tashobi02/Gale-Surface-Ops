/**
 * Least-time route search on the 8-connected 5 m grid (docs/specs/02 §D.2; ADR-004).
 * FR-06, FR-07, FR-10; NFR-02 (≤ 2 s for a 3-stop loop), NFR-06 (deterministic).
 * Implemented by TASK-05 (T05.18).
 */
import { FLAG_BITS, type MissionScenario, type NoRouteReason } from "@marswalk/protocol";
import { cellIndex, decodeSlopeDeg, type LoadedGrid } from "./grid";
import { determineNoRoute } from "./noRoute";
import { stepTimeH } from "./timeModel";

/** Limits and multiplier constants from 02 §D.2. */
export const MAX_STOPS = 10;
export const MAX_NODE_EXPANSIONS = 3_000_000;
export const CAUTION_SLOPE_MULTIPLIER = 1.5;
export const LOW_TI_MULTIPLIER = 1.3;
export const TOBLER_UNSUITED_FLAT_KMH = 5.037;

/** Result of one leg search, before profile/time post-processing. */
export type LegSearch =
  | { status: "OK"; cells: number[] }
  | { status: "NO_ROUTE"; reason: NoRouteReason; nearest_reachable: { x_m: number; y_m: number } }
  | { status: "TIMEOUT" };

interface HeapNode {
  cell: number;
  f: number;
  h: number;
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private compare(a: HeapNode, b: HeapNode): number {
    // Smaller f comes first
    if (Math.abs(a.f - b.f) > 1e-12) {
      return a.f - b.f;
    }
    // Smaller h comes first
    if (Math.abs(a.h - b.h) > 1e-12) {
      return a.h - b.h;
    }
    // Deterministic tie-break by cell index (02 §D.2 (4))
    return a.cell - b.cell;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.compare(this.data[idx], this.data[parentIdx]) < 0) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[parentIdx];
        this.data[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number): void {
    const len = this.data.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;

      if (left < len && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < len && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== idx) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[smallest];
        this.data[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

/** Check if a cell is passable under the scenario hard slope limit and flag bits. */
export function isCellPassable(grid: LoadedGrid, idx: number, hardSlopeLimitDeg: number): boolean {
  const flags = grid.flags[idx];
  if ((flags & (1 << FLAG_BITS.NO_DATA)) !== 0) return false;
  if ((flags & (1 << FLAG_BITS.HARD_HAZARD)) !== 0) return false;

  const slope = decodeSlopeDeg(grid.slopeP90[idx]);
  if (slope === null || slope > hardSlopeLimitDeg) return false;

  if (isNaN(grid.elevation[idx])) return false;

  return true;
}

/**
 * Least-time path between two points. Input: start/end metres, scenario limits.
 * Output: unsimplified cell path or NO_ROUTE with reason and nearest reachable cell.
 */
export function searchLeg(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number },
  to: { x_m: number; y_m: number },
  scenario: MissionScenario,
  maxExpansions = MAX_NODE_EXPANSIONS,
): LegSearch {
  const { width, height, cell_m, origin_m } = grid.meta;
  const [origin_x, origin_y] = origin_m;
  const totalCells = width * height;

  const startIdx = cellIndex(grid, from.x_m, from.y_m);
  const endIdx = cellIndex(grid, to.x_m, to.y_m);

  // Endpoint validations
  if (startIdx === null || !isCellPassable(grid, startIdx, scenario.hard_slope_limit_deg)) {
    return {
      status: "NO_ROUTE",
      reason: "START_BLOCKED",
      nearest_reachable: { x_m: from.x_m, y_m: from.y_m },
    };
  }

  if (endIdx === null || !isCellPassable(grid, endIdx, scenario.hard_slope_limit_deg)) {
    return {
      status: "NO_ROUTE",
      reason: "END_BLOCKED",
      nearest_reachable: { x_m: from.x_m, y_m: from.y_m },
    };
  }

  if (startIdx === endIdx) {
    return { status: "OK", cells: [startIdx] };
  }

  const endRow = Math.floor(endIdx / width);
  const endCol = endIdx % width;
  const endElev = grid.elevation[endIdx];

  // Admissible heuristic speed: v_max = v0 * 6 / 5.037 (02 §D.2)
  const vMaxKmh = scenario.suited_flat_speed_kmh * (6 / TOBLER_UNSUITED_FLAT_KMH);

  function heuristic(r: number, c: number, elev: number): number {
    const dxM = (endCol - c) * cell_m;
    const dyM = (endRow - r) * cell_m;
    const dzM = endElev - elev;
    const dist3dKm = Math.hypot(dxM, dyM, dzM) / 1000;
    return dist3dKm / vMaxKmh;
  }

  const gScore = new Float64Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);

  const startRow = Math.floor(startIdx / width);
  const startCol = startIdx % width;
  const startH = heuristic(startRow, startCol, grid.elevation[startIdx]);

  gScore[startIdx] = 0;

  const openSet = new MinHeap();
  openSet.push({ cell: startIdx, f: startH, h: startH });

  let expansions = 0;
  const exploredCells: number[] = [];

  // 8-connected neighbor offsets: [dr, dc, isDiagonal]
  const neighbors: [number, number, boolean][] = [
    [-1, 0, false],
    [1, 0, false],
    [0, -1, false],
    [0, 1, false],
    [-1, -1, true],
    [-1, 1, true],
    [1, -1, true],
    [1, 1, true],
  ];

  const diagDistM = cell_m * Math.SQRT2;

  while (!openSet.isEmpty()) {
    const current = openSet.pop()!;
    const u = current.cell;

    if (u === endIdx) {
      // Reconstruct path
      const path: number[] = [];
      let curr = endIdx;
      while (curr !== -1) {
        path.push(curr);
        curr = cameFrom[curr];
      }
      path.reverse();
      return { status: "OK", cells: path };
    }

    if (closed[u]) {
      continue;
    }

    closed[u] = 1;
    expansions++;
    exploredCells.push(u);

    if (expansions >= maxExpansions) {
      return { status: "TIMEOUT" };
    }

    const uRow = Math.floor(u / width);
    const uCol = u % width;
    const uElev = grid.elevation[u];
    const currentG = gScore[u];

    for (const [dr, dc, isDiag] of neighbors) {
      const nr = uRow + dr;
      const nc = uCol + dc;

      if (nr < 0 || nr >= height || nc < 0 || nc >= width) {
        continue;
      }

      const v = nr * width + nc;
      if (closed[v]) {
        continue;
      }

      if (!isCellPassable(grid, v, scenario.hard_slope_limit_deg)) {
        continue;
      }

      const vElev = grid.elevation[v];
      const dM = isDiag ? diagDistM : cell_m;
      const dzM = vElev - uElev;

      // Caution and low-TI multipliers on the destination cell (02 §D.2)
      let multiplier = 1.0;
      const slopeMax = decodeSlopeDeg(grid.slopeMax[v]) ?? 0;
      if (slopeMax > scenario.caution_slope_deg) {
        multiplier *= CAUTION_SLOPE_MULTIPLIER;
      }
      if ((grid.flags[v] & (1 << FLAG_BITS.LOW_TI)) !== 0) {
        multiplier *= LOW_TI_MULTIPLIER;
      }

      const stepCostH = stepTimeH(dM, dzM, scenario.suited_flat_speed_kmh, multiplier);
      const tentativeG = currentG + stepCostH;

      if (tentativeG < gScore[v]) {
        cameFrom[v] = u;
        gScore[v] = tentativeG;
        const h = heuristic(nr, nc, vElev);
        openSet.push({ cell: v, f: tentativeG + h, h });
      }
    }
  }

  // If open set is exhausted without finding the target, determine no-route reason
  const noRouteInfo = determineNoRoute(grid, to, exploredCells, scenario.hard_slope_limit_deg);
  return {
    status: "NO_ROUTE",
    reason: noRouteInfo.reason,
    nearest_reachable: noRouteInfo.nearest_reachable,
  };
}
