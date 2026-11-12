/**
 * Hazard and constraint warnings (docs/specs/01 FR-10; 05 §C Warning; 02 §E.2 PARTIAL rule).
 * Implemented by TASK-05 (T05.24).
 */
import { FLAG_BITS, type Leg, type MissionScenario, type PlanResult, type Warning, type Waypoint } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";
import { solarPosition, sunriseSunset } from "./sun";

/**
 * Count the number of stops (waypoints with role "stop") in a plan.
 * Used identically for dwell calculation in totals and in warnings.
 */
export function countStops(waypoints: Waypoint[]): number {
  return waypoints.filter((wp) => wp.role === "stop").length;
}

/** Site coordinate for the solar checks (lat planetocentric °, lon east-positive °). */
export interface WarningSite {
  lat: number;
  lon_e: number;
}

/**
 * DARKNESS (BD-49): the first leg where the sun is below the flat horizon at a timeline instant, or where the sunset
 * of the EVA's sol falls between two instants that are both lit. Instants in time order are each stop's arrival and its
 * departure (the dwell's end); an arrival belongs to the leg that ends there, a departure to the leg that starts
 * there. Needs the site; without it nothing is computed and nothing is guessed.
 */
function darknessWarning(
  timeline: PlanResult["stops_timeline"] | undefined,
  legCount: number,
  site: WarningSite | undefined,
): Warning | undefined {
  if (site === undefined || timeline === undefined || timeline.length === 0 || legCount === 0) return undefined;
  const lastLeg = legCount - 1;
  const instants: { utc: string; ms: number; leg: number }[] = [];
  timeline.forEach((entry, i) => {
    instants.push({ utc: entry.arrive_utc, ms: Date.parse(entry.arrive_utc), leg: Math.min(Math.max(i - 1, 0), lastLeg) });
    instants.push({ utc: entry.depart_utc, ms: Date.parse(entry.depart_utc), leg: Math.min(i, lastLeg) });
  });
  const make = (at_utc: string, leg: number): Warning => ({
    code: "DARKNESS",
    severity: "caution",
    leg,
    from_m: null,
    to_m: null,
    at_utc,
    message: `Sun below the horizon at ${at_utc} (leg ${leg + 1}); flat-horizon model`,
  });
  for (const instant of instants) {
    if (solarPosition(new Date(instant.ms), site.lat, site.lon_e).elevation_deg < 0) return make(instant.utc, instant.leg);
  }
  const sunset = Date.parse(sunriseSunset(new Date(instants[0].ms), site.lat, site.lon_e).sunset_utc);
  for (let i = 1; i < instants.length; i++) {
    if (instants[i - 1].ms < sunset && sunset <= instants[i].ms) return make(new Date(sunset).toISOString(), instants[i].leg);
  }
  return undefined;
}

/** Distance spans along a leg's unsimplified cell path where `flagged(cell)` holds, one per contiguous run. */
function runsAlongPath(grid: LoadedGrid, cells: readonly number[], flagged: (cell: number) => boolean): { from_m: number; to_m: number }[] {
  const runs: { from_m: number; to_m: number }[] = [];
  let distance = 0;
  let start: number | undefined;
  let end = 0;
  const close = () => {
    if (start !== undefined) runs.push({ from_m: start, to_m: end });
    start = undefined;
  };
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      const dr = Math.floor(cells[i] / grid.meta.width) - Math.floor(cells[i - 1] / grid.meta.width);
      const dc = (cells[i] % grid.meta.width) - (cells[i - 1] % grid.meta.width);
      distance += Math.hypot(dc * grid.meta.cell_m, dr * grid.meta.cell_m);
    }
    if (flagged(cells[i])) {
      if (start === undefined) start = distance;
      end = distance;
    } else {
      close();
    }
  }
  close();
  return runs;
}

/** A cell with no usable data: NO_DATA flag, NaN elevation or the u8 no-data slope (as noRoute.ts counts it). */
function isNoDataCell(grid: LoadedGrid, cell: number): boolean {
  return (grid.flags[cell] & (1 << FLAG_BITS.NO_DATA)) !== 0 || Number.isNaN(grid.elevation[cell]) || grid.slopeP90[cell] === 255;
}

/** True when any of the 8 neighbours of `cell` that lie in the grid is a no-data cell (BD-49). */
function hasNoDataNeighbour(grid: LoadedGrid, cell: number): boolean {
  const { width, height } = grid.meta;
  const row = Math.floor(cell / width);
  const col = cell % width;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < height && c >= 0 && c < width && isNoDataCell(grid, r * width + c)) return true;
    }
  }
  return false;
}

