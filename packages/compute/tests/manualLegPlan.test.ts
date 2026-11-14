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
    // The unknown pair does not suppress the plan's own search: the plan reads its legs by the pairs it has, so a leg
    // for a pair it does not have is never looked at and never changes what the plan carries.
    let routingCalls = 0;
    const timer = <T,>(phase: "routing" | "estimates", fn: () => T): T => {
      if (phase === "routing") routingCalls++;
      return fn();
    };
    const response = handleWorkerMessage(
      g,
      baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-9", vertices: [centre(g, 2, 1), centre(g, 2, 10)] }] }),
      undefined,
      { timer },
    ) as PlanResultMessage;
    expect(routingCalls, "the plan's own pair is still searched").toBe(1);
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

  it("a manual leg for the loop's return pair is measured: the loop's last leg joins the plan too", () => {
    // A loop plan has an extra pair, from the last waypoint back to the first. A leg for that pair is a real pair of the
    // plan, so it is measured like any other.
    const g = plane();
    const loopScenario: MissionScenario = { ...scenario, loop: true };
    const vertices = [centre(g, 2, 10), centre(g, 2, 1)];
    const request = baseRequest(g, {
      scenario: loopScenario,
      manual_legs: [{ from: "wp-1", to: "wp-0", vertices }],
    });
    const response = handleWorkerMessage(g, request) as PlanResultMessage;
    expect(response.legs).toHaveLength(2);
    const measured = validateManualLeg(g, loopScenario, "wp-1", "wp-0", vertices);
    expect(response.legs[1]).toEqual(measured.leg);
    expect(response.totals).not.toBeNull();
  });

  it("the search for a replaced pair is skipped, not run and discarded", () => {
    // The replaced pair is not searched at all: the routing phase runs once for the plan's one pair with a manual leg
    // and not at all for one without. A search that was run and then discarded would leave the same plan but cost the
    // work, so the phase counter is what tells the two apart.
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const routingCalls = (over: Partial<ComputePlanRequest>): number => {
      let calls = 0;
      const timer = <T,>(phase: "routing" | "estimates", fn: () => T): T => {
        if (phase === "routing") calls++;
        return fn();
      };
      handleWorkerMessage(g, baseRequest(g, over), undefined, { timer });
      return calls;
    };
    // A routed plan searches its pair once.
    expect(routingCalls({}), "the routed plan searches its pair").toBe(1);
    // A plan whose pair is manual does not search it: the leg is measured from the polyline instead.
    expect(
      routingCalls({ manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] }),
      "the replaced pair is not searched",
    ).toBe(0);
  });

  it("the plan carries the drawn leg, not the router's: the two are measurably different", () => {
    // A wall with a single gap at row 15. The two waypoints are on row 2, so the straight line between them crosses the
    // wall; the router finds its way round through the gap and its leg is a detour. The drawn polyline runs along row 15
    // through the gap, so the plan must carry it.
    const g = makeWallWithGapGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8, gap_row: 15, wall_slope_deg: 20 });
    const throughGap = [centre(g, 15, 2), centre(g, 15, 8), centre(g, 15, 14)];
    const routed = handleWorkerMessage(g, baseRequest(g)) as PlanResultMessage;
    const withManual = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices: throughGap }] })) as PlanResultMessage;
    expect(routed.legs[0]!.status).toBe("OK");
    const routedLeg = routed.legs[0] as Extract<typeof routed.legs[number], { status: "OK" }>;
    const manualLeg = withManual.legs[0] as Extract<typeof withManual.legs[number], { status: "OK" }>;
    // The plan carries the drawn leg, not the router's.
    expect(manualLeg.geometry).not.toEqual(routedLeg.geometry);
    const measured = validateManualLeg(g, scenario, "wp-0", "wp-1", throughGap);
    expect(withManual.legs[0]).toEqual(measured.leg);
    expect(withManual.totals!.distance_m).toBe(manualLeg.distance_m);
    expect(withManual.totals!.distance_m).not.toBe(routed.totals!.distance_m);
  });

  it("a manual leg for a reversed pair is ignored: the plan has no such pair", () => {
    const g = plane();
    const vertices = [centre(g, 2, 10), centre(g, 2, 1)];
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-1", to: "wp-0", vertices }] })) as PlanResultMessage;
    expect(response.legs).toHaveLength(1);
    expect(response.legs[0]!.from).toBe("wp-0");
    expect(response.legs[0]!.to).toBe("wp-1");
  });

  it("a manual leg with duplicate vertices is measured: the worker measures the polyline it was given", () => {
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 1), centre(g, 2, 10)];
    const response = handleWorkerMessage(g, baseRequest(g, { manual_legs: [{ from: "wp-0", to: "wp-1", vertices }] })) as PlanResultMessage;
    const measured = validateManualLeg(g, scenario, "wp-0", "wp-1", vertices);
    expect(response.legs[0]).toEqual(measured.leg);
  });
});
