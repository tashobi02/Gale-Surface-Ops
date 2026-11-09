/**
 * Shared input validation for mission scenarios and waypoints (docs/specs/02 §E.3).
 * FR-05. Implemented by TASK-05 (T05.25).
 * Used by both UI forms (T08.04) and Web Worker / Hab Core (T05.26) for defense in depth.
 */
import type { MissionScenario, Waypoint } from "@marswalk/protocol";
import { cellIndex, type LoadedGrid } from "./grid";

export interface FieldValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validates mission scenario parameters and waypoint lists against 02 §E.3 rules.
 * Limits are inclusive per spec question 12.
 * Returns an array of validation errors (empty if valid).
 */
export function validatePlanInput(
  scenario: Partial<MissionScenario>,
  waypoints?: Waypoint[],
  grid?: LoadedGrid,
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  // 1. eva_start_utc: ISO-8601 UTC, year 2000–2100
  if (scenario.eva_start_utc !== undefined) {
    const raw = scenario.eva_start_utc;
    const isIsoUtc =
      typeof raw === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/.test(raw);
    const parsed = Date.parse(raw);
    if (!isIsoUtc || isNaN(parsed)) {
      errors.push({
        field: "eva_start_utc",
        message: "eva_start_utc must be a valid ISO-8601 UTC timestamp with year in 2000–2100",
        value: raw,
      });
    } else {
      const year = new Date(parsed).getUTCFullYear();
      if (year < 2000 || year > 2100) {
        errors.push({
          field: "eva_start_utc",
          message: "eva_start_utc year must be within 2000–2100",
          value: raw,
        });
      }
    }
  }

  // 2. max_eva_duration_h: 0.5–10
  if (scenario.max_eva_duration_h !== undefined) {
    const val = scenario.max_eva_duration_h;
    if (typeof val !== "number" || isNaN(val) || val < 0.5 || val > 10.0) {
      errors.push({
        field: "max_eva_duration_h",
        message: "max_eva_duration_h must be between 0.5–10 h",
        value: val,
      });
    }
  }

  // 3. dwell_min_per_stop: 0–180
  if (scenario.dwell_min_per_stop !== undefined) {
    const val = scenario.dwell_min_per_stop;
    if (typeof val !== "number" || isNaN(val) || val < 0 || val > 180) {
      errors.push({
        field: "dwell_min_per_stop",
        message: "dwell_min_per_stop must be between 0–180 min",
        value: val,
      });
    }
  }

  // 4. caution_slope_deg: 2–30
  if (scenario.caution_slope_deg !== undefined) {
    const val = scenario.caution_slope_deg;
    if (typeof val !== "number" || isNaN(val) || val < 2 || val > 30) {
      errors.push({
        field: "caution_slope_deg",
        message: "caution_slope_deg must be between 2–30°",
        value: val,
      });
    }
  }

  // 5. hard_slope_limit_deg: 5–35 and > caution_slope_deg
  if (scenario.hard_slope_limit_deg !== undefined) {
    const val = scenario.hard_slope_limit_deg;
    if (typeof val !== "number" || isNaN(val) || val < 5 || val > 35) {
      errors.push({
        field: "hard_slope_limit_deg",
        message: "hard_slope_limit_deg must be between 5–35°",
        value: val,
      });
    } else if (
      scenario.caution_slope_deg !== undefined &&
      val <= scenario.caution_slope_deg
    ) {
      errors.push({
        field: "hard_slope_limit_deg",
        message: "hard_slope_limit_deg must be greater than caution_slope_deg",
        value: val,
      });
    }
  }

  // 6. walkback_limit_km: 0.5–20
  if (scenario.walkback_limit_km !== undefined) {
    const val = scenario.walkback_limit_km;
    if (typeof val !== "number" || isNaN(val) || val < 0.5 || val > 20.0) {
      errors.push({
        field: "walkback_limit_km",
        message: "walkback_limit_km must be between 0.5–20 km",
        value: val,
      });
    }
  }

  // 7. suited_flat_speed_kmh: 0.5–6
  if (scenario.suited_flat_speed_kmh !== undefined) {
    const val = scenario.suited_flat_speed_kmh;
    if (typeof val !== "number" || isNaN(val) || val < 0.5 || val > 6.0) {
      errors.push({
        field: "suited_flat_speed_kmh",
        message: "suited_flat_speed_kmh must be between 0.5–6 km/h",
        value: val,
      });
    }
  }

  // 8. solar_phase: max | min
  if (scenario.solar_phase !== undefined) {
    const val = scenario.solar_phase;
    if (val !== "max" && val !== "min") {
      errors.push({
        field: "solar_phase",
        message: "solar_phase must be max | min",
        value: val,
      });
    }
  }

  // 9. max_haven_min (v2): 5–120
  if (scenario.max_haven_min !== undefined) {
    const val = scenario.max_haven_min;
    if (typeof val !== "number" || isNaN(val) || val < 5 || val > 120) {
      errors.push({
        field: "max_haven_min",
        message: "max_haven_min must be between 5–120 min",
        value: val,
      });
    }
  }

  // 10. crew_count (v2): 1–2
  if (scenario.crew_count !== undefined) {
    const val = scenario.crew_count;
    if (val !== 1 && val !== 2) {
      errors.push({
        field: "crew_count",
        message: "crew_count must be 1–2",
        value: val,
      });
    }
  }

  // 11. vehicle_available (v2): boolean
  if (scenario.vehicle_available !== undefined) {
    if (typeof scenario.vehicle_available !== "boolean") {
      errors.push({
        field: "vehicle_available",
        message: "vehicle_available must be a boolean",
        value: scenario.vehicle_available,
      });
    }
  }

  // 12. Waypoints validation
  if (waypoints !== undefined) {
    if (waypoints.length < 2 || waypoints.length > 11) {
      errors.push({
        field: "waypoints",
        message: "Waypoints count must be between 2–11 (start + ≤ 10 stops)",
        value: waypoints.length,
      });
    }

    const startCount = waypoints.filter((w) => w.role === "start").length;
    if (startCount !== 1) {
      errors.push({
        field: "waypoints",
        message: `Waypoints list must contain exactly one start (found ${startCount})`,
        value: startCount,
      });
    }

    if (grid) {
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const idx = cellIndex(grid, wp.x_m, wp.y_m);
        if (idx === null) {
          errors.push({
            field: "waypoints",
            message: `Waypoint ${wp.id} at (${wp.x_m}, ${wp.y_m}) is outside AOI bounds`,
            value: { id: wp.id, x_m: wp.x_m, y_m: wp.y_m },
          });
        }
      }
    }
  }

  return errors;
}
