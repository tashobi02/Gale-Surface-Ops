/**
 * Manual-leg fallback (T05.30, N-25; docs/plan/backend/29-fallbacks.md, BD-150): `validateManualLeg` measures a hand-drawn
 * leg through the routing cells it crosses and checks it against the scenario's limits, and the worker handler answers
 * `VALIDATE_MANUAL_LEG` with `MANUAL_LEG_RESULT`. Expected values are derived from the grid fixtures and from
 * `cellsAlongPath` + `toLeg`, the same measures the router's legs use, never typed in.
 */
import type { MissionScenario, ValidateManualLegRequest, ManualLegResult } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  makeHazardWallGrid,
  makeNanIslandGrid,
  makePlaneGrid,
  makeWallWithGapGrid,
  withoutTi,
} from "../../../apps/web/tests/fixtures/grids";
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

describe("validateManualLeg (T05.30)", () => {
  it("a clear hand-drawn leg is an OK leg measured exactly as toLeg measures its cells", () => {
    const g = plane();
    const vertices = [centre(g, 2, 1), centre(g, 2, 10)];
    const result = validateManualLeg(g, scenario, "wp-0", "wp-1", vertices);
    const cells = cellsAlongPath(g, vertices);
    expect(result.leg).toEqual(toLeg(g, "wp-0", "wp-1", { status: "OK", cells }, scenario));
    expect(result.leg).toMatchObject({ status: "OK", from: "wp-0", to: "wp-1", cell_path_length: 10 });
    expect(result.leg.status === "OK" && result.leg.distance_m).toBe(9 * g.meta.cell_m);
    expect(result.warnings).toEqual([]);
  });

  it("is deterministic: the same input gives byte-identical output", () => {
    const g = plane(12);
    const vertices = [centre(g, 3, 0), centre(g, 9, 14)];
    expect(JSON.stringify(validateManualLeg(g, scenario, "a", "b", vertices))).toBe(
      JSON.stringify(validateManualLeg(g, scenario, "a", "b", vertices)),
    );
  });

  it("a slope between the caution and hard limits gives a CAUTION_SLOPE warning on leg 0 and no whole-plan warning", () => {
    const g = plane(12);
    const tight = { ...scenario, walkback_limit_km: 0.001, max_eva_duration_h: 0.5 };
    const { leg, warnings } = validateManualLeg(g, tight, "a", "b", [centre(g, 4, 1), centre(g, 4, 15)]);
    expect(leg.status).toBe("OK");
    expect(warnings.map((w) => w.code)).toEqual(["CAUTION_SLOPE"]);
    expect(warnings[0]).toMatchObject({ leg: 0, severity: "caution" });
  });

  it("a missing TI layer is TI_UNKNOWN, never silence (05 §E.6)", () => {
    const g = withoutTi(plane());
    const { warnings } = validateManualLeg(g, scenario, "a", "b", [centre(g, 1, 1), centre(g, 1, 4)]);
    expect(warnings.map((w) => w.code)).toContain("TI_UNKNOWN");
  });

  it("a leg over the hard slope limit from its first cell is NO_ROUTE START_BLOCKED, with a NO_ROUTE warning and no nearest point", () => {
    const g = plane(20);
    const { leg, warnings } = validateManualLeg(g, scenario, "a", "b", [centre(g, 2, 1), centre(g, 2, 6)]);
    expect(leg).toEqual({ from: "a", to: "b", status: "NO_ROUTE", reason: "START_BLOCKED" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "NO_ROUTE", severity: "blocked", leg: 0 });
  });

  it("a hazard cell mid-leg is DISCONNECTED_BY_HAZARD and names the last clear cell as the nearest reachable point", () => {
    const g = makeHazardWallGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8 });
    const { leg } = validateManualLeg(g, scenario, "a", "b", [centre(g, 5, 2), centre(g, 5, 14)]);
    expect(leg).toMatchObject({ status: "NO_ROUTE", reason: "DISCONNECTED_BY_HAZARD" });
    const [x, y] = centre(g, 5, 7);
    expect(leg.status === "NO_ROUTE" && leg.nearest_reachable).toEqual({ x_m: x, y_m: y });
  });

  it("a no-data cell mid-leg is DISCONNECTED_BY_NODATA", () => {
    const g = makeNanIslandGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], island_row: 4, island_col: 8, island_width: 3, island_height: 3 });
    const { leg } = validateManualLeg(g, scenario, "a", "b", [centre(g, 5, 2), centre(g, 5, 14)]);
    expect(leg).toMatchObject({ status: "NO_ROUTE", reason: "DISCONNECTED_BY_NODATA" });
  });

  it("a cell over the hard slope limit mid-leg is DISCONNECTED_BY_SLOPE", () => {
    const g = makeWallWithGapGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8, gap_row: 15, wall_slope_deg: 20 });
    const { leg } = validateManualLeg(g, scenario, "a", "b", [centre(g, 3, 2), centre(g, 3, 14)]);
    expect(leg).toMatchObject({ status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" });
  });

  it("a blocked last cell is END_BLOCKED", () => {
    const g = makeHazardWallGrid({ width: W, height: 20, cell_m: 5, origin_m: [0, 0], wall_col: 8 });
    const { leg } = validateManualLeg(g, scenario, "a", "b", [centre(g, 5, 2), centre(g, 5, 8)]);
    expect(leg).toMatchObject({ status: "NO_ROUTE", reason: "END_BLOCKED" });
  });

  it("a leg that leaves the grid is END_BLOCKED; one that starts outside is START_BLOCKED", () => {
    const g = plane();
    const inside = centre(g, 2, 2);
    const outside: [number, number] = [1000, 1000];
    expect(validateManualLeg(g, scenario, "a", "b", [inside, outside]).leg).toMatchObject({ status: "NO_ROUTE", reason: "END_BLOCKED" });
    expect(validateManualLeg(g, scenario, "a", "b", [outside, inside]).leg).toMatchObject({ status: "NO_ROUTE", reason: "START_BLOCKED" });
  });

  it("a polyline of fewer than two vertices is rejected with a RangeError", () => {
    const g = plane();
    expect(() => validateManualLeg(g, scenario, "a", "b", [centre(g, 1, 1)])).toThrow(RangeError);
    expect(() => validateManualLeg(g, scenario, "a", "b", [])).toThrow(RangeError);
  });
});

