/**
 * Hazard and constraint warnings (docs/specs/01 FR-10; 05 §C Warning; 02 §E.2 PARTIAL rule).
 * Implemented by TASK-05 (T05.24).
 */
import type { Leg, MissionScenario, PlanResult, Warning } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/**
 * Collect slope, LOW_TI / TI_UNKNOWN, LOW_RES_DEM, NO_ROUTE, EVA duration, walkback and
 * darkness warnings. Missing TI layer yields TI_UNKNOWN, never silence (05 §E.6). TASK-05.
 *
 * TODO(decision): Warning severities and darkness (spec question 9):
 * - LOW_RES_DEM and DARKNESS mapped to caution per 04 §C.1.
 * - Darkness evaluated where timeline sun_elevation_deg < 0.
 */
export function collectWarnings(
  legs: Leg[],
  scenario: MissionScenario,
  timeline: PlanResult["stops_timeline"],
  maxWalkbackKm: number,
  grid?: LoadedGrid,
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
  const stopCount = timeline && timeline.length > 0 ? Math.max(0, timeline.length - 2) : Math.max(0, legs.length - 1);
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
  const hasDarkness = timeline && timeline.some(
    (t) => (t as any).sun_elevation_deg !== undefined && (t as any).sun_elevation_deg < 0,
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

  // 4. Missing TI layer check (05 §E.6)
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
      w.code === "OVER_HARD_SLOPE" ||
      (w.severity === "blocked" && w.code !== "NO_ROUTE"),
  );
  if (isOverLimits) {
    return "OVER_LIMITS";
  }

  // 3. Otherwise OK
  return "OK";
}
