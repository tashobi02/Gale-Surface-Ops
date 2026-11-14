/**
 * T09.09: the leg profile carries the planning haven time (02 §D.8), so the haven band on the route results
 * shows real numbers instead of "—".
 *
 * Every expected value is derived here by calling the frozen `havenAlongRoute` over the same sample points the
 * leg uses; no result is typed in. A sample the model cannot reach is null, not a number (the same rule as
 * `Crew.haven.minutes`).
 */
import type { ComputePlanRequest, MissionScenario } from "@marswalk/protocol";
import { FLAG_BITS } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { handleWorkerMessage } from "../src/handler";
import { habTimeField, havenAlongRoute } from "../src/haven";
import { toLeg } from "../src/leg";
import { searchLeg } from "../src/route";
import { profileSamples } from "../src/sampling";
import { defaultScenario, flatGrid, HAB_XY } from "./fixtures/v2grids";

// The 5 m planning grid of the haven fixtures (02 §D.8): flat, hazard-free.
const grid = flatGrid({ cell_m: 5, cellsWest: 40, cellsEast: 40, cellsNorth: 40, cellsSouth: 40 });

const HAB_INGRESS_MIN = 5; // 02 §D.8 t_ingress, as the frozen suit ParamSet carries it.

/** The scenario of a plan that quotes the suit ParamSet's `hab_ingress_min` (02 §D.8 `t_ingress`, BD-57). */
function scenarioWithIngress(hab_ingress_min: number | undefined): MissionScenario {
  const scenario = defaultScenario();
  return hab_ingress_min === undefined ? scenario : { ...scenario, hab_ingress_min };
}

/** A two-waypoint plan on the flat grid: the hab at the origin cell, one stop 60 m east. */
function planRequest(scenario: MissionScenario, start = HAB_XY): ComputePlanRequest {
  return {
    type: "COMPUTE_PLAN",
    request_id: "req-haven",
    plan_revision: 1,
    site_id: "gale_boxwork",
    data_version: "2026.11.05",
    scenario,
    waypoints: [
      { id: "wp-0", role: "start", x_m: start.x_m, y_m: start.y_m },
      { id: "wp-1", role: "stop", x_m: 60, y_m: HAB_XY.y_m },
    ],
  };
}

/** The cell path the leg was built from, as projected metres (the same mapping `toLeg` uses). */
function cellPathPoints(cells: number[]): [number, number][] {
  const { width, cell_m, origin_m } = grid.meta;
  return cells.map((cell) => [
    origin_m[0] + ((cell % width) + 0.5) * cell_m,
    origin_m[1] - (Math.floor(cell / width) + 0.5) * cell_m,
  ]);
}