const request = (g: LoadedGrid, over: Partial<ValidateManualLegRequest> = {}): ValidateManualLegRequest => ({
  type: "VALIDATE_MANUAL_LEG",
  request_id: "req-manual",
  plan_revision: 7,
  scenario,
  from: "wp-0",
  to: "wp-1",
  vertices: [centre(g, 2, 1), centre(g, 2, 10)],
  ...over,
});

describe("handler VALIDATE_MANUAL_LEG (01-contract §7)", () => {
  it("answers MANUAL_LEG_RESULT echoing request_id and plan_revision", () => {
    const g = plane();
    const response = handleWorkerMessage(g, request(g)) as ManualLegResult;
    expect(response).toMatchObject({ type: "MANUAL_LEG_RESULT", request_id: "req-manual", plan_revision: 7 });
    expect(response.leg).toEqual(validateManualLeg(g, scenario, "wp-0", "wp-1", request(g).vertices).leg);
  });

  it("the async handler answers identically", async () => {
    const g = plane();
    const sync = handleWorkerMessage(g, request(g));
    const async_ = await handleWorkerMessageAsync(g, request(g), { yieldToLoop: async () => undefined });
    expect(async_).toEqual(sync);
  });

  it("answers GRID_NOT_LOADED without a grid", () => {
    const g = plane();
    expect(handleWorkerMessage(null, request(g))).toMatchObject({ type: "ERROR", code: "GRID_NOT_LOADED", request_id: "req-manual" });
  });

  it.each([
    ["one vertex", (g: LoadedGrid) => ({ vertices: [centre(g, 1, 1)] })],
    ["a non-finite coordinate", (g: LoadedGrid) => ({ vertices: [centre(g, 1, 1), [Number.NaN, 5] as [number, number]] })],
    ["vertices not an array", () => ({ vertices: "x" as unknown as [number, number][] })],
    ["an empty from id", () => ({ from: "" })],
    ["an empty to id", () => ({ to: "  " })],
    ["a missing scenario", () => ({ scenario: undefined as unknown as MissionScenario })],
    ["an invalid scenario limit", () => ({ scenario: { ...scenario, max_eva_duration_h: 99 } })],
    ["a non-integer plan_revision", () => ({ plan_revision: 1.5 })],
  ])("rejects %s with INVALID_INPUT", (_name, over) => {
    const g = plane();
    expect(handleWorkerMessage(g, request(g, over(g)))).toMatchObject({ type: "ERROR", code: "INVALID_INPUT", request_id: "req-manual" });
  });
});

describe("manual-leg grid boundaries (N-160)", () => {
  it("rejects a path that leaves the grid and returns to its last visited cell", () => {
    const g = plane();
    const edge = centre(g, 2, 19);
    const result = validateManualLeg(g, scenario, "a", "b", [centre(g, 2, 18), edge, [g.meta.origin_m[0] + g.meta.width * g.meta.cell_m + 5, edge[1]], edge]);
    expect(result.leg).toMatchObject({ status: "NO_ROUTE", reason: "END_BLOCKED" });
  });
});
