import { FLAG_BITS, type Leg, type MissionScenario, type NoRouteLeg, type OkLeg, type PlanResult, type Waypoint } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, withoutTi } from "../../../apps/web/tests/fixtures/grids";
import { solarPosition, sunriseSunset } from "../src/sun";
import { collectWarnings, countStops, planStatus } from "../src/warnings";

/** Site of the solar checks: a fixture coordinate (lat planetocentric, lon east-positive), not a Gale claim. */
const SITE = { lat: -4.7, lon_e: 137.38 };
const MIN_MS = 60_000;

/** One sol's flat-horizon sunrise and sunset around `anchor`, from compute (the expected values are derived, not typed). */
function dayOf(anchor: string): { sunrise: number; sunset: number } {
  const sun = sunriseSunset(new Date(anchor), SITE.lat, SITE.lon_e);
  return { sunrise: Date.parse(sun.sunrise_utc), sunset: Date.parse(sun.sunset_utc) };
}

/** A timeline entry from two instants (ms); LTST text and elevation are not read by the DARKNESS check. */
function stamp(arriveMs: number, departMs: number): PlanResult["stops_timeline"][number] {
  return {
    arrive_utc: new Date(arriveMs).toISOString(),
    depart_utc: new Date(departMs).toISOString(),
    arrive_ltst: "00:00",
    sun_elevation_deg: Number.NaN,
  };
}

const ANCHOR = "2026-11-14T08:00:00Z";
const DAY = dayOf(ANCHOR);

