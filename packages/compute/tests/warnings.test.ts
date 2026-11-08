import type { Leg, MissionScenario, NoRouteLeg, OkLeg, PlanResult } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, withoutTi } from "../../../apps/web/tests/fixtures/grids";
import { collectWarnings, planStatus } from "../src/warnings";

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

  it("emits DARKNESS warning when solar conditions indicate sun below horizon during EVA", () => {
    const legs = [makeOkLeg()];
    const timeline: PlanResult["stops_timeline"] = [
      {
        arrive_utc: "2026-11-14T08:00:00Z",
        depart_utc: "2026-11-14T08:20:00Z",
        arrive_ltst: "09:00",
        sun_elevation_deg: -5.0, // below horizon
      },
    ];

    const warnings = collectWarnings(legs, defaultScenario, timeline, 2.0);
    const darkWarn = warnings.find((w) => w.code === "DARKNESS");
    expect(darkWarn).toBeDefined();
    expect(darkWarn!.severity).toBe("caution");
  });
});