describe("the leg profile carries the planning haven time (T09.09, 02 §D.8)", () => {
  it("a routed plan's leg profile carries haven_min, one value per profile sample", () => {
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const response = handleWorkerMessage(grid, planRequest(scenario));
    expect(response.type).toBe("PLAN_RESULT");
    if (response.type !== "PLAN_RESULT") return;

    const leg = response.legs[0];
    expect(leg?.status).toBe("OK");
    if (leg?.status !== "OK") return;

    const profile = leg.profile;
    expect(profile.haven_min).toBeDefined();
    // One haven value per profile sample: the band reads them side by side with dist_m.
    expect(profile.haven_min?.length).toBe(profile.dist_m.length);
    // Every value is a number here: the hab is reachable from every point of the route.
    expect(profile.haven_min?.every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
  });

  it("the values are the ones havenAlongRoute computes, read at each sample's own position", () => {
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const response = handleWorkerMessage(grid, planRequest(scenario));
    if (response.type !== "PLAN_RESULT") throw new Error("expected a plan");
    const leg = response.legs[0];
    if (leg?.status !== "OK") throw new Error("expected an OK leg");

    // The expectation is derived from the frozen function over the leg's own sample points, not typed in.
    const search = searchLeg(grid, { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m }, { x_m: 60, y_m: HAB_XY.y_m }, scenario);
    if (search.status !== "OK") throw new Error("expected a routed leg");
    const samples = profileSamples(cellPathPoints(search.cells));

    const expected = havenAlongRoute(
      grid,
      samples.map((s) => ({ x_m: s.x_m, y_m: s.y_m })),
      habTimeField(grid, { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m }, scenario),
      null,
      scenario,
      { hab_s: HAB_INGRESS_MIN * 60, vehicle_s: 0 },
    );

    const values = leg.profile.haven_min as number[];
    expect(values.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(values[i]).toBeCloseTo(expected[i]! / 60, 6);
    }
  });

  it("the haven time grows away from the hab, and starts at the ingress alone", () => {
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const response = handleWorkerMessage(grid, planRequest(scenario));
    if (response.type !== "PLAN_RESULT") throw new Error("expected a plan");
    const leg = response.legs[0];
    if (leg?.status !== "OK") throw new Error("expected an OK leg");

    const values = leg.profile.haven_min as number[];
    // The route starts at the hab, so the first sample's haven time is the ingress alone: the walk back to
    // the hab from the hab's own cell takes no time.
    expect(values[0]).toBeCloseTo(HAB_INGRESS_MIN, 6);
    expect(values[values.length - 1]).toBeGreaterThan(values[0]!);
    // Monotone along a straight walk away from the hab.
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
  });

  it("a plan without hab_ingress_min carries no haven time at all", () => {
    const response = handleWorkerMessage(grid, planRequest(scenarioWithIngress(undefined)));
    if (response.type !== "PLAN_RESULT") throw new Error("expected a plan");
    const leg = response.legs[0];
    if (leg?.status !== "OK") throw new Error("expected an OK leg");
    expect(leg.profile.haven_min).toBeUndefined();
  });

  it("a plan whose hab is outside the grid is refused rather than given a guessed haven time", () => {
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const response = handleWorkerMessage(grid, planRequest(scenario, { x_m: 100000, y_m: 100000 }));
    // The start is outside the AOI, so the request is refused before any haven time is made up.
    expect(response).toMatchObject({ type: "ERROR", code: "INVALID_INPUT" });
  });
});

describe("the haven time is the planning form's own value (T09.09, 02 §D.8)", () => {
  it("the leg's haven time equals havenAlongRoute over the same sample points", () => {
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const search = searchLeg(grid, { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m }, { x_m: 60, y_m: HAB_XY.y_m }, scenario);
    if (search.status !== "OK") throw new Error("expected a routed leg");
    const leg = toLeg(grid, "wp-0", "wp-1", search, scenario, {
      hab: habTimeField(grid, { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m }, scenario),
      ingress_s: HAB_INGRESS_MIN * 60,
    });
    if (leg.status !== "OK") throw new Error("expected an OK leg");

    const samples = profileSamples(cellPathPoints(search.cells));
    const expected = havenAlongRoute(
      grid,
      samples.map((s) => ({ x_m: s.x_m, y_m: s.y_m })),
      habTimeField(grid, { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m }, scenario),
      null,
      scenario,
      { hab_s: HAB_INGRESS_MIN * 60, vehicle_s: 0 },
    );
    const values = leg.profile.haven_min as number[];
    expect(values.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(values[i]).toBeCloseTo(expected[i]! / 60, 6);
    }
  });

  it("a sample the model cannot reach is null, never a number", () => {
    // A hard hazard wall splits the grid: the hab is west of it, and the samples east of it have no
    // reachable haven. The model returns Infinity there, so the profile must carry null, never a number.
    const walled = flatGrid({ cell_m: 5, cellsWest: 40, cellsEast: 40, cellsNorth: 40, cellsSouth: 40 });
    const wallCol = 20; // cells east of the origin column
    for (let r = 0; r < walled.meta.height; r++) {
      walled.flags[r * walled.meta.width + wallCol]! |= 1 << FLAG_BITS.HARD_HAZARD;
    }
    const scenario = scenarioWithIngress(HAB_INGRESS_MIN);
    const hab = { x_m: -200, y_m: 0 }; // west of the wall
    const search = searchLeg(walled, hab, { x_m: 200, y_m: 0 }, scenario);
    // The wall closes the grid, so the route cannot cross it either.
    expect(search.status).toBe("NO_ROUTE");

    // The samples east of the wall have no haven: the model says Infinity and the profile says null.
    const samples = profileSamples([
      [200, 0],
      [210, 0],
    ]);
    const seconds = havenAlongRoute(
      walled,
      samples.map((s) => ({ x_m: s.x_m, y_m: s.y_m })),
      habTimeField(walled, hab, scenario),
      null,
      scenario,
      { hab_s: HAB_INGRESS_MIN * 60, vehicle_s: 0 },
    );
    expect(seconds.every((s) => !Number.isFinite(s))).toBe(true);

    // The leg maps the model's non-finite value to null: a number never claims a haven the model lacks.
    const leg = toLeg(walled, "wp-0", "wp-1", { status: "OK", cells: [walled.meta.width * 40 + 60] }, scenario, {
      hab: habTimeField(walled, hab, scenario),
      ingress_s: HAB_INGRESS_MIN * 60,
    });
    if (leg.status !== "OK") throw new Error("expected an OK leg");
    expect(leg.profile.haven_min).toEqual([null]);
  });
});