const defaultScenario: MissionScenario = {
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

function makeOkLeg(overrides: Partial<OkLeg> = {}): OkLeg {
  return {
    from: "wp-0",
    to: "wp-1",
    status: "OK",
    distance_m: 1000,
    walk_time_min: 20,
    climb_m: 10,
    descent_m: 0,
    max_slope_deg: 8,
    geometry: [[0, 0], [1000, 0]],
    cell_path_length: 200,
    profile: {
      dist_m: [0, 500, 1000],
      elev_m: [0, 5, 10],
      slope_class: ["ok", "ok", "ok"],
    },
    ...overrides,
  };
}

const mockNoRouteLeg: NoRouteLeg = {
  from: "wp-1",
  to: "wp-2",
  status: "NO_ROUTE",
  reason: "DISCONNECTED_BY_SLOPE",
  nearest_reachable: { x_m: 50, y_m: -50 },
};

// docs/specs/01 FR-10, 02 §E.2 rule, 05 §E.6 (FR-10, FR-16). TASK-05 (T05.13).
describe("warnings and plan status", () => {
  it("makes routed DARKNESS OVER_LIMITS while NO_ROUTE retains PARTIAL precedence", () => {
    const legs: Leg[] = [makeOkLeg()];
    const night = DAY.sunset + 30 * MIN_MS;
    expect(solarPosition(new Date(night), SITE.lat, SITE.lon_e).elevation_deg).toBeLessThan(0);
    const timeline = [stamp(night, night), stamp(night + 20 * MIN_MS, night + 20 * MIN_MS)];
    const warnings = collectWarnings(legs, defaultScenario, timeline, 2, undefined, undefined, undefined, SITE);
    expect(warnings.some((warning) => warning.code === "DARKNESS")).toBe(true);
    expect(planStatus(legs, warnings)).toBe("OVER_LIMITS");
    expect(planStatus([...legs, mockNoRouteLeg], warnings)).toBe("PARTIAL");
  });

  it("locates consecutive cell TI_UNKNOWN flags by unsimplified along-leg distance", () => {
    const grid = makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const cells = [21, 22, 23, 24, 25];
    grid.flags[23] |= 1 << FLAG_BITS.TI_UNKNOWN;
    grid.flags[24] |= 1 << FLAG_BITS.TI_UNKNOWN;
    const warnings = collectWarnings([makeOkLeg()], defaultScenario, undefined, 0, grid, undefined, [cells]);
    expect(warnings.filter((warning) => warning.code === "TI_UNKNOWN")).toMatchObject([
      { severity: "unknown", leg: 0, from_m: 10, to_m: 15 },
    ]);
  });

  it("reports route TI_UNKNOWN independently of a DARKNESS warning", () => {
    const grid = makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    grid.flags[23] |= 1 << FLAG_BITS.TI_UNKNOWN;
    const night = DAY.sunset + 30 * MIN_MS;
    const timeline = [stamp(night, night), stamp(night + 20 * MIN_MS, night + 20 * MIN_MS)];
    const warnings = collectWarnings([makeOkLeg()], defaultScenario, timeline, 0, grid, undefined, [[21, 22, 23]], SITE);
    expect(warnings.map((warning) => warning.code)).toContain("DARKNESS");
    expect(warnings.map((warning) => warning.code)).toContain("TI_UNKNOWN");
  });

  it("uses horizontal diagonal distance and the correct leg index for a flagged endpoint", () => {
    const grid = makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    grid.flags[44] |= 1 << FLAG_BITS.TI_UNKNOWN;
    const legs = [mockNoRouteLeg, makeOkLeg()];
    const warnings = collectWarnings(legs, defaultScenario, undefined, 0, grid, undefined, [undefined, [22, 33, 44]]);
    const warning = warnings.find((item) => item.code === "TI_UNKNOWN");
    expect(warning).toMatchObject({ severity: "unknown", leg: 1 });
    expect(warning?.from_m).toBeCloseTo(10 * Math.SQRT2, 10);
    expect(warning?.to_m).toBeCloseTo(10 * Math.SQRT2, 10);
  });

  it("does not duplicate the global missing-TI warning for flagged route cells", () => {
    const grid = withoutTi(makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] }));
    grid.flags[23] |= 1 << FLAG_BITS.TI_UNKNOWN;
    const warnings = collectWarnings([makeOkLeg()], defaultScenario, undefined, 0, grid, undefined, [[21, 22, 23]]);
    expect(warnings.filter((warning) => warning.code === "TI_UNKNOWN")).toMatchObject([
      { severity: "unknown", leg: null, from_m: null, to_m: null },
    ]);
  });
  it("status PARTIAL when any leg is NO_ROUTE (02 §E.2, 03 §E.4)", () => {
    const legs: Leg[] = [makeOkLeg(), mockNoRouteLeg];
    const warnings = collectWarnings(legs, defaultScenario, [], 2.0);

    const status = planStatus(legs, warnings);
    expect(status).toBe("PARTIAL");

    // Must include a NO_ROUTE warning
    const noRouteWarn = warnings.find((w) => w.code === "NO_ROUTE");
    expect(noRouteWarn).toBeDefined();
    expect(noRouteWarn!.severity).toBe("blocked");
    expect(noRouteWarn!.leg).toBe(1);
  });

  it("flags 100 % of segments over the hard slope limit (01 §B, FR-10)", () => {
    const legWithOverLimit = makeOkLeg({
      profile: {
        dist_m: [0, 50, 100, 150, 200],
        elev_m: [0, 2, 20, 40, 42],
        slope_class: ["ok", "over_limit", "over_limit", "ok", "ok"],
      },
    });

    const warnings = collectWarnings([legWithOverLimit], defaultScenario, [], 1.0);
    const slopeWarn = warnings.find((w) => w.code === "OVER_HARD_SLOPE");
    expect(slopeWarn).toBeDefined();
    expect(slopeWarn!.severity).toBe("blocked");
    expect(slopeWarn!.leg).toBe(0);
    expect(slopeWarn!.from_m).toBe(50);
    expect(slopeWarn!.to_m).toBe(100);

    // Over hard slope makes status OVER_LIMITS
    expect(planStatus([legWithOverLimit], warnings)).toBe("OVER_LIMITS");
  });

  it("emits CAUTION_SLOPE with severity caution when segments exceed caution limit", () => {
    const legWithCaution = makeOkLeg({
      profile: {
        dist_m: [0, 50, 100, 150],
        elev_m: [0, 5, 12, 15],
        slope_class: ["ok", "caution", "caution", "ok"],
      },
    });

    const warnings = collectWarnings([legWithCaution], defaultScenario, [], 1.0);
    const cautionWarn = warnings.find((w) => w.code === "CAUTION_SLOPE");
    expect(cautionWarn).toBeDefined();
    expect(cautionWarn!.severity).toBe("caution");
    expect(cautionWarn!.leg).toBe(0);
    expect(cautionWarn!.from_m).toBe(50);
    expect(cautionWarn!.to_m).toBe(100);

    // Caution warnings alone keep status OK
    expect(planStatus([legWithCaution], warnings)).toBe("OK");
  });

  it("emits WALKBACK_EXCEEDED (blocked severity) when maxWalkbackKm > walkback_limit_km", () => {
    const legs = [makeOkLeg()];
    // Scenario walkback limit is 5.0 km, max walkback is 5.5 km
    const warnings = collectWarnings(legs, defaultScenario, [], 5.5);

    const wbWarn = warnings.find((w) => w.code === "WALKBACK_EXCEEDED");
    expect(wbWarn).toBeDefined();
    expect(wbWarn!.severity).toBe("blocked");
    expect(wbWarn!.leg).toBeNull();
    expect(wbWarn!.from_m).toBeNull();

    expect(planStatus(legs, warnings)).toBe("OVER_LIMITS");
  });

  it("emits EVA_DURATION_EXCEEDED when total walk and dwell time exceeds max_eva_duration_h", () => {
    // 3 legs of 120 min walk = 360 min (6 h) + 2 stops dwell (20 min * 2 = 40 min) = 400 min > 360 min
    const legs = [
      makeOkLeg({ walk_time_min: 120 }),
      makeOkLeg({ walk_time_min: 120 }),
      makeOkLeg({ walk_time_min: 120 }),
    ];

    const timeline: PlanResult["stops_timeline"] = [
      { arrive_utc: "2026-11-14T08:00:00Z", depart_utc: "2026-11-14T08:00:00Z", arrive_ltst: "09:00", sun_elevation_deg: 25 },
      { arrive_utc: "2026-11-14T10:00:00Z", depart_utc: "2026-11-14T10:20:00Z", arrive_ltst: "11:00", sun_elevation_deg: 45 },
      { arrive_utc: "2026-11-14T12:20:00Z", depart_utc: "2026-11-14T12:40:00Z", arrive_ltst: "13:20", sun_elevation_deg: 55 },
      { arrive_utc: "2026-11-14T14:40:00Z", depart_utc: "2026-11-14T14:40:00Z", arrive_ltst: "15:40", sun_elevation_deg: 35 },
    ];

    const warnings = collectWarnings(legs, defaultScenario, timeline, 2.0);
    const durWarn = warnings.find((w) => w.code === "EVA_DURATION_EXCEEDED");
    expect(durWarn).toBeDefined();
    expect(durWarn!.severity).toBe("blocked");
    expect(durWarn!.leg).toBeNull();

    expect(planStatus(legs, warnings)).toBe("OVER_LIMITS");
  });

  it("missing TI layer yields TI_UNKNOWN (unknown severity), never silence (05 §E.6)", () => {
    const gridWithoutTi = withoutTi(
      makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] }),
    );

    const legs = [makeOkLeg()];
    const warnings = collectWarnings(legs, defaultScenario, [], 2.0, gridWithoutTi);

    const tiWarn = warnings.find((w) => w.code === "TI_UNKNOWN");
    expect(tiWarn).toBeDefined();
    expect(tiWarn!.severity).toBe("unknown");
    expect(tiWarn!.message).toMatch(/thermal inertia/i);
  });

  it("emits EVA_DURATION_EXCEEDED and OVER_LIMITS when true margin is negative (probe: 4.8 h max, -4.6 min margin)", () => {
    // 3 waypoints: 1 start + 2 stops
    const waypoints: Waypoint[] = [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
      { id: "wp-1", role: "stop", x_m: 1000, y_m: 0 },
      { id: "wp-2", role: "stop", x_m: 2000, y_m: 0 },
    ];
    const dwellPerStopMin = 20;
    const numStops = countStops(waypoints);
    expect(numStops).toBe(2);
    const totalDwellMin = numStops * dwellPerStopMin; // 2 * 20 = 40 min

    // 2 legs with walk times summing to 252.6 min
    const leg1WalkMin = 130.0;
    const leg2WalkMin = 122.6;
    const totalWalkMin = leg1WalkMin + leg2WalkMin; // 252.6 min
    const legs: Leg[] = [
      makeOkLeg({ from: "wp-0", to: "wp-1", walk_time_min: leg1WalkMin }),
      makeOkLeg({ from: "wp-1", to: "wp-2", walk_time_min: leg2WalkMin }),
    ];

    const totalEvaMin = totalWalkMin + totalDwellMin; // 292.6 min
    // Max EVA duration: 4.8 h = 288 min -> expected margin = 288 - 292.6 = -4.6 min
    const maxEvaDurationH = 4.8;
    const expectedMarginMin = maxEvaDurationH * 60 - totalEvaMin;
    expect(expectedMarginMin).toBeCloseTo(-4.6, 5);
    expect(expectedMarginMin).toBeLessThan(0);

    const scenario: MissionScenario = {
      ...defaultScenario,
      max_eva_duration_h: maxEvaDurationH,
      dwell_min_per_stop: dwellPerStopMin,
    };

    const warnings = collectWarnings(legs, scenario, undefined, 2.0, undefined, waypoints);
    const durWarn = warnings.find((w) => w.code === "EVA_DURATION_EXCEEDED");
    expect(durWarn).toBeDefined();
    expect(durWarn!.severity).toBe("blocked");
    expect(planStatus(legs, warnings)).toBe("OVER_LIMITS");
  });

});

