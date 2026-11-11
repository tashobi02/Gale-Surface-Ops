/**
 * Tests for conditions assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-10, FR-11, FR-12. TASK-06 (T06.05).
 * assembleConditions runs with mars24 and sun mocked so the cases test assembly only. Every mocked value is
 * SYNTHETIC (an arbitrary stand-in, not a Mars24 result). Radiation expectations come from the real
 * estimateDose, never from hand arithmetic. The cases that wait on the five C8 decisions are `it.todo`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EnvConstant, MissionScenario } from "@marswalk/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleConditions, type ConditionsInputs } from "../src/conditions";
import * as mars24Module from "../src/mars24";
import { estimateDose } from "../src/radiation";
import * as sunModule from "../src/sun";

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

// SYNTHETIC mock outputs: arbitrary values chosen only to be distinguishable from each other.
const MOCK_LTST = "11:11";
const MOCK_ELEVATION_BY_CALL = [-7.5, 33.25];
const MOCK_LS = { ls_deg: 123.5, mars_year: 77 };
const MOCK_SUN_EVENTS = {
  sunrise_utc: "2026-11-14T01:02:03Z",
  sunset_utc: "2026-11-14T13:14:15Z",
  sunrise_ltst: "05:55",
  sunset_ltst: "17:45",
};

/** SYNTHETIC rate record shaped like 05 §C EnvConstant; the rate differs per phase so a wrong pick shows. */
function syntheticRate(phase: "max" | "min", rateMsvPerDay: number): EnvConstant {
  return {
    const_id: `rad-gale-dose-eq-solar-${phase}`,
    quantity: "surface dose equivalent rate",
    value: rateMsvPerDay,
    low: rateMsvPerDay / 2,
    high: rateMsvPerDay * 2,
    unit: "mSv/day",
    conditions: { solar_phase: phase },
    provenance: "measured",
    source_id: `synthetic-${phase}`,
  };
}

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

  const rateMax = syntheticRate("max", 1.5);
  const rateMin = syntheticRate("min", 4.5);
  const envConstants = [rateMax, rateMin];

  const baseInputs: ConditionsInputs = {
    site,
    timeline,
    scenario: scenarioMax,
    envConstants,
    durationH: 3.5,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(mars24Module.localTrueSolarTime).mockReturnValue(MOCK_LTST);
    vi.mocked(mars24Module.solarLongitude).mockReturnValue(MOCK_LS);

    let call = 0;
    vi.mocked(sunModule.solarPosition).mockImplementation(() => ({
      elevation_deg: MOCK_ELEVATION_BY_CALL[call++],
      azimuth_deg: 0,
    }));

    vi.mocked(sunModule.sunriseSunset).mockReturnValue(MOCK_SUN_EVENTS);
  });

  it("populates per-waypoint arrive_ltst and sun_elevation_deg in stops_timeline (05 §C PlanResult)", () => {
    const res = assembleConditions(baseInputs);

    expect(res.stops_timeline).toEqual([
      { ...timeline[0], arrive_ltst: MOCK_LTST, sun_elevation_deg: MOCK_ELEVATION_BY_CALL[0] },
      { ...timeline[1], arrive_ltst: MOCK_LTST, sun_elevation_deg: MOCK_ELEVATION_BY_CALL[1] },
    ]);
    // The solar functions are asked at each arrival instant, east-positive longitude (02 §C.1)
    expect(mars24Module.localTrueSolarTime).toHaveBeenNthCalledWith(1, new Date(timeline[0].arrive_utc), site.lon_e);
    expect(sunModule.solarPosition).toHaveBeenNthCalledWith(2, new Date(timeline[1].arrive_utc), site.lat, site.lon_e);
  });

  it("returns an empty stops_timeline for an empty timeline", () => {
    expect(assembleConditions({ ...baseInputs, timeline: [] }).stops_timeline).toEqual([]);
  });

  it("populates the EVA-sol flat-horizon conditions block (05 §C PlanResult.conditions)", () => {
    const res = assembleConditions(baseInputs);

    expect(res.conditions).toEqual({ ...MOCK_LS, ...MOCK_SUN_EVENTS });
    expect(sunModule.sunriseSunset).toHaveBeenCalledWith(new Date(scenarioMax.eva_start_utc), site.lat, site.lon_e);
    expect(mars24Module.solarLongitude).toHaveBeenCalledWith(new Date(scenarioMax.eva_start_utc));
  });

  it("omits conditions, and keeps the timeline and radiation, when the sun never crosses the horizon", () => {
    vi.mocked(sunModule.sunriseSunset).mockImplementation(() => {
      throw new sunModule.SunEventsUnavailableError("SUN_NEVER_UP", "SYNTHETIC polar night");
    });

    const res = assembleConditions(baseInputs);

    expect(res.conditions).toBeUndefined();
    expect(res.stops_timeline).toHaveLength(timeline.length);
    expect(res.radiation).toEqual(estimateDose(rateMax, baseInputs.durationH));
  });

  it("does not hide other sunriseSunset failures such as an invalid latitude", () => {
    vi.mocked(sunModule.sunriseSunset).mockImplementation(() => {
      throw new RangeError("SYNTHETIC invalid latitude");
    });

    expect(() => assembleConditions(baseInputs)).toThrow("SYNTHETIC invalid latitude");
  });

  it.each(["max", "min"] as const)("radiation uses the %s constant and matches estimateDose (02 §D.4)", (phase) => {
    const scenario = { ...scenarioMax, solar_phase: phase };
    const expected = estimateDose(phase === "max" ? rateMax : rateMin, 7.0);

    const res = assembleConditions({ ...baseInputs, scenario, durationH: 7.0 });

    expect(res.radiation).toEqual(expected);
    expect(res.radiation?.solar_phase).toBe(phase);
    expect(res.radiation?.const_id).toBe(`rad-gale-dose-eq-solar-${phase}`);
  });

  it("matches the constant on conditions.solar_phase, not on a phase word inside const_id", () => {
    const trap: EnvConstant = { ...rateMax, const_id: "rad-gale-dose-eq-solar-max-misnamed", conditions: { solar_phase: "min" } };
    const min: EnvConstant = { ...rateMin, const_id: "rad-gale-dose-eq-solar-min-mismatch", conditions: { solar_phase: "max" } };

    // The trap id contains "max" but is a min record; the other contains "min" but is a max record
    const res = assembleConditions({ ...baseInputs, envConstants: [trap, min] });

    expect(res.radiation?.const_id).toBe(min.const_id);
    expect(res.radiation?.solar_phase).toBe("max");
  });

  it("rejects a constant that is not a rad- rate in mSv/day", () => {
    const wrongUnit: EnvConstant = { ...rateMax, unit: "mSv/h" };
    const wrongPrefix: EnvConstant = { ...rateMax, const_id: "env-gale-dose-eq-solar-max" };

    for (const candidate of [wrongUnit, wrongPrefix]) {
      expect(assembleConditions({ ...baseInputs, envConstants: [candidate] }).radiation).toBeUndefined();
    }
  });

  it("omits radiation, without inventing a dose, when no EnvConstant matches the solar phase", () => {
    const res = assembleConditions({ ...baseInputs, envConstants: [rateMin] });

    expect(res.radiation).toBeUndefined();
    expect(res.conditions).toBeDefined();
    expect(assembleConditions({ ...baseInputs, envConstants: [] }).radiation).toBeUndefined();
  });

  it("omits radiation when two EnvConstants match, rather than picking one silently", () => {
    const duplicate: EnvConstant = { ...rateMax, source_id: "synthetic-duplicate" };

    expect(assembleConditions({ ...baseInputs, envConstants: [rateMax, duplicate] }).radiation).toBeUndefined();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("omits radiation for an unusable duration %s h", (durationH) => {
    expect(assembleConditions({ ...baseInputs, durationH }).radiation).toBeUndefined();
  });

  it("selects the real Gale EnvConstant records by solar phase (pipeline/sites/gale_boxwork/env_constants)", () => {
    const load = (phase: "max" | "min"): EnvConstant =>
      JSON.parse(
        readFileSync(
          fileURLToPath(
            new URL(`../../../pipeline/sites/gale_boxwork/env_constants/rad-gale-dose-eq-solar-${phase}.json`, import.meta.url),
          ),
          "utf8",
        ),
      ) as EnvConstant;
    const real = [load("max"), load("min")];

    for (const phase of ["max", "min"] as const) {
      const res = assembleConditions({ ...baseInputs, scenario: { ...scenarioMax, solar_phase: phase }, envConstants: real, durationH: 7.0 });
      expect(res.radiation).toEqual(estimateDose(real.find((c) => c.conditions.solar_phase === phase)!, 7.0));
    }
  });

  // Cases that wait on the five C8 decisions recorded in the conditions.ts header (TODO(decision), TASK-06 T06.09)
  it.todo("site coordinate: which point feeds the solar functions, mast vs AOI centre (TODO(decision))");
  it.todo("EnvConstant selection: the final rule when more than one record matches (TODO(decision))");
  it.todo("PARTIAL plan dose: which duration feeds the dose when totals is null (TODO(decision))");
  it.todo("DARKNESS inputs: sunrise/sunset UTC or sun elevation along legs and dwell (TODO(decision))");
  it.todo("timing boundaries: what timing_ms.routing and timing_ms.estimates measure (TODO(decision))");
});
