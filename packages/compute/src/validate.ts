/**
 * Shared input validation for mission scenarios and waypoints (docs/specs/02 §E.3).
 * FR-05. Implemented by TASK-05 (T05.25).
 * Used by both UI forms (T08.04) and Web Worker / Hab Core (T05.26) for defense in depth.
 */
import type { MissionScenario, Waypoint, WorkerRequest } from "@marswalk/protocol";
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
    const match = typeof raw === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]00:00)$/.exec(raw)
      : null;
    const parts = match?.slice(1, 7).map(Number);
    const date = parts ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])) : null;
    const validCalendar = parts && date &&
      date.getUTCFullYear() === parts[0] && date.getUTCMonth() + 1 === parts[1] &&
      date.getUTCDate() === parts[2] && date.getUTCHours() === parts[3] &&
      date.getUTCMinutes() === parts[4] && date.getUTCSeconds() === parts[5];
    if (!validCalendar) {
      errors.push({
        field: "eva_start_utc",
        message: "eva_start_utc must be a valid ISO-8601 UTC timestamp with year in 2000–2100",
        value: raw,
      });
    } else {
      const year = parts![0];
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

  // 9. loop: boolean
  if (scenario.loop !== undefined && typeof scenario.loop !== "boolean") {
    errors.push({
      field: "loop",
      message: "loop must be a boolean",
      value: scenario.loop,
    });
  }

  // 10. max_haven_min (v2): 5–120
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

  // 11. crew_count (v2): 1–2
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

  // 12. vehicle_available (v2): boolean
  if (scenario.vehicle_available !== undefined) {
    if (typeof scenario.vehicle_available !== "boolean") {
      errors.push({
        field: "vehicle_available",
        message: "vehicle_available must be a boolean",
        value: scenario.vehicle_available,
      });
    }
  }

  // 13. Waypoints validation
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

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (
        typeof wp.x_m !== "number" ||
        !Number.isFinite(wp.x_m) ||
        typeof wp.y_m !== "number" ||
        !Number.isFinite(wp.y_m)
      ) {
        errors.push({
          field: "waypoints",
          message: `Waypoint ${wp.id} has invalid coordinates (${wp.x_m}, ${wp.y_m}); x_m and y_m must be finite numbers`,
          value: { id: wp.id, x_m: wp.x_m, y_m: wp.y_m },
        });
      } else if (grid) {
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

/** Strict boundary validation for complete worker messages; forms may use validatePlanInput separately. */
export function validateWorkerRequest(request: WorkerRequest, grid: LoadedGrid): FieldValidationError[] {
  const errors: FieldValidationError[] = [];
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

  if (!nonempty(request.request_id)) add("request_id", "request_id must be a nonempty string", request.request_id);

  if (request.type === "SAMPLE_POINT") {
    for (const field of ["x_m", "y_m", "snap_radius_m"] as const) {
      if (!finite(request[field])) add(field, `${field} must be finite`, request[field]);
    }
    if (finite(request.snap_radius_m) && request.snap_radius_m < 0) {
      add("snap_radius_m", "snap_radius_m must be nonnegative", request.snap_radius_m);
    }
    if (request.hard_slope_limit_deg !== undefined && !finite(request.hard_slope_limit_deg)) {
      add("hard_slope_limit_deg", "hard_slope_limit_deg must be finite", request.hard_slope_limit_deg);
    }
    return errors;
  }

  if (!Number.isSafeInteger(request.plan_revision)) {
    add("plan_revision", "plan_revision must be a safe integer", request.plan_revision);
  }
  for (const field of ["site_id", "data_version"] as const) {
    if (!nonempty(request[field])) add(field, `${field} must be a nonempty string`, request[field]);
  }

  if (!record(request.scenario)) {
    add("scenario", "scenario must be an object", request.scenario);
  } else {
    const scenario = request.scenario as unknown as Record<string, unknown>;
    for (const field of [
      "eva_start_utc", "max_eva_duration_h", "dwell_min_per_stop", "hard_slope_limit_deg",
      "caution_slope_deg", "walkback_limit_km", "suited_flat_speed_kmh", "solar_phase",
      "loop", "max_haven_min", "crew_count", "vehicle_available",
    ]) {
      if (scenario[field] === undefined) add(field, `${field} is required`);
    }
    if (typeof scenario.loop !== "boolean") add("loop", "loop must be a boolean", scenario.loop);
    if (scenario.vehicle_available === true && !nonempty(scenario.vehicle_param_set)) {
      add("vehicle_param_set", "vehicle_param_set is required when vehicle is available", scenario.vehicle_param_set);
    }
    errors.push(...validatePlanInput(request.scenario));
  }

  if (!Array.isArray(request.waypoints)) {
    add("waypoints", "waypoints must be an array", request.waypoints);
  } else {
    let validEntries = true;
    for (const waypoint of request.waypoints as unknown[]) {
      if (!record(waypoint)) {
        add("waypoints", "each waypoint must be an object", waypoint);
        validEntries = false;
        continue;
      }
      if (!nonempty(waypoint.id)) add("waypoints", "waypoint id is required", waypoint.id);
      if (waypoint.role !== "start" && waypoint.role !== "stop") {
        add("waypoints", "waypoint role must be start or stop", waypoint.role);
      }
      if (!finite(waypoint.x_m) || !finite(waypoint.y_m)) {
        add("waypoints", "waypoint coordinates must be finite", waypoint);
      }
    }
    if (validEntries) errors.push(...validatePlanInput({}, request.waypoints, grid));
  }
  return errors;
}
