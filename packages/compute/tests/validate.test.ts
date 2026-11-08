import type { MissionScenario, Waypoint } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid } from "../../../apps/web/tests/fixtures/grids";
import { validatePlanInput } from "../src/validate";

const validScenario: MissionScenario = {
  eva_start_utc: "2026-11-14T08:00:00Z",
  max_eva_duration_h: 6.0,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5.0,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: true,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
};

const validWaypoints: Waypoint[] = [
  { id: "wp-0", role: "start", x_m: 25, y_m: -25 },
  { id: "wp-1", role: "stop", x_m: 75, y_m: -75 },
];

// docs/specs/02 §E.3 input validation rules (FR-05). TASK-05 (T05.14).
describe("validatePlanInput", () => {
  it("passes valid scenario and waypoints with zero errors", () => {
    const errors = validatePlanInput(validScenario, validWaypoints);
    expect(errors).toHaveLength(0);
  });

  describe("eva_start_utc validation (year 2000–2100 ISO UTC)", () => {
    it("accepts valid ISO-8601 UTC within 2000–2100", () => {
      expect(validatePlanInput({ ...validScenario, eva_start_utc: "2000-01-01T00:00:00Z" })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, eva_start_utc: "2100-12-31T23:59:59Z" })).toHaveLength(0);
    });

    it("rejects non-ISO format or years outside 2000–2100", () => {
      const errBefore = validatePlanInput({ ...validScenario, eva_start_utc: "1999-12-31T23:59:59Z" });
      expect(errBefore.some((e) => e.field === "eva_start_utc" && e.message.includes("2000–2100"))).toBe(true);

      const errAfter = validatePlanInput({ ...validScenario, eva_start_utc: "2101-01-01T00:00:00Z" });
      expect(errAfter.some((e) => e.field === "eva_start_utc")).toBe(true);

      const errMalformed = validatePlanInput({ ...validScenario, eva_start_utc: "not-a-date" });
      expect(errMalformed.some((e) => e.field === "eva_start_utc")).toBe(true);
    });
  });

  describe("numeric range boundaries (inclusive)", () => {
    it("max_eva_duration_h: 0.5–10 h", () => {
      expect(validatePlanInput({ ...validScenario, max_eva_duration_h: 0.5 })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, max_eva_duration_h: 10.0 })).toHaveLength(0);

      const errLow = validatePlanInput({ ...validScenario, max_eva_duration_h: 0.4 });
      expect(errLow.some((e) => e.field === "max_eva_duration_h" && e.message.includes("0.5–10"))).toBe(true);

      const errHigh = validatePlanInput({ ...validScenario, max_eva_duration_h: 10.1 });
      expect(errHigh.some((e) => e.field === "max_eva_duration_h")).toBe(true);
    });

    it("dwell_min_per_stop: 0–180 min", () => {
      expect(validatePlanInput({ ...validScenario, dwell_min_per_stop: 0 })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, dwell_min_per_stop: 180 })).toHaveLength(0);

      const errLow = validatePlanInput({ ...validScenario, dwell_min_per_stop: -1 });
      expect(errLow.some((e) => e.field === "dwell_min_per_stop" && e.message.includes("0–180"))).toBe(true);

      const errHigh = validatePlanInput({ ...validScenario, dwell_min_per_stop: 181 });
      expect(errHigh.some((e) => e.field === "dwell_min_per_stop")).toBe(true);
    });

    it("caution_slope_deg: 2–30° and hard_slope_limit_deg: 5–35° with hard > caution", () => {
      expect(validatePlanInput({ ...validScenario, caution_slope_deg: 2, hard_slope_limit_deg: 5 })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, caution_slope_deg: 30, hard_slope_limit_deg: 35 })).toHaveLength(0);

      // Outside bounds
      const errCautionLow = validatePlanInput({ ...validScenario, caution_slope_deg: 1 });
      expect(errCautionLow.some((e) => e.field === "caution_slope_deg" && e.message.includes("2–30"))).toBe(true);

      const errHardHigh = validatePlanInput({ ...validScenario, hard_slope_limit_deg: 36 });
      expect(errHardHigh.some((e) => e.field === "hard_slope_limit_deg" && e.message.includes("5–35"))).toBe(true);

      // hard <= caution is invalid
      const errHardLeCaution = validatePlanInput({ ...validScenario, caution_slope_deg: 15, hard_slope_limit_deg: 15 });
      expect(errHardLeCaution.some((e) => e.field === "hard_slope_limit_deg" && e.message.includes("greater than caution"))).toBe(true);

      const errHardLtCaution = validatePlanInput({ ...validScenario, caution_slope_deg: 20, hard_slope_limit_deg: 15 });
      expect(errHardLtCaution.some((e) => e.field === "hard_slope_limit_deg")).toBe(true);
    });

    it("walkback_limit_km: 0.5–20 km", () => {
      expect(validatePlanInput({ ...validScenario, walkback_limit_km: 0.5 })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, walkback_limit_km: 20.0 })).toHaveLength(0);

      const errLow = validatePlanInput({ ...validScenario, walkback_limit_km: 0.4 });
      expect(errLow.some((e) => e.field === "walkback_limit_km" && e.message.includes("0.5–20"))).toBe(true);

      const errHigh = validatePlanInput({ ...validScenario, walkback_limit_km: 20.1 });
      expect(errHigh.some((e) => e.field === "walkback_limit_km")).toBe(true);
    });

    it("suited_flat_speed_kmh: 0.5–6 km/h", () => {
      expect(validatePlanInput({ ...validScenario, suited_flat_speed_kmh: 0.5 })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, suited_flat_speed_kmh: 6.0 })).toHaveLength(0);

      const errLow = validatePlanInput({ ...validScenario, suited_flat_speed_kmh: 0.4 });
      expect(errLow.some((e) => e.field === "suited_flat_speed_kmh" && e.message.includes("0.5–6"))).toBe(true);

      const errHigh = validatePlanInput({ ...validScenario, suited_flat_speed_kmh: 6.1 });
      expect(errHigh.some((e) => e.field === "suited_flat_speed_kmh")).toBe(true);
    });

    it("solar_phase: max | min", () => {
      expect(validatePlanInput({ ...validScenario, solar_phase: "max" })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, solar_phase: "min" })).toHaveLength(0);

      const err = validatePlanInput({ ...validScenario, solar_phase: "medium" as any });
      expect(err.some((e) => e.field === "solar_phase" && e.message.includes("max | min"))).toBe(true);
    });

    it("v2 fields: max_haven_min (5–120), crew_count (1–2), vehicle_available (boolean)", () => {
      expect(validatePlanInput({ ...validScenario, max_haven_min: 5, crew_count: 1, vehicle_available: false })).toHaveLength(0);
      expect(validatePlanInput({ ...validScenario, max_haven_min: 120, crew_count: 2, vehicle_available: true })).toHaveLength(0);

      const errHaven = validatePlanInput({ ...validScenario, max_haven_min: 4 });
      expect(errHaven.some((e) => e.field === "max_haven_min" && e.message.includes("5–120"))).toBe(true);

      const errCrew = validatePlanInput({ ...validScenario, crew_count: 3 as any });
      expect(errCrew.some((e) => e.field === "crew_count" && e.message.includes("1–2"))).toBe(true);
    });
  });

  describe("waypoints validation (2–11 waypoints, exactly one start, all inside AOI)", () => {
    it("rejects fewer than 2 waypoints", () => {
      const err = validatePlanInput(validScenario, [{ id: "wp-0", role: "start", x_m: 10, y_m: -10 }]);
      expect(err.some((e) => e.field === "waypoints" && e.message.includes("2–11"))).toBe(true);
    });

    it("rejects more than 11 waypoints (1 start + > 10 stops)", () => {
      const wps: Waypoint[] = [{ id: "wp-0", role: "start", x_m: 10, y_m: -10 }];
      for (let i = 1; i <= 11; i++) {
        wps.push({ id: `wp-${i}`, role: "stop", x_m: 10 + i * 5, y_m: -10 });
      }
      expect(wps).toHaveLength(12);

      const err = validatePlanInput(validScenario, wps);
      expect(err.some((e) => e.field === "waypoints" && e.message.includes("2–11"))).toBe(true);
    });

    it("requires exactly one start waypoint", () => {
      // Zero starts
      const noStart: Waypoint[] = [
        { id: "wp-0", role: "stop", x_m: 10, y_m: -10 },
        { id: "wp-1", role: "stop", x_m: 20, y_m: -10 },
      ];
      const errNoStart = validatePlanInput(validScenario, noStart);
      expect(errNoStart.some((e) => e.field === "waypoints" && e.message.includes("exactly one start"))).toBe(true);

      // Two starts
      const twoStarts: Waypoint[] = [
        { id: "wp-0", role: "start", x_m: 10, y_m: -10 },
        { id: "wp-1", role: "start", x_m: 20, y_m: -10 },
      ];
      const errTwoStarts = validatePlanInput(validScenario, twoStarts);
      expect(errTwoStarts.some((e) => e.field === "waypoints" && e.message.includes("exactly one start"))).toBe(true);
    });

    it("rejects waypoints outside the AOI grid bounds when grid is provided", () => {
      const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      // Bounds: x from 0 to 100, y from -100 to 0

      const wpsWithOutside: Waypoint[] = [
        { id: "wp-0", role: "start", x_m: 25, y_m: -25 },
        { id: "wp-1", role: "stop", x_m: 250, y_m: -25 }, // outside x
      ];

      const err = validatePlanInput(validScenario, wpsWithOutside, grid);
      expect(err.some((e) => e.field === "waypoints" && e.message.includes("outside AOI"))).toBe(true);
    });
  });
});
