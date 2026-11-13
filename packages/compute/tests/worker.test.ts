import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FLAG_BITS, type ComputePlanRequest, type EnvConstant, type PlanResult, type SamplePointRequest } from "@marswalk/protocol";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, makeWallWithGapGrid } from "../../../apps/web/tests/fixtures/grids";
import { handleWorkerMessage, handleWorkerMessageAsync } from "../src/handler";
import { cellIndex } from "../src/grid";
import { localTrueSolarTime, mslSol, solarLongitude } from "../src/mars24";
import { estimateDose } from "../src/radiation";
import { inverseEqc, parseEqcProjection } from "../src/sampling";
import { solarPosition, sunriseSunset } from "../src/sun";

const testGrid = makePlaneGrid({
  width: 20,
  height: 20,
  cell_m: 5,
  slope_deg: 0,
  origin_m: [0, 0],
});

const defaultComputeRequest: ComputePlanRequest = {
  type: "COMPUTE_PLAN",
  request_id: "req-001",
  plan_revision: 1,
  site_id: "gale_boxwork",
  data_version: "2026.11.05",
  scenario: {
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
    vehicle_param_set: "pr1-assumed",
  },
  waypoints: [
    { id: "wp-0", role: "start", x_m: 12.5, y_m: -12.5 },
    { id: "wp-1", role: "stop", x_m: 37.5, y_m: -12.5 },
    { id: "wp-2", role: "stop", x_m: 37.5, y_m: -37.5 },
  ],
};

