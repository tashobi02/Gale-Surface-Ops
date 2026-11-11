/**
 * Leg post-processing and metric aggregation (docs/specs/02 §D.2; 05 Leg).
 * FR-07, FR-08. Implemented by TASK-05 (T05.21).
 */
import { FLAG_BITS, type Leg, type MissionScenario, type NoRouteLeg } from "@marswalk/protocol";
import { decodeSlopeDeg, type LoadedGrid } from "./grid";
import { CAUTION_SLOPE_MULTIPLIER, LOW_TI_MULTIPLIER, type LegSearch } from "./route";
import { sampleProfile } from "./sampling";
import { stepTimeH } from "./timeModel";

/**
 * Douglas–Peucker polyline simplification algorithm (02 §D.2).
 * Tolerance: epsilon (default 2.0 m).
 */
export function douglasPeucker(
  points: [number, number][],
  epsilon = 2.0,
): [number, number][] {
  if (points.length <= 2) {
    return points;
  }

  let maxDist = 0;
  let index = 0;

  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLen = Math.hypot(dx, dy);

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    let dist: number;
    if (lineLen === 0) {
      dist = Math.hypot(px - x1, py - y1);
    } else {
      // Perpendicular distance from (px, py) to segment (x1, y1)-(x2, y2)
      dist = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / lineLen;
    }

    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const rec2 = douglasPeucker(points.slice(index), epsilon);
    return rec1.slice(0, -1).concat(rec2);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

/**
 * Build a 05 Leg entity from a search result:
 * - Unsimplified cell path used for accurate slope, climb, descent, and distance metrics.
 * - Douglas–Peucker simplification (2 m tolerance) applied to geometry for display only.
 * - Computes walking duration using the walking-time model (timeModel.ts).
 *
 * TODO(decision): Leg metric definitions (spec question 10):
 * - distance_m is horizontal 2D ground track distance sum(hypot(dx, dy)) along cell centres.
 * - walk_time_min is the sum of stepTimeH along cell steps converted to minutes (* 60).
 * - climb_m / descent_m are the positive/negative elevation deltas along the cell path.
 * - max_slope_deg is the maximum decodeSlopeDeg across all cells in the path.
 * - NO_ROUTE legs carry status, reason, from, to, and optional nearest_reachable.
 */
export function toLeg(
  grid: LoadedGrid,
  fromId: string,
  toId: string,
  search: LegSearch,
  scenario: MissionScenario,
): Leg {
  if (search.status === "NO_ROUTE") {
    const leg: NoRouteLeg = {
      from: fromId,
      to: toId,
      status: "NO_ROUTE",
      reason: search.reason,
    };
    if (search.nearest_reachable) {
      leg.nearest_reachable = search.nearest_reachable;
    }
    return leg;
  }

  if (search.status === "TIMEOUT") {
    throw new Error("Cannot assemble leg: search timed out");
  }

  const { width, cell_m, origin_m } = grid.meta;
  const [origin_x, origin_y] = origin_m;
  const cells = search.cells;

  const unsimplifiedPath: [number, number][] = cells.map((cell) => {
    const r = Math.floor(cell / width);
    const c = cell % width;
    return [
      origin_x + (c + 0.5) * cell_m,
      origin_y - (r + 0.5) * cell_m,
    ];
  });

  let totalDistM = 0;
  let totalWalkTimeH = 0;
  let climbM = 0;
  let descentM = 0;

  if (cells.length > 1) {
    for (let i = 0; i < cells.length - 1; i++) {
      const u = cells[i];
      const v = cells[i + 1];

      const dx = unsimplifiedPath[i + 1][0] - unsimplifiedPath[i][0];
      const dy = unsimplifiedPath[i + 1][1] - unsimplifiedPath[i][1];
      const d2dM = Math.hypot(dx, dy);
      totalDistM += d2dM;

      const dzM = grid.elevation[v] - grid.elevation[u];
      if (dzM > 0) {
        climbM += dzM;
      } else if (dzM < 0) {
        descentM += Math.abs(dzM);
      }

      // Step cost with caution and low-TI multipliers per 02 §D.2
      let multiplier = 1.0;
      const slopeMax = decodeSlopeDeg(grid.slopeMax[v]) ?? 0;
      if (slopeMax > scenario.caution_slope_deg) {
        multiplier *= CAUTION_SLOPE_MULTIPLIER;
      }
      if ((grid.flags[v] & (1 << FLAG_BITS.LOW_TI)) !== 0) {
        multiplier *= LOW_TI_MULTIPLIER;
      }

      const stepH = stepTimeH(d2dM, dzM, scenario.suited_flat_speed_kmh, multiplier);
      totalWalkTimeH += stepH;
    }
  }

  // Find maximum slope along traversed cells without spreading array to avoid call stack overflow (05 §C).
  // Note on slope metrics: 02 §D.3 uses slope_p90 for caution warnings and leg summary,
  // while 02 §D.2 uses slope_max for the A* step penalty multiplier (1.5x).
  let maxSlopeDeg = 0;
  for (let i = 0; i < cells.length; i++) {
    const deg = decodeSlopeDeg(grid.slopeP90[cells[i]]) ?? 0;
    if (deg > maxSlopeDeg) {
      maxSlopeDeg = deg;
    }
  }

  const geometry = douglasPeucker(unsimplifiedPath, 2.0);
  const profile = sampleProfile(
    grid,
    unsimplifiedPath,
    scenario.caution_slope_deg,
    scenario.hard_slope_limit_deg,
  );

  return {
    from: fromId,
    to: toId,
    status: "OK",
    distance_m: totalDistM,
    walk_time_min: totalWalkTimeH * 60,
    climb_m: climbM,
    descent_m: descentM,
    max_slope_deg: maxSlopeDeg,
    geometry,
    cell_path_length: cells.length,
    profile,
  };
}
