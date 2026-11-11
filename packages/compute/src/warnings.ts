/**
 * Hazard and constraint warnings (docs/specs/01 FR-10; 05 §C Warning; 02 §E.2 PARTIAL rule).
 * Implemented by TASK-05 (T05.24).
 */
import { FLAG_BITS, type Leg, type MissionScenario, type PlanResult, type Warning, type Waypoint } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/**
 * Count the number of stops (waypoints with role "stop") in a plan.
 * Used identically for dwell calculation in totals and in warnings.
 */
export function countStops(waypoints: Waypoint[]): number {
  return waypoints.filter((wp) => wp.role === "stop").length;
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

  // 3. Darkness check
  // TODO(decision): Define darkness evaluation during travel and dwell, including temporal sampling or crossing inputs and warning location; arrival elevation alone does not cover the EVA interval.
  // When no solar elevation data is present on timeline stops, the check is skipped.
  const hasDarkness =
    timeline !== undefined &&
    timeline.length > 0 &&
    timeline.some(
      (t) =>
        typeof t.sun_elevation_deg === "number" &&
        Number.isFinite(t.sun_elevation_deg) &&
        t.sun_elevation_deg < 0,
    );
  if (hasDarkness) {
    warnings.push({
      code: "DARKNESS",
      severity: "caution",
      leg: null,
      from_m: null,
      to_m: null,
      message: "Sun elevation below horizon during planned EVA window",
    });
  }

  // 4. Cell-level TI coverage follows the unsimplified path, independent of solar conditions.
  if (grid && grid.ti !== undefined && cellPaths) {
    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
      if (legs[legIndex].status !== "OK") continue;
      const cells = cellPaths[legIndex];
      if (!cells) continue;
      let distance = 0;
      let start: number | undefined;
      let end = 0;
      const emit = () => {
        if (start === undefined) return;
        warnings.push({
          code: "TI_UNKNOWN",
          severity: "unknown",
          leg: legIndex,
          from_m: start,
          to_m: end,
          message: "Thermal inertia data unavailable along route",
        });
        start = undefined;
      };
      for (let i = 0; i < cells.length; i++) {
        if (i > 0) {
          const previous = cells[i - 1];
          const current = cells[i];
          const dr = Math.floor(current / grid.meta.width) - Math.floor(previous / grid.meta.width);
          const dc = (current % grid.meta.width) - (previous % grid.meta.width);
          distance += Math.hypot(dc * grid.meta.cell_m, dr * grid.meta.cell_m);
        }
        if ((grid.flags[cells[i]] & (1 << FLAG_BITS.TI_UNKNOWN)) !== 0) {
          if (start === undefined) start = distance;
          end = distance;
        } else {
          emit();
        }
      }
      emit();
    }
  }

  // TODO(decision): Resolve U-03 and the LOW_TI threshold source before enabling LOW_TI warnings; do not infer a threshold from fixture values.
  // TODO(decision): Confirm LOW_RES_DEM warning severity before emitting bit-4 route warnings; the bit encoding is defined, but TASK-05 spec question 9 leaves severity open.
  // TODO(decision): Define NO_DATA_ADJACENT neighbourhood, distance, severity and affected-segment policy before implementation; the routing graph's eight neighbours do not by themselves define this warning.

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
