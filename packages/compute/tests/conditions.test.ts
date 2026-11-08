import { describe, expect, it } from "vitest";
import type { EnvConstant, MissionScenario } from "@marswalk/protocol";
import { assembleConditions, type ConditionsInputs } from "../src/conditions";

const SOLAR_MAX_CONSTANT: EnvConstant = {
  const_id: "rad-gale-dose-eq-solar-max",
  quantity: "surface dose equivalent rate",
  value: 0.64,
  low: 0.52,
  high: 0.76,
  unit: "mSv/day",
  conditions: {
    solar_phase: "max",
    location: "Gale crater floor",
    period: "2012-2013",
  },
  provenance: "measured",
  source_id: "hassler-2014-rad",
};

const SOLAR_MIN_CONSTANT: EnvConstant = {
  const_id: "rad-gale-dose-eq-solar-min",
  quantity: "surface dose equivalent rate",
  value: 0.925,
  low: 0.85,
  high: 1.0,
  unit: "mSv/day",
  conditions: {
    solar_phase: "min",
    location: "Gale crater floor",
    period: "~2019",
  },
  provenance: "measured",
  source_id: "simonsen-2024-rad",
  note: "reported range, Simonsen et al. 2024",
};

const BASE_SCENARIO: MissionScenario = {
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
  vehicle_available: false,
};

const SAMPLE_INPUTS: ConditionsInputs = {
  site: { lat: -4.70, lon_e: 137.38 },
  timeline: [
    { arrive_utc: "2026-11-14T08:00:00Z", depart_utc: "2026-11-14T08:20:00Z" },
    { arrive_utc: "2026-11-14T09:15:00Z", depart_utc: "2026-11-14T09:35:00Z" },
    { arrive_utc: "2026-11-14T10:30:00Z", depart_utc: "2026-11-14T10:50:00Z" },
  ],
  scenario: BASE_SCENARIO,
  envConstants: [SOLAR_MAX_CONSTANT, SOLAR_MIN_CONSTANT],
  durationH: 3.0,
};

// Contract C8 (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; TASK-06 / T06.05).
describe("assembleConditions (T06.05 / T06.09, FR-10, FR-11, FR-12)", () => {
  it("populates stops_timeline with arrive_ltst (HH:MM) and sun_elevation_deg per stop (05 §C PlanResult)", () => {
    const res = assembleConditions(SAMPLE_INPUTS);
    expect(res.stops_timeline).toHaveLength(SAMPLE_INPUTS.timeline.length);

    for (let i = 0; i < res.stops_timeline.length; i++) {
      const entry = res.stops_timeline[i];
      expect(entry.arrive_utc).toBe(SAMPLE_INPUTS.timeline[i].arrive_utc);
      expect(entry.depart_utc).toBe(SAMPLE_INPUTS.timeline[i].depart_utc);
      // LTST format "HH:MM"
      expect(entry.arrive_ltst).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof entry.sun_elevation_deg).toBe("number");
      expect(Number.isFinite(entry.sun_elevation_deg)).toBe(true);
    }
  });

  it("populates EVA-sol conditions with mars_year, ls_deg, sunrise/sunset UTC and LTST (05 §C PlanResult)", () => {
    const res = assembleConditions(SAMPLE_INPUTS);
    const cond = res.conditions;
    expect(cond).toBeDefined();
    expect(cond.mars_year).toBe(39);
    expect(cond.ls_deg).toBeCloseTo(21.73, 1);
    expect(cond.sunrise_ltst).toMatch(/^\d{2}:\d{2}$/);
    expect(cond.sunset_ltst).toMatch(/^\d{2}:\d{2}$/);
    expect(cond.sunrise_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(cond.sunset_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("selects the EnvConstant matching scenario.solar_phase and populates radiation (02 §D.4)", () => {
    // Solar max
    const resMax = assembleConditions(SAMPLE_INPUTS);
    expect(resMax.radiation.const_id).toBe("rad-gale-dose-eq-solar-max");
    expect(resMax.radiation.solar_phase).toBe("max");
    expect(resMax.radiation.dose_mSv).toBeCloseTo((0.64 * 3.0) / 24, 3);

    // Solar min
    const minInputs: ConditionsInputs = {
      ...SAMPLE_INPUTS,
      scenario: { ...BASE_SCENARIO, solar_phase: "min" },
    };
    const resMin = assembleConditions(minInputs);
    expect(resMin.radiation.const_id).toBe("rad-gale-dose-eq-solar-min");
    expect(resMin.radiation.solar_phase).toBe("min");
    expect(resMin.radiation.dose_mSv).toBeCloseTo((0.925 * 3.0) / 24, 3);
  });

  // Open C8 decisions tracked as todos
  it.todo("duration for radiation dose in PARTIAL plans with totals null uses planned max_eva_duration_h");
  it.todo("DARKNESS warning criteria: departure before sunrise or leg sun elevation < 0°");
});