// BD-49: DARKNESS is evaluated at the timeline instants (each leg's departure and arrival, each dwell's end) with compute
// solarPosition, and against sunriseSunset's sunset; the warning sits on the first leg where it happens.
describe("DARKNESS along the EVA (BD-49)", () => {
  const twoLegs = (): Leg[] => [makeOkLeg(), makeOkLeg({ from: "wp-1", to: "wp-2" })];
  const run = (timeline: PlanResult["stops_timeline"], legs: Leg[] = twoLegs(), scenario: MissionScenario = defaultScenario) =>
    collectWarnings(legs, scenario, timeline, 0, undefined, undefined, undefined, SITE).filter((w) => w.code === "DARKNESS");

  it("raises nothing when every instant is above the horizon and the sunset is after the interval", () => {
    const t0 = DAY.sunrise + 120 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(t0 + 60 * MIN_MS, t0 + 80 * MIN_MS), stamp(t0 + 140 * MIN_MS, t0 + 140 * MIN_MS)];
    expect(run(timeline)).toEqual([]);
  });

  it("raises one caution on the leg that ends after sunset, at the arrival instant", () => {
    const t0 = DAY.sunset - 30 * MIN_MS;
    const arrive = t0 + 60 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(arrive, arrive + 20 * MIN_MS), stamp(arrive + 80 * MIN_MS, arrive + 80 * MIN_MS)];
    const darkness = run(timeline);
    expect(darkness).toHaveLength(1);
    expect(darkness[0]).toMatchObject({ code: "DARKNESS", severity: "caution", leg: 0, from_m: null, to_m: null, at_utc: new Date(arrive).toISOString() });
  });

  it("puts the warning on the departing leg when the sun sets during a dwell (the dwell's end is the first dark instant)", () => {
    const arrive = DAY.sunset - 5 * MIN_MS;
    const depart = DAY.sunset + 15 * MIN_MS;
    const t0 = arrive - 40 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(arrive, depart), stamp(depart + 40 * MIN_MS, depart + 40 * MIN_MS)];
    const darkness = run(timeline);
    expect(darkness).toHaveLength(1);
    expect(darkness[0]).toMatchObject({ leg: 1, at_utc: new Date(depart).toISOString() });
  });

  it("puts the warning on leg 0 when the EVA already starts in the dark", () => {
    const t0 = DAY.sunset + 60 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(t0 + 30 * MIN_MS, t0 + 30 * MIN_MS), stamp(t0 + 60 * MIN_MS, t0 + 60 * MIN_MS)];
    expect(run(timeline)).toMatchObject([{ leg: 0, at_utc: new Date(t0).toISOString() }]);
  });

  it("raises one warning even when many instants are dark, at the earliest one", () => {
    const t0 = DAY.sunset + 10 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(t0 + 30 * MIN_MS, t0 + 30 * MIN_MS), stamp(t0 + 60 * MIN_MS, t0 + 60 * MIN_MS)];
    expect(run(timeline)).toHaveLength(1);
  });

  it("raises a sunset-in-interval warning when the sunset lies between two lit instants (an interval longer than the night)", () => {
    // Not reachable with an EVA of at most 10 h; the rule is still the stated one and is pinned at function level.
    const t0 = DAY.sunset - 60 * MIN_MS;
    const next = dayOf(new Date(DAY.sunset + 12 * 3_600_000).toISOString());
    const t1 = next.sunrise + 60 * MIN_MS > DAY.sunset ? Math.max(next.sunrise, DAY.sunset) + 60 * MIN_MS : DAY.sunset + 14 * 3_600_000;
    for (const ms of [t0, t1]) expect(solarPosition(new Date(ms), SITE.lat, SITE.lon_e).elevation_deg).toBeGreaterThan(0);
    const timeline = [stamp(t0, t0), stamp(t1, t1)];
    const darkness = run(timeline, [makeOkLeg()]);
    expect(darkness).toMatchObject([{ leg: 0, severity: "caution", at_utc: new Date(DAY.sunset).toISOString() }]);
  });

  it("needs the site: without one no DARKNESS is raised (the sun cannot be computed, nothing is guessed)", () => {
    const t0 = DAY.sunset + 60 * MIN_MS;
    const timeline = [stamp(t0, t0), stamp(t0 + 30 * MIN_MS, t0 + 30 * MIN_MS)];
    const warnings = collectWarnings([makeOkLeg()], defaultScenario, timeline, 0);
    expect(warnings.filter((w) => w.code === "DARKNESS")).toEqual([]);
  });

  it("raises nothing for an empty timeline (a PARTIAL plan)", () => {
    expect(run([], [mockNoRouteLeg])).toEqual([]);
  });
});

