/**
 * Tests for conditions assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-10, FR-11, FR-12. Implemented by TASK-06 (T06.05).
 * Tests assembleConditions with mars24 and sun mocked so tests isolate assembly logic.
 */
import type { EnvConstant, MissionScenario } from "@marswalk/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleConditions, type ConditionsInputs } from "../src/conditions";
import * as mars24Module from "../src/mars24";
import * as sunModule from "../src/sun";

// Mock mars24 and sun functions to test assembly contract in isolation (T06.05 step 1)
vi.mock("../src/mars24", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/mars24")>();
  return {
    ...actual,
    localTrueSolarTime: vi.fn(),
    solarLongitude: vi.fn(),
  };
});

vi.mock("../src/sun", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sun")>();
  return {
    ...actual,
    solarPosition: vi.fn(),
    sunriseSunset: vi.fn(),
  };
});

describe("assembleConditions (T06.05 / T06.09, Contract C8)", () => {
  const site = { lat: -4.7, lon_e: 137.38 };

  const scenarioMax: MissionScenario = {
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

  const timeline = [
    { arrive_utc: "2026-11-14T08:00:00Z", depart_utc: "2026-11-14T08:20:00Z" },
    { arrive_utc: "2026-11-14T09:15:00Z", depart_utc: "2026-11-14T09:35:00Z" },
  ];

  const radMax: EnvConstant = {
    const_id: "rad-gale-dose-eq-solar-max",
    quantity: "surface dose equivalent rate",
    value: 0.64,
    low: 0.52,
    high: 0.76,
    unit: "mSv/day",
    conditions: { solar_phase: "max", location: "Gale crater floor", period: "2012-2013" },
    provenance: "measured",
    source_id: "hassler-2014-rad",
  };

  const radMin: EnvConstant = {
    const_id: "rad-gale-dose-eq-solar-min",
    quantity: "surface dose equivalent rate",
    value: 0.925,
    low: 0.85,
    high: 1.0,
    unit: "mSv/day",
    conditions: { solar_phase: "min", location: "Gale crater floor", period: "2019-2020" },
    provenance: "measured",
    source_id: "simonsen-2024-rad",
  };

  const envConstants = [radMax, radMin];

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(mars24Module.localTrueSolarTime).mockImplementation((utc: Date) => {
      const h = utc.getUTCHours();
      return `${String(h + 7).padStart(2, "0")}:30`;
    });

    vi.mocked(mars24Module.solarLongitude).mockReturnValue({
      ls_deg: 150.7,
      mars_year: 31,
    });

    vi.mocked(sunModule.solarPosition).mockImplementation((utc: Date) => {
      const h = utc.getUTCHours();
      return {
        elevation_deg: h === 8 ? 25.5 : 42.0,
        azimuth_deg: 120.0,
      };
    });

    vi.mocked(sunModule.sunriseSunset).mockReturnValue({
      sunrise_utc: "2026-11-14T05:30:00Z",
      sunset_utc: "2026-11-14T17:45:00Z",
      sunrise_ltst: "06:05",
      sunset_ltst: "18:15",
    });
  });

  it("populates per-waypoint arrive_ltst and sun_elevation_deg in stops_timeline (05 §C PlanResult)", () => {
    const inputs: ConditionsInputs = {
      site,
      timeline,
      scenario: scenarioMax,
      envConstants,
      durationH: 3.5,
    };

    const res = assembleConditions(inputs);

    expect(res.stops_timeline).toHaveLength(2);
    expect(res.stops_timeline[0]).toEqual({
      arrive_utc: "2026-11-14T08:00:00Z",
      depart_utc: "2026-11-14T08:20:00Z",
      arrive_ltst: "15:30",
      sun_elevation_deg: 25.5,
    });
    expect(res.stops_timeline[1]).toEqual({
      arrive_utc: "2026-11-14T09:15:00Z",
      depart_utc: "2026-11-14T09:35:00Z",
      arrive_ltst: "16:30",
      sun_elevation_deg: 42.0,
    });
  });

  it("populates EVA-sol flat-horizon conditions block (05 §C PlanResult.conditions)", () => {
    const inputs: ConditionsInputs = {
      site,
      timeline,
      scenario: scenarioMax,
      envConstants,
      durationH: 3.5,
    };

    const res = assembleConditions(inputs);

    expect(res.conditions).toEqual({
      mars_year: 31,
      ls_deg: 150.7,
      sunrise_ltst: "06:05",
      sunset_ltst: "18:15",
      sunrise_utc: "2026-11-14T05:30:00Z",
      sunset_utc: "2026-11-14T17:45:00Z",
    });

    expect(sunModule.sunriseSunset).toHaveBeenCalledWith(
      new Date("2026-11-14T08:00:00Z"),
      site.lat,
      site.lon_e,
    );
  });

  it("selects radiation constant matching scenario solar_phase and computes dose (02 §D.4)", () => {
    // 1. Test solar max selection
    const inputsMax: ConditionsInputs = {
      site,
      timeline,
      scenario: scenarioMax,
      envConstants,
      durationH: 7.0, // 7 hours
    };

    const resMax = assembleConditions(inputsMax);
    expect(resMax.radiation.solar_phase).toBe("max");
    expect(resMax.radiation.const_id).toBe("rad-gale-dose-eq-solar-max");
    // 0.64 * 7 / 24 = 0.186666...
    expect(resMax.radiation.dose_mSv).toBeCloseTo(0.187, 3);

    // 2. Test solar min selection
    const scenarioMin = { ...scenarioMax, solar_phase: "min" as const };
    const inputsMin: ConditionsInputs = {
      site,
      timeline,
      scenario: scenarioMin,
      envConstants,
      durationH: 7.0,
    };

    const resMin = assembleConditions(inputsMin);
    expect(resMin.radiation.solar_phase).toBe("min");
    expect(resMin.radiation.const_id).toBe("rad-gale-dose-eq-solar-min");
    // 0.925 * 7 / 24 = 0.26979...
    expect(resMin.radiation.dose_mSv).toBeCloseTo(0.270, 3);
  });

  it("throws error when matching radiation EnvConstant is not provided", () => {
    const inputs: ConditionsInputs = {
      site,
      timeline,
      scenario: scenarioMax,
      envConstants: [radMin], // only min provided, but scenario needs max
      durationH: 3.0,
    };

    expect(() => assembleConditions(inputs)).toThrow(/No radiation EnvConstant found/);
  });

  // Open decisions recorded as it.todo per T06.05 step 5 / C8 spec
  it.todo("PARTIAL plan dose calculation: duration when totals is null (TODO(decision))");
  it.todo("DARKNESS warning criteria: path sun elevation threshold vs sunrise/sunset UTC (TODO(decision))");
});