/**
 * Collect slope, TI_UNKNOWN, NO_ROUTE, EVA duration, walkback and darkness warnings.
 * Missing TI layer yields TI_UNKNOWN, never silence (05 §E.6). TASK-05.
 */
export function collectWarnings(
  legs: Leg[],
  scenario: MissionScenario,
  timeline: PlanResult["stops_timeline"] | undefined,
  maxWalkbackKm: number,
  grid?: LoadedGrid,
  waypoints?: Waypoint[],
  cellPaths?: (readonly number[] | undefined)[],
  site?: WarningSite,
): Warning[] {
  const warnings: Warning[] = [];

  // 1. Leg-level warnings (NO_ROUTE, OVER_HARD_SLOPE, CAUTION_SLOPE)
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.status === "NO_ROUTE") {
      warnings.push({
        code: "NO_ROUTE",
        severity: "blocked",
        leg: i,
        from_m: null,
        to_m: null,
        message: `No feasible route for leg ${i + 1} (${leg.from} → ${leg.to}): ${leg.reason}`,
      });
      continue;
    }

    if (leg.status === "OK" && leg.profile && leg.profile.slope_class) {
      // Find contiguous runs of "over_limit"
      let inOverLimit = false;
      let startOverDist = 0;
      for (let k = 0; k < leg.profile.slope_class.length; k++) {
        const cls = leg.profile.slope_class[k];
        const dist = leg.profile.dist_m[k];
        if (cls === "over_limit" && !inOverLimit) {
          inOverLimit = true;
          startOverDist = dist;
        } else if (cls !== "over_limit" && inOverLimit) {
          inOverLimit = false;
          const endDist = leg.profile.dist_m[k - 1];
          warnings.push({
            code: "OVER_HARD_SLOPE",
            severity: "blocked",
            leg: i,
            from_m: startOverDist,
            to_m: endDist,
            message: `Slope exceeds hard limit (${scenario.hard_slope_limit_deg}°) between ${startOverDist} m and ${endDist} m`,
          });
        }
      }
      if (inOverLimit) {
        const endDist = leg.profile.dist_m[leg.profile.dist_m.length - 1];
        warnings.push({
          code: "OVER_HARD_SLOPE",
          severity: "blocked",
          leg: i,
          from_m: startOverDist,
          to_m: endDist,
          message: `Slope exceeds hard limit (${scenario.hard_slope_limit_deg}°) between ${startOverDist} m and ${endDist} m`,
        });
      }

      // Slope metrics distinction (02 §D.2 / §D.3):
      // CAUTION_SLOPE warning evaluates slope_p90 from the leg profile (02 §D.3, 05 §C),
      // whereas A* routing uses slope_max for the 1.5x step-cost penalty (02 §D.2).
      // Find contiguous runs of "caution"
      let inCaution = false;
      let startCautionDist = 0;
      for (let k = 0; k < leg.profile.slope_class.length; k++) {
        const cls = leg.profile.slope_class[k];
        const dist = leg.profile.dist_m[k];
        if (cls === "caution" && !inCaution) {
          inCaution = true;
          startCautionDist = dist;
        } else if (cls !== "caution" && inCaution) {
          inCaution = false;
          const endDist = leg.profile.dist_m[k - 1];
          warnings.push({
            code: "CAUTION_SLOPE",
            severity: "caution",
            leg: i,
            from_m: startCautionDist,
            to_m: endDist,
            message: `Slope exceeds caution limit (${scenario.caution_slope_deg}°) between ${startCautionDist} m and ${endDist} m`,
          });
        }
      }
      if (inCaution) {
        const endDist = leg.profile.dist_m[leg.profile.dist_m.length - 1];
        warnings.push({
          code: "CAUTION_SLOPE",
          severity: "caution",
          leg: i,
          from_m: startCautionDist,
          to_m: endDist,
          message: `Slope exceeds caution limit (${scenario.caution_slope_deg}°) between ${startCautionDist} m and ${endDist} m`,
        });
      }
    }
  }

  // 2. Whole-plan constraint limits (WALKBACK_EXCEEDED, EVA_DURATION_EXCEEDED)
  if (maxWalkbackKm > scenario.walkback_limit_km) {
    warnings.push({
      code: "WALKBACK_EXCEEDED",
      severity: "blocked",
      leg: null,
      from_m: null,
      to_m: null,
      message: `Max walkback ${maxWalkbackKm.toFixed(2)} km exceeds walkback limit ${scenario.walkback_limit_km} km`,
    });
  }

  let totalWalkMin = 0;
  for (const leg of legs) {
    if (leg.status === "OK") {
      totalWalkMin += leg.walk_time_min;
    }
  }
  // Count stops: prefer waypoints with role "stop" (same as totals).
  // If waypoints not provided, count from timeline entries excluding the start waypoint.
  const stopCount = waypoints
    ? countStops(waypoints)
    : timeline && timeline.length > 1
      ? timeline.length - 1
      : Math.max(0, legs.length);
  const dwellMin = stopCount * (scenario.dwell_min_per_stop ?? 0);
  const totalEvaH = (totalWalkMin + dwellMin) / 60;
  if (totalEvaH > scenario.max_eva_duration_h) {
    warnings.push({
      code: "EVA_DURATION_EXCEEDED",
      severity: "blocked",
      leg: null,
      from_m: null,
      to_m: null,
      message: `Total EVA duration ${totalEvaH.toFixed(1)} h exceeds max duration ${scenario.max_eva_duration_h} h`,
    });
  }

  // 3. Darkness at the timeline instants (BD-49)
  const darkness = darknessWarning(timeline, legs.length, site);
  if (darkness) warnings.push(darkness);

  // 4. Cell-level route warnings follow the unsimplified path, independent of solar conditions (BD-49): TI_UNKNOWN
  // (unknown), LOW_RES_DEM (caution) and NO_DATA_ADJACENT (caution), one warning per contiguous run per leg.
  // U-03 is decided (Obidit Islam, 2026-11-10): no defensible TI "loose fines" threshold exists, so no LOW_TI bit is
  // set and LOW_TI is never emitted (docs/ops/ti-threshold.md). Never infer a threshold from fixture values.
  if (grid && cellPaths) {
    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
      if (legs[legIndex].status !== "OK") continue;
      const cells = cellPaths[legIndex];
      if (!cells) continue;
      const runWarnings: [Warning["code"], Warning["severity"], string, (cell: number) => boolean][] = [];
      if (grid.ti !== undefined) {
        runWarnings.push(["TI_UNKNOWN", "unknown", "Thermal inertia data unavailable along route", (c) => (grid.flags[c] & (1 << FLAG_BITS.TI_UNKNOWN)) !== 0]);
      }
      runWarnings.push(
        ["LOW_RES_DEM", "caution", "Low-resolution DEM along route", (c) => (grid.flags[c] & (1 << FLAG_BITS.LOW_RES_DEM)) !== 0],
        ["NO_DATA_ADJACENT", "caution", "Route passes next to a no-data cell", (c) => hasNoDataNeighbour(grid, c)],
      );
      for (const [code, severity, message, flagged] of runWarnings) {
        for (const run of runsAlongPath(grid, cells, flagged)) {
          warnings.push({ code, severity, leg: legIndex, from_m: run.from_m, to_m: run.to_m, message });
        }
      }
    }
  }

  // 5. Missing TI layer check (05 §E.6)
  if (grid && grid.ti === undefined) {
    warnings.push({
      code: "TI_UNKNOWN",
      severity: "unknown",
      leg: null,
      from_m: null,
      to_m: null,
      message: "Thermal inertia data unavailable",
    });
  }

  return warnings;
}

/**
 * Plan status: PARTIAL if any leg is NO_ROUTE (totals null), OVER_LIMITS if a limit is
 * exceeded, else OK (03 §E.4). TASK-05.
 */
export function planStatus(legs: Leg[], warnings: Warning[]): PlanResult["status"] {
  // 1. Any NO_ROUTE leg yields PARTIAL
  if (legs.some((leg) => leg.status === "NO_ROUTE")) {
    return "PARTIAL";
  }

  // 2. Any limit exceeded yields OVER_LIMITS
  const isOverLimits = warnings.some(
    (w) =>
      w.code === "WALKBACK_EXCEEDED" ||
      w.code === "EVA_DURATION_EXCEEDED" ||
      w.code === "DARKNESS" ||
      w.code === "OVER_HARD_SLOPE" ||
      (w.severity === "blocked" && w.code !== "NO_ROUTE"),
  );
  if (isOverLimits) {
    return "OVER_LIMITS";
  }

  // 3. Otherwise OK
  return "OK";
}