// BD-49: LOW_RES_DEM and NO_DATA_ADJACENT are cautions, one warning per contiguous run of route cells per leg; LOW_TI is never emitted (U-03).
describe("route-cell warnings from grid flags (BD-49)", () => {
  const flat = () => makePlaneGrid({ width: 10, height: 10, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
  const rowPath = [21, 22, 23, 24, 25];
  const collect = (grid: ReturnType<typeof flat>, paths: (readonly number[] | undefined)[], legs: Leg[] = [makeOkLeg()]) =>
    collectWarnings(legs, defaultScenario, undefined, 0, grid, undefined, paths);

  it("emits LOW_RES_DEM caution once per contiguous run of flagged route cells, located along the leg", () => {
    const grid = flat();
    grid.flags[22] |= 1 << FLAG_BITS.LOW_RES_DEM;
    grid.flags[23] |= 1 << FLAG_BITS.LOW_RES_DEM;
    grid.flags[25] |= 1 << FLAG_BITS.LOW_RES_DEM;
    const found = collect(grid, [rowPath]).filter((w) => w.code === "LOW_RES_DEM");
    expect(found).toMatchObject([
      { severity: "caution", leg: 0, from_m: 5, to_m: 10 },
      { severity: "caution", leg: 0, from_m: 20, to_m: 20 },
    ]);
  });

  it("does not flag LOW_RES_DEM cells the route does not cross", () => {
    const grid = flat();
    grid.flags[60] |= 1 << FLAG_BITS.LOW_RES_DEM;
    expect(collect(grid, [rowPath]).filter((w) => w.code === "LOW_RES_DEM")).toEqual([]);
  });

  it("emits NO_DATA_ADJACENT caution for route cells with a NaN cell among their 8 neighbours (diagonals included), one run per leg", () => {
    const grid = flat();
    grid.elevation[13] = Number.NaN; // row 1, column 3: touches route cells 22, 23, 24 (24 diagonally)
    const found = collect(grid, [rowPath]).filter((w) => w.code === "NO_DATA_ADJACENT");
    expect(found).toMatchObject([{ severity: "caution", leg: 0, from_m: 5, to_m: 15 }]);
  });

  it("counts a NO_DATA-flagged neighbour as a no-data cell", () => {
    const grid = flat();
    grid.flags[13] |= 1 << FLAG_BITS.NO_DATA;
    const found = collect(grid, [rowPath]).filter((w) => w.code === "NO_DATA_ADJACENT");
    expect(found).toMatchObject([{ leg: 0, from_m: 5, to_m: 15 }]);
  });

  it("reports each leg's runs against that leg's index and skips a NO_ROUTE leg", () => {
    const grid = flat();
    grid.elevation[13] = Number.NaN;
    grid.flags[62] |= 1 << FLAG_BITS.LOW_RES_DEM;
    const legs = [mockNoRouteLeg, makeOkLeg(), makeOkLeg()];
    const found = collect(grid, [undefined, rowPath, [61, 62, 63]], legs);
    expect(found.filter((w) => w.code === "NO_DATA_ADJACENT").map((w) => w.leg)).toEqual([1]);
    expect(found.filter((w) => w.code === "LOW_RES_DEM")).toMatchObject([{ leg: 2, from_m: 5, to_m: 5 }]);
  });

  it("never emits LOW_TI, even with the LOW_TI bit set on route cells (U-03)", () => {
    const grid = flat();
    for (const cell of rowPath) grid.flags[cell] |= 1 << FLAG_BITS.LOW_TI;
    expect(collect(grid, [rowPath]).filter((w) => w.code === "LOW_TI")).toEqual([]);
  });
});
