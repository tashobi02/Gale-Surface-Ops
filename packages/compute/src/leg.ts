/**
 * Leg post-processing and metric aggregation (docs/specs/02 §D.2; 05 Leg).
 * FR-07, FR-08. Implemented by TASK-05 (T05.21).
 */
import { FLAG_BITS, type Leg, type MissionScenario, type NoRouteLeg } from "@marswalk/protocol";
import { decodeSlopeDeg, type LoadedGrid } from "./grid";
import { havenAlongRoute, type TimeField } from "./haven";
import { CAUTION_SLOPE_MULTIPLIER, LOW_TI_MULTIPLIER, type LegSearch } from "./route";
import { profileSamples, sampleProfile } from "./sampling";
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
 * The planning haven form's inputs for one leg (T09.09, 02 §D.8). The hab field is the suited walking-time
 * field of the hab (the plan's `role: "start"` waypoint); `ingress_s` is the suit ParamSet's
 * `hab_ingress_min` × 60 (the plan's `MissionScenario.hab_ingress_min` × 60). `vehicle` is the pressurized
 * rover's time field and its ingress, when the plan knows where the rover is parked; without it the
 * planning form has the hab branch only.
 */
export interface LegHaven {
  /** The hab's suited walking-time field (compute `habTimeField`). */
  hab: TimeField;
  /** Seconds to enter the hab and be sheltered (02 §D.8 `t_ingress`). */
  ingress_s: number;
  /** The pressurized rover's time field and its ingress, when the plan knows the rover. */
  vehicle?: { field: TimeField; ingress_s: number };
}

/**
 * Build a 05 Leg entity from a search result:
 * - Unsimplified cell path used for accurate slope, climb, descent, and distance metrics.
 * - Douglas–Peucker simplification (2 m tolerance) applied to geometry for display only.
 * - Computes walking duration using the walking-time model (timeModel.ts).
 * - With `haven`, the planning haven time at every profile sample (02 §D.8, T09.09).
 *
 * Leg metric definitions (BD-43, written into 05 Leg):
 * - distance_m is horizontal 2D ground track distance sum(hypot(dx, dy)) along cell centres.
 * - walk_time_min is the sum of stepTimeH along cell steps converted to minutes (* 60).
 * - climb_m / descent_m are the positive/negative elevation deltas along the cell path.
 * - max_slope_deg is the maximum decodeSlopeDeg across all cells in the path.
 * - NO_ROUTE legs carry status, reason, from, to, and optional nearest_reachable.
 *
 * The profile's `haven_min` (T09.09) is the planning approximation of 02 §D.8 in minutes, one per
 * profile sample, read at the sample's own position: `havenAlongRoute` over the profile's sample points.
 * It is `modelled (approximation)` (the module's `HAVEN_PLANNING_LABEL`), never `measured`. A sample the
 * model cannot reach is null, not a number. Without `haven` the profile carries no haven time at all.
 */
export function toLeg(
  grid: LoadedGrid,
  fromId: string,
  toId: string,
  search: LegSearch,
  scenario: MissionScenario,
  haven?: LegHaven,
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

  if (search.status === "TIMEOUT" || search.status === "CANCELLED") {
    throw new Error(`Cannot assemble leg: search ended with ${search.status}`);
  }

  // A MANUAL pair is never searched: its leg is measured from the drawn polyline, not assembled from a cell path
  // (N-160(c)). Reaching here means the two paths were mixed up.
  if (search.status === "MANUAL") {
    throw new Error("Cannot assemble leg: a manual leg is measured from the drawn polyline, not from a search");
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

  // The planning haven time (02 §D.8, T09.09): the planning approximation at every profile sample,
  // read at the sample's own position. Infinity (no haven reachable) becomes null, never a number.
  if (haven !== undefined) {
    const samples = profileSamples(unsimplifiedPath);
    const seconds = havenAlongRoute(
      grid,
      samples.map((s) => ({ x_m: s.x_m, y_m: s.y_m })),
      haven.hab,
      haven.vehicle?.field ?? null,
      scenario,
      { hab_s: haven.ingress_s, vehicle_s: haven.vehicle?.ingress_s ?? 0 },
    );
    profile.haven_min = seconds.map((s) => (Number.isFinite(s) ? s / 60 : null));
  }

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