// docs/specs/02 §E.2 worker message protocol (FR-03, FR-07, NFR-02, NFR-06, NFR-10). TASK-05 (T05.15).
describe("compute worker handler and entry", () => {
  describe("handleWorkerMessage", () => {
    it.each([{ request: null }, { request: {} }, { request: [] }, { request: { request_id: "req" } }])(
      "rejects malformed worker request envelopes $request", ({ request }) => {
        const response = handleWorkerMessage(testGrid, request as unknown as ComputePlanRequest);
        expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
      },
    );
    it.each([
      ["request_id", undefined],
      ["plan_revision", undefined],
      ["site_id", undefined],
      ["data_version", undefined],
      ["scenario", undefined],
      ["waypoints", undefined],
      ["scenario", null],
      ["scenario", []],
      ["waypoints", {}],
      ["waypoints", [null]],
    ])("rejects malformed COMPUTE_PLAN %s = %j", (field, value) => {
      const response = handleWorkerMessage(testGrid, { ...defaultComputeRequest, [field]: value } as ComputePlanRequest);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
    });

    it.each(Object.keys(defaultComputeRequest.scenario))(
      "rejects missing required scenario field %s (with conditional vehicle parameter)",
      (field) => {
        const scenario = { ...defaultComputeRequest.scenario } as Record<string, unknown>;
        delete scenario[field];
        const response = handleWorkerMessage(testGrid, { ...defaultComputeRequest, scenario } as unknown as ComputePlanRequest);
        expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
      },
    );

    it("allows absent vehicle_param_set only when vehicle_available is false", () => {
      const { vehicle_param_set: _vehicleParam, ...scenario } = defaultComputeRequest.scenario;
      const response = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...scenario, vehicle_available: false },
      });
      expect(response.type).toBe("PLAN_RESULT");
    });

    it.each([undefined, null, "true", 1])("rejects invalid loop %j", (loop) => {
      const response = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop },
      } as unknown as ComputePlanRequest);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
    });

    it.each([NaN, Infinity, -Infinity, undefined])("rejects nonfinite waypoint coordinate %j", (coordinate) => {
      for (const axis of ["x_m", "y_m"] as const) {
        const waypoints = defaultComputeRequest.waypoints.map((wp, index) =>
          index === 1 ? { ...wp, [axis]: coordinate } : wp,
        );
        const response = handleWorkerMessage(testGrid, { ...defaultComputeRequest, waypoints } as ComputePlanRequest);
        expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
      }
    });

    it.each(["via", "START", null, undefined])("rejects invalid waypoint role %j", (role) => {
      const waypoints = defaultComputeRequest.waypoints.map((wp, index) => index === 1 ? { ...wp, role } : wp);
      const response = handleWorkerMessage(testGrid, { ...defaultComputeRequest, waypoints } as ComputePlanRequest);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
    });

    it.each([
      { request_id: undefined }, { x_m: NaN }, { y_m: Infinity },
      { snap_radius_m: undefined }, { snap_radius_m: -1 }, { snap_radius_m: Infinity },
      { hard_slope_limit_deg: NaN },
    ])("rejects malformed SAMPLE_POINT %j before sampling", (overrides) => {
      const request = { type: "SAMPLE_POINT", request_id: "sample", x_m: 12.5, y_m: -12.5, snap_radius_m: 50, ...overrides } as SamplePointRequest;
      const response = handleWorkerMessage(testGrid, request);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
    });
    it("returns GRID_NOT_LOADED error when grid is null", () => {
      const response = handleWorkerMessage(null, defaultComputeRequest);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.request_id).toBe("req-001");
        expect(response.code).toBe("GRID_NOT_LOADED");
      }
    });

    it("handles SAMPLE_POINT and returns SAMPLE_RESULT echoing request_id", () => {
      const sampleReq: SamplePointRequest = {
        type: "SAMPLE_POINT",
        request_id: "sample-42",
        x_m: 12.5,
        y_m: -12.5,
        snap_radius_m: 50,
      };

      const response = handleWorkerMessage(testGrid, sampleReq, undefined, { hardSlopeLimitDeg: 15 });
      expect(response.type).toBe("SAMPLE_RESULT");
      if (response.type === "SAMPLE_RESULT") {
        expect(response.request_id).toBe("sample-42");
        expect(response.inside_aoi).toBe(true);
        expect(response.passable).toBe(true);
        expect(typeof response.elevation_m).toBe("number");
        expect(typeof response.lat).toBe("number");
        expect(typeof response.lon_e).toBe("number");
      }
    });

    // BD-49: the handler now evaluates DARKNESS from the timeline, so the "OK" plan starts an hour after sunrise (derived
    // from compute at the plan's own site, not typed) and the night plan starts an hour after sunset.
    const evaStartAt = (offsetMin: number, which: "sunrise_utc" | "sunset_utc"): string => {
      const site = inverseEqc(12.5, -12.5, parseEqcProjection(testGrid.meta.proj4));
      const sun = sunriseSunset(new Date(defaultComputeRequest.scenario.eva_start_utc), site.lat, site.lon_e);
      return new Date(Date.parse(sun[which]) + offsetMin * 60_000).toISOString();
    };

    it("raises DARKNESS and OVER_LIMITS for a plan that starts after sunset, and none for one after sunrise (BD-49)", () => {
      const dark = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, eva_start_utc: evaStartAt(60, "sunset_utc") },
      });
      const lit = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, eva_start_utc: evaStartAt(60, "sunrise_utc") },
      });
      expect(dark).toMatchObject({ type: "PLAN_RESULT", status: "OVER_LIMITS" });
      expect(dark.type === "PLAN_RESULT" && dark.warnings.filter((w) => w.code === "DARKNESS")).toMatchObject([{ severity: "caution", leg: 0 }]);
      expect(lit).toMatchObject({ type: "PLAN_RESULT", status: "OK" });
      expect(lit.type === "PLAN_RESULT" && lit.warnings.some((w) => w.code === "DARKNESS")).toBe(false);
    });

    it("handles COMPUTE_PLAN with loop: true (3 waypoints -> 3 legs)", () => {
      const response = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, eva_start_utc: evaStartAt(60, "sunrise_utc") },
      });
      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.request_id).toBe("req-001");
        expect(response.plan_revision).toBe(1);
        expect(response.status).toBe("OK");
        // 3 legs: wp-0 -> wp-1, wp-1 -> wp-2, wp-2 -> wp-0 (loop return)
        expect(response.legs).toHaveLength(3);
        expect(response.legs[0].from).toBe("wp-0");
        expect(response.legs[0].to).toBe("wp-1");
        expect(response.legs[1].from).toBe("wp-1");
        expect(response.legs[1].to).toBe("wp-2");
        expect(response.legs[2].from).toBe("wp-2");
        expect(response.legs[2].to).toBe("wp-0");

        const firstLeg = response.legs[0];
        expect(firstLeg.status).toBe("OK");
        if (firstLeg.status === "OK") {
          expect(firstLeg.geometry.length).toBeGreaterThan(1);
          expect(firstLeg.profile.dist_m.length).toBeGreaterThan(1);
          expect(firstLeg.profile.elev_m).toHaveLength(firstLeg.profile.dist_m.length);
        }

        // Totals must be present on OK status
        expect(response.totals).not.toBeNull();
        expect(response.totals!.distance_m).toBeGreaterThan(0);
        expect(response.totals!.walk_time_min).toBeGreaterThan(0);
      }
    });

    it("handles COMPUTE_PLAN with loop: false (3 waypoints -> 2 legs)", () => {
      const oneWayReq: ComputePlanRequest = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop: false },
      };

      const response = handleWorkerMessage(testGrid, oneWayReq);
      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.legs).toHaveLength(2);
        expect(response.legs[0].from).toBe("wp-0");
        expect(response.legs[0].to).toBe("wp-1");
        expect(response.legs[1].from).toBe("wp-1");
        expect(response.legs[1].to).toBe("wp-2");
      }
    });

    it("returns INVALID_INPUT error for invalid scenario constraints", () => {
      const invalidReq: ComputePlanRequest = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, hard_slope_limit_deg: 50 }, // out of range
      };

      const response = handleWorkerMessage(testGrid, invalidReq);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.code).toBe("INVALID_INPUT");
        expect(response.request_id).toBe("req-001");
      }
    });

    it("returns TIMEOUT error when search node expansions exceeded", () => {
      // Pass tiny maxExpansions by testing a blocked/huge search or injecting maxExpansions
      // In a wall grid where search exhausts expansions:
      const grid = makePlaneGrid({ width: 30, height: 30, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      const req: ComputePlanRequest = {
        ...defaultComputeRequest,
        waypoints: [
          { id: "wp-0", role: "start", x_m: 10, y_m: -10 },
          { id: "wp-1", role: "stop", x_m: 140, y_m: -140 },
        ],
      };

      // When called with maxExpansions override = 5
      const response = handleWorkerMessage(grid, req, 5);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.code).toBe("TIMEOUT");
      }
    });

    it("returns PARTIAL with null totals when a leg has no route", () => {
      const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      const start = defaultComputeRequest.waypoints[0];
      const index = cellIndex(grid, start.x_m, start.y_m);
      expect(index).not.toBeNull();
      grid.flags[index!] |= 1 << FLAG_BITS.HARD_HAZARD;

      const response = handleWorkerMessage(grid, defaultComputeRequest);
      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.legs.some((leg) => leg.status === "NO_ROUTE")).toBe(true);
        expect(response.status).toBe("PARTIAL");
        expect(response.totals).toBeNull();
      }
    });

    it("converts a thrown grid access into INTERNAL with the request id", () => {
      const grid = { ...testGrid, get meta(): typeof testGrid.meta { throw new Error("grid access failed"); } };
      expect(handleWorkerMessage(grid, defaultComputeRequest)).toMatchObject({
        type: "ERROR", code: "INTERNAL", request_id: defaultComputeRequest.request_id,
        message: "grid access failed",
      });
    });

    it("returns identical complete pure responses without clock metadata or fabricated science", () => {
      const res1 = handleWorkerMessage(testGrid, defaultComputeRequest);
      const res2 = handleWorkerMessage(testGrid, defaultComputeRequest);

      expect(res1.type).toBe("PLAN_RESULT");
      expect(res2.type).toBe("PLAN_RESULT");

      if (res1.type === "PLAN_RESULT" && res2.type === "PLAN_RESULT") {
        expect(res1).toStrictEqual(res2);
        expect(res1).not.toHaveProperty("computed_utc");
        expect(res1).not.toHaveProperty("timing_ms");
        // The handler needs no env constants for the timeline and the EVA-sol conditions; radiation is omitted
        // without them (BD-50) and never invented.
        expect(res1).not.toHaveProperty("radiation");
        expect(res1.stops_timeline).toHaveLength(defaultComputeRequest.waypoints.length + 1);
        expect(res1.conditions).toBeDefined();
      }
    });

    it.each([true, false])("counts actual stops for duration warnings with loop=%s", (loop) => {
      const request = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop, max_eva_duration_h: 0.75 },
      };
      const under = handleWorkerMessage(testGrid, request);
      expect(under.type).toBe("PLAN_RESULT");
      if (under.type !== "PLAN_RESULT") return;
      expect(under.totals?.dwell_time_min).toBe(40);
      expect(under.warnings.some((warning) => warning.code === "EVA_DURATION_EXCEEDED")).toBe(false);
      const over = handleWorkerMessage(testGrid, {
        ...request,
        scenario: { ...request.scenario, max_eva_duration_h: 0.5 },
      });
      expect(over.type).toBe("PLAN_RESULT");
      if (over.type !== "PLAN_RESULT") return;
      expect(over.totals?.dwell_time_min).toBe(40);
      expect(over.warnings.some((warning) => warning.code === "EVA_DURATION_EXCEEDED")).toBe(true);
      expect(over.status).toBe("OVER_LIMITS");
    });

    it("reports TI_UNKNOWN on a routed cell omitted by simplified display geometry", () => {
      const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      const request: ComputePlanRequest = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop: false },
        waypoints: [
          { id: "wp-0", role: "start", x_m: 12.5, y_m: -12.5 },
          { id: "wp-1", role: "stop", x_m: 37.5, y_m: -12.5 },
        ],
      };
      const plain = handleWorkerMessage(grid, request);
      expect(plain.type).toBe("PLAN_RESULT");
      if (plain.type !== "PLAN_RESULT") return;
      expect(plain.warnings.some((warning) => warning.code === "TI_UNKNOWN")).toBe(false);
      grid.flags[2 * 20 + 4] |= 1 << FLAG_BITS.TI_UNKNOWN;
      const flagged = handleWorkerMessage(grid, request);
      expect(flagged.type).toBe("PLAN_RESULT");
      if (flagged.type !== "PLAN_RESULT") return;
      expect(flagged.legs[0]).toMatchObject({ status: "OK", geometry: [[12.5, -12.5], [37.5, -12.5]] });
      expect(flagged.warnings.filter((warning) => warning.code === "TI_UNKNOWN")).toMatchObject([
        { severity: "unknown", leg: 0, from_m: 10, to_m: 10 },
      ]);
      grid.flags[2 * 20 + 4] = 0;
      grid.flags[10 * 20 + 10] |= 1 << FLAG_BITS.TI_UNKNOWN;
      const offRoute = handleWorkerMessage(grid, request);
      expect(offRoute.type).toBe("PLAN_RESULT");
      if (offRoute.type === "PLAN_RESULT") {
        expect(offRoute.warnings.some((warning) => warning.code === "TI_UNKNOWN")).toBe(false);
      }
    });

    it("accepts schema-valid waypoint order and counts dwell only at stops", () => {
      const waypoints = [
        defaultComputeRequest.waypoints[1],
        defaultComputeRequest.waypoints[0],
        defaultComputeRequest.waypoints[2],
      ];
      const response = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop: false },
        waypoints,
      });

      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.legs.map(({ from, to }) => [from, to])).toEqual([
          [waypoints[0].id, waypoints[1].id],
          [waypoints[1].id, waypoints[2].id],
        ]);
        expect(response.totals?.dwell_time_min).toBe(2 * defaultComputeRequest.scenario.dwell_min_per_stop);
        expect(response).not.toHaveProperty("computed_utc");
        expect(response).not.toHaveProperty("timing_ms");
      }
    });

    it("returns INVALID_INPUT for an unprintable waypoint coordinate", () => {
      const unprintable = { toString: 1, valueOf: 1 };
      const response = handleWorkerMessage(testGrid, {
        ...defaultComputeRequest,
        waypoints: [{ ...defaultComputeRequest.waypoints[0], x_m: unprintable }, defaultComputeRequest.waypoints[1]],
      } as unknown as ComputePlanRequest);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
      if (response.type === "ERROR") expect(response.message).toContain("coordinates");
    });

    it("reports an unknown request type with request_id 'unknown' when the id is not a string", () => {
      const response = handleWorkerMessage(testGrid, { type: "BOGUS", request_id: 5 } as unknown as ComputePlanRequest);
      expect(response).toMatchObject({ type: "ERROR", code: "INTERNAL" });
      if (response.type === "ERROR") expect(response.request_id).toBe("unknown");
    });

    it("is pure and deterministic: same input gives the same result, with no wall-clock fields", () => {
      const res1 = handleWorkerMessage(testGrid, defaultComputeRequest);
      const res2 = handleWorkerMessage(testGrid, defaultComputeRequest);

      expect(res1).toEqual(res2);
      expect(res1.type).toBe("PLAN_RESULT");
      if (res1.type === "PLAN_RESULT") {
        expect("computed_utc" in res1).toBe(false);
        expect("timing_ms" in res1).toBe(false);
        // Dwell stops counted from waypoints with role === 'stop'
        const stops = defaultComputeRequest.waypoints.filter((w) => w.role === "stop").length;
        expect(res1.totals?.dwell_time_min).toBe(stops * defaultComputeRequest.scenario.dwell_min_per_stop);
      }
    });

    // DARKNESS from solar inputs along legs and dwell is package 14 (BD-49), not C8 assembly.
    it.todo("DARKNESS warning from solar inputs along legs and dwell (package 14, BD-49)");
  });

  // C8 assembly into PLAN_RESULT (T06.09, T05.32; BD-50, BD-122).
  describe("PLAN_RESULT conditions, timeline and radiation", () => {
    const loadRate = (phase: "max" | "min"): EnvConstant =>
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../../../pipeline/sites/gale_boxwork/env_constants/rad-gale-dose-eq-solar-${phase}.json`, import.meta.url), ),
          "utf8",
        ),
      ) as EnvConstant;
    const envConstants = [loadRate("max"), loadRate("min")];
    const start = defaultComputeRequest.waypoints[0];
    // The site is the plan's start waypoint through the inverse working projection (BD-50).
    const site = inverseEqc(start.x_m, start.y_m, parseEqcProjection(testGrid.meta.proj4));

    function plan(options: Parameters<typeof handleWorkerMessage>[3] = { envConstants }, request: ComputePlanRequest = defaultComputeRequest) {
      const response = handleWorkerMessage(testGrid, request, undefined, options);
      expect(response.type).toBe("PLAN_RESULT");
      return response as Extract<typeof response, { type: "PLAN_RESULT" }>;
    }

    it("fills stops_timeline: one entry per waypoint plus the loop return, from the start instant, with LTST and sun elevation at the start waypoint", () => {
      const res = plan();
      const evaStartMs = Date.parse(defaultComputeRequest.scenario.eva_start_utc);

      expect(res.stops_timeline).toHaveLength(defaultComputeRequest.waypoints.length + 1);
      expect(Date.parse(res.stops_timeline[0].arrive_utc)).toBe(evaStartMs);
      for (const entry of res.stops_timeline) {
        const arrive = new Date(entry.arrive_utc);
        expect(entry.arrive_ltst).toBe(localTrueSolarTime(arrive, site.lon_e));
        expect(entry.sun_elevation_deg).toBe(solarPosition(arrive, site.lat, site.lon_e).elevation_deg);
        expect(Date.parse(entry.depart_utc)).toBeGreaterThanOrEqual(Date.parse(entry.arrive_utc));
      }
      // The loop ends when the EVA does: last arrival minus start is the EVA total.
      const last = res.stops_timeline[res.stops_timeline.length - 1];
      expect((Date.parse(last.arrive_utc) - evaStartMs) / 60_000).toBeCloseTo(res.totals!.eva_total_min, 2); // ISO timestamps carry milliseconds
    });

    it("has no return entry when loop is false", () => {
      const request = { ...defaultComputeRequest, scenario: { ...defaultComputeRequest.scenario, loop: false } };
      expect(plan({ envConstants }, request).stops_timeline).toHaveLength(request.waypoints.length);
    });

    it("fills conditions for the EVA sol, incl. the MSL sol, from the compute functions at the start waypoint", () => {
      const res = plan();
      const evaStart = new Date(defaultComputeRequest.scenario.eva_start_utc);
      const sun = sunriseSunset(evaStart, site.lat, site.lon_e);
      const sol = solarLongitude(evaStart);

      expect(res.conditions).toEqual({
        mars_year: sol.mars_year,
        ls_deg: sol.ls_deg,
        sunrise_ltst: sun.sunrise_ltst,
        sunset_ltst: sun.sunset_ltst,
        sunrise_utc: sun.sunrise_utc,
        sunset_utc: sun.sunset_utc,
        sol: mslSol(evaStart, site.lon_e),
      });
    });

    it.each(["max", "min"] as const)("fills radiation for solar_phase %s over the routed EVA total (02 §D.4)", (phase) => {
      const request = { ...defaultComputeRequest, scenario: { ...defaultComputeRequest.scenario, solar_phase: phase } };
      const res = plan({ envConstants }, request);
      const rate = envConstants.find((c) => c.conditions.solar_phase === phase)!;

      expect(res.radiation).toEqual(estimateDose(rate, res.totals!.eva_total_min / 60));
      expect(res.radiation?.solar_phase).toBe(phase);
    });

    it("omits radiation, and invents nothing, when the handler was given no env constants", () => {
      const res = plan({});
      expect(res).not.toHaveProperty("radiation");
      expect(res.conditions).toBeDefined();
    });

    it("PARTIAL plan: totals null, no timeline (walk times unknown), no radiation, conditions still present", () => {
      const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      grid.flags[cellIndex(grid, start.x_m, start.y_m)!] |= 1 << FLAG_BITS.HARD_HAZARD;

      const res = handleWorkerMessage(grid, defaultComputeRequest, undefined, { envConstants });

      expect(res.type).toBe("PLAN_RESULT");
      if (res.type !== "PLAN_RESULT") return;
      expect(res.status).toBe("PARTIAL");
      expect(res.totals).toBeNull();
      expect(res.stops_timeline).toEqual([]);
      expect(res).not.toHaveProperty("radiation");
      expect(res.conditions?.sol).toBe(mslSol(new Date(defaultComputeRequest.scenario.eva_start_utc), site.lon_e));
    });

    it("a grid far from the default origin gives another site: LTST follows the inverse projection of the start waypoint (Mars CRS, projected metres)", () => {
      const shift = 4_000_000;
      const farGrid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [shift, 0] });
      const moved = {
        ...defaultComputeRequest,
        waypoints: defaultComputeRequest.waypoints.map((w) => ({ ...w, x_m: w.x_m + shift })),
      };
      const movedSite = inverseEqc(start.x_m + shift, start.y_m, parseEqcProjection(testGrid.meta.proj4));
      expect(Math.abs(movedSite.lon_e - site.lon_e)).toBeGreaterThan(1);

      const res = handleWorkerMessage(farGrid, moved, undefined, { envConstants });

      expect(res.type).toBe("PLAN_RESULT");
      if (res.type !== "PLAN_RESULT") return;
      const arrive = new Date(res.stops_timeline[0].arrive_utc);
      expect(res.stops_timeline[0].arrive_ltst).toBe(localTrueSolarTime(arrive, movedSite.lon_e));
      expect(res.conditions?.sol).toBe(mslSol(arrive, movedSite.lon_e));
    });

    it("calls the injected timer for every routed leg ('routing') and once for the assembly ('estimates'), and returns the values unchanged", () => {
      const calls: string[] = [];
      const timer = <T,>(phase: "routing" | "estimates", fn: () => T): T => {
        calls.push(phase);
        return fn();
      };

      const timed = plan({ envConstants, timer });

      expect(calls.filter((c) => c === "routing")).toHaveLength(timed.legs.length);
      expect(calls.filter((c) => c === "estimates")).toHaveLength(1);
      expect(timed).toEqual(plan({ envConstants }));
    });

    it("is deterministic: two runs on the same grid and request are identical (BD-51)", () => {
      expect(plan()).toStrictEqual(plan());
    });

    it("returns a PlanResult that validates against schemas/plan-export.schema.json when exported", () => {
      const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../../../schemas/plan-export.schema.json", import.meta.url)), "utf8"));
      const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
      addFormats(ajv);
      ajv.addSchema(schema);
      const validate = ajv.getSchema(`${schema.$id}#/$defs/PlanResult`)!;
      const { type: _type, request_id: _id, plan_revision: _rev, ...result } = plan();
      // Run metadata the adapter adds (02 §E.2); the schema requires nothing about their values.
      const exported: PlanResult = { ...result, computed_utc: "2026-11-12T08:00:00Z", timing_ms: { total: 1, routing: 1, estimates: 0 } };

      expect(validate(exported), JSON.stringify(validate.errors)).toBe(true);
      expect(exported.conditions?.sol).toBeTypeOf("number");
    });
  });

  // BD-42: SAMPLE_POINT's hard slope limit is the request's own, else the one the worker holds; never a literal in compute.
  describe("SAMPLE_POINT hard slope limit (BD-42)", () => {
    const steep = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 12, origin_m: [0, 0] });
    const sample = (extra: Partial<SamplePointRequest> = {}): SamplePointRequest => ({
      type: "SAMPLE_POINT", request_id: "s", x_m: 12.5, y_m: -12.5, snap_radius_m: 50, ...extra,
    });

    it("uses the request's limit over the handler's", () => {
      const strict = handleWorkerMessage(steep, sample({ hard_slope_limit_deg: 10 }), undefined, { hardSlopeLimitDeg: 15 });
      const loose = handleWorkerMessage(steep, sample({ hard_slope_limit_deg: 20 }), undefined, { hardSlopeLimitDeg: 5 });
      expect(strict).toMatchObject({ type: "SAMPLE_RESULT", passable: false, reason: "SLOPE_OVER_LIMIT" });
      expect(loose).toMatchObject({ type: "SAMPLE_RESULT", passable: true });
    });

    it("falls back to the handler's limit when the request has none", () => {
      expect(handleWorkerMessage(steep, sample(), undefined, { hardSlopeLimitDeg: 10 })).toMatchObject({ passable: false });
      expect(handleWorkerMessage(steep, sample(), undefined, { hardSlopeLimitDeg: 15 })).toMatchObject({ passable: true });
    });

    it("answers INVALID_INPUT, not a guess, when neither the request nor the handler has a limit", () => {
      const response = handleWorkerMessage(steep, sample());
      expect(response).toMatchObject({ type: "ERROR", request_id: "s", code: "INVALID_INPUT" });
      expect((response as { message: string }).message).toMatch(/hard_slope_limit_deg/);
    });
  });

  // BD-41: the async handler yields between slices of the search and reads the cancel flag after each yield.
  describe("handleWorkerMessageAsync (BD-41)", () => {
    const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    const bigGrid = makePlaneGrid({ width: 40, height: 40, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const farRequest: ComputePlanRequest = {
      ...defaultComputeRequest,
      request_id: "req-far",
      scenario: { ...defaultComputeRequest.scenario, loop: false },
      waypoints: [
        { id: "wp-0", role: "start", x_m: 12.5, y_m: -12.5 },
        { id: "wp-1", role: "stop", x_m: 187.5, y_m: -187.5 },
      ],
    };

    it("returns exactly what the synchronous handler returns", async () => {
      const sync = handleWorkerMessage(testGrid, defaultComputeRequest);
      const asyncResponse = await handleWorkerMessageAsync(testGrid, defaultComputeRequest, { yieldToLoop: macrotask });
      expect(asyncResponse).toStrictEqual(sync);
    });

    it("answers CANCELLED with the request_id when the flag flips while the search is yielded", async () => {
      let cancel = false;
      setTimeout(() => { cancel = true; }, 0);
      const response = await handleWorkerMessageAsync(bigGrid, farRequest, {
        yieldToLoop: macrotask, cancellationInterval: 10, shouldCancel: () => cancel,
      });
      expect(response).toMatchObject({ type: "ERROR", request_id: "req-far", code: "CANCELLED" });
    });

    it("answers TIMEOUT through an injected maxExpansions", async () => {
      const response = await handleWorkerMessageAsync(bigGrid, farRequest, { yieldToLoop: macrotask, maxExpansions: 5 });
      expect(response).toMatchObject({ type: "ERROR", request_id: "req-far", code: "TIMEOUT" });
    });

    it("answers GRID_NOT_LOADED for every request until a grid is given", async () => {
      expect(await handleWorkerMessageAsync(null, farRequest, { yieldToLoop: macrotask })).toMatchObject({ code: "GRID_NOT_LOADED", request_id: "req-far" });
    });

    it("brackets only its synchronous slices with the timer, so awaited time is not counted as routing", async () => {
      let open = 0;
      let maxOpen = 0;
      let routingCalls = 0;
      const timer = <T,>(phase: "routing" | "estimates", fn: () => T): T => {
        open++;
        maxOpen = Math.max(maxOpen, open);
        if (phase === "routing") routingCalls++;
        try { return fn(); } finally { open--; }
      };
      let yields = 0;
      await handleWorkerMessageAsync(bigGrid, farRequest, {
        yieldToLoop: async () => { yields++; await macrotask(); }, cancellationInterval: 10, timer,
      });
      expect(yields).toBeGreaterThan(0);
      expect(routingCalls).toBeGreaterThan(yields); // one slice per yield plus the last one
      expect(open).toBe(0); // no timer is left open across an await
    });
  });
});
