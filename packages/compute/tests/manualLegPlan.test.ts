/**
 * The manual leg in the plan (N-160(c), FD-441): a hand-drawn leg travels with the COMPUTE_PLAN as a polyline, the worker
 * measures it on the grid and the plan's totals, timeline, conditions and radiation are computed from it. The page sends a
 * polyline, never a number: the worker's own measurement is what enters the plan.
 *
 * Expected values are derived from the grid fixtures and from `validateManualLeg` + `toLeg`, the same measures the router's
 * legs use, never typed in.
 */
import type { ComputePlanRequest, MissionScenario, PlanResultMessage } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makeHazardWallGrid, makePlaneGrid, makeWallWithGapGrid } from "../../../apps/web/tests/fixtures/grids";
import { handleWorkerMessage, handleWorkerMessageAsync } from "../src/handler";
import { centreOfCell, type LoadedGrid } from "../src/grid";
import { toLeg } from "../src/leg";
import { cellsAlongPath } from "../src/paths";
import { validateManualLeg } from "../src/manualLeg";

const scenario: MissionScenario = {
  eva_start_utc: "2026-11-14T08:00:00Z",
  max_eva_duration_h: 6,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: false,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
  vehicle_param_set: "pr1-assumed",
};

const W = 20;
const plane = (slope_deg = 0): LoadedGrid => makePlaneGrid({ width: W, height: 20, cell_m: 5, slope_deg, origin_m: [0, 0] });
const centre = (g: LoadedGrid, row: number, col: number): [number, number] => centreOfCell(g.meta, row * g.meta.width + col);

const baseRequest = (g: LoadedGrid, over: Partial<ComputePlanRequest> = {}): ComputePlanRequest => ({
  type: "COMPUTE_PLAN",
  request_id: "req-plan",
  plan_revision: 3,
  site_id: "mock_site",
  data_version: "v",
  scenario,
  waypoints: [
    { id: "wp-0", role: "start", x_m: centre(g, 2, 1)[0], y_m: centre(g, 2, 1)[1] },
    { id: "wp-1", role: "stop", x_m: centre(g, 2, 10)[0], y_m: centre(g, 2, 10)[1] },
  ],
  ...over,
});

describe("a manual leg in the plan (N-160(c))", () => {
  it("the plan carries the measured leg and totals it: the totals are not null any more", () => {
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    expect(response.type).toBe("PLAN_RESULT");
    expect(response.legs).toHaveLength(1);
    const measured = validateManualLeg(g, scenario, "wp-0", "wp-1", vertices);
    expect(response.legs[0]).toEqual(measured.leg);
    // The totals exist because every leg has a route: the manual one measured by the worker.
    expect(response.totals).not.toBeNull();
    expect(response.totals!.walk_time_min).toBe(measured.leg.status === "OK" ? measured.leg.walk_time_min : 0);
    expect(response.totals!.distance_m).toBe(measured.leg.status === "OK" ? measured.leg.distance_m : 0);
    expect(response.stops_timeline.length).toBeGreaterThan(0);
  });

  it("without a manual leg the plan is the routed plan: the totals are null because the router finds no route", () => {
    // A wall with no gap between the two waypoints: the router finds no route, so the plan has no totals.
    const walled = makeHazardWallGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8 });
    const response = handleWorkerMessage(walled, baseRequest(walled)) as PlanResultMessage;
    expect(response.status).toBe("PARTIAL");
    expect(response.totals).toBeNull();
  });

  it("the manual leg replaces the routed leg: the plan carries the drawn leg, not the router's", () => {
    // A wall with a gap at row 15. The router finds its own way through the gap; the drawn polyline takes a longer way
    // round, so the two legs are measurably different and the plan must carry the drawn one.
    const g = makeWallWithGapGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8, gap_row: 15, wall_slope_deg: 20 });
    const vertices = [centre(g, 3, 2), centre(g, 14, 2), centre(g, 15, 8), centre(g, 14, 12), centre(g, 3, 14)];
    const routed = handleWorkerMessage(g, baseRequest(g)) as PlanResultMessage;
    const withManual = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    expect(routed.legs[0]!.status).toBe("OK");
    expect(withManual.legs[0]!.status).toBe("OK");
    // The drawn leg is the plan's leg, and it is not the routed one.
    const routedLeg = routed.legs[0] as Extract<typeof routed.legs[number], { status: "OK" }>;
    const manualLeg = withManual.legs[0] as Extract<typeof withManual.legs[number], { status: "OK" }>;
    expect(manualLeg.geometry).not.toEqual(routedLeg.geometry);
    const measured = validateManualLeg(g, scenario, "wp-0", "wp-1", vertices);
    expect(withManual.legs[0]).toEqual(measured.leg);
    // The totals come from the drawn leg.
    expect(withManual.totals!.distance_m).toBe(measured.leg.status === "OK" ? measured.leg.distance_m : 0);
    expect(withManual.totals!.distance_m).not.toBe(routed.totals!.distance_m);
  });

  it("the plan's leg is measured from the drawn polyline exactly as toLeg measures its cells", () => {
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const cells = cellsAlongPath(g, vertices);
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    expect(response.legs[0]).toEqual(toLeg(g, "wp-0", "wp-1", { status: "OK", cells }, scenario));
  });

  it("the async handler answers identically", async () => {
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const request = baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] });
    const sync = handleWorkerMessage(g, request);
    const async_ = await handleWorkerMessageAsync(g, request, { yieldToLoop: async () => undefined });
    expect(async_).toEqual(sync);
  });

  it("a manual leg for a pair the plan does not have is ignored: the plan is the routed plan", () => {
    const g = plane();
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-9", vertices: [centre(g, 2, 1), centre(g, 2, 10)] }] })) as PlanResultMessage;
    expect(response.legs).toHaveLength(1);
    expect(response.legs[0]!.from).toBe("wp-0");
    expect(response.legs[0]!.to).toBe("wp-1");
  });

  it("a manual leg with fewer than two vertices is ignored, not measured", () => {
    const g = plane();
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices: [centre(g, 2, 1)] }] })) as PlanResultMessage;
    expect(response.legs[0]!.status).not.toBe("NO_ROUTE");
  });

  it("a manual leg with a non-finite coordinate is ignored", () => {
    const g = plane();
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices: [centre(g, 2, 1), [Number.NaN, 5] as [number, number]] }] })) as PlanResultMessage;
    expect(response.legs[0]!.status).not.toBe("NO_ROUTE");
  });

  it("a manual leg the grid says is blocked is a NO_ROUTE leg: the plan is PARTIAL and has no totals", () => {
    const g = makeWallWithGapGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8, gap_row: 15, wall_slope_deg: 20 });
    // A polyline straight through the wall: the worker measures it and finds the slope barrier.
    const vertices = [centre(g, 3, 2), centre(g, 3, 14)];
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    expect(response.legs[0]).toMatchObject({ status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" });
    expect(response.status).toBe("PARTIAL");
    expect(response.totals).toBeNull();
  });

  it("the leg the page sends is measured by the worker: a leg that measures differently cannot enter the plan", () => {
    const g = plane();
    // The page claims nothing about the leg: the worker measures the polyline it was given.
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    const measured = validateManualLeg(g, scenario, "wp-0", "wp-1", vertices);
    expect(response.legs[0]).toEqual(measured.leg);
    expect(response.totals!.distance_m).toBe(measured.leg.status === "OK" ? measured.leg.distance_m : 0);
  });
});
