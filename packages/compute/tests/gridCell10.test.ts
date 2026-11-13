/**
 * The 10 m routing-grid option (T03.24; backend package 29, BD-150): compute reads `cell_m` from the manifest's grid record, so
 * a 10 m bundle needs no compute change. The grid is built through `loadGrid` from raw arrays, as the worker builds it, and a
 * leg across it is measured in 10 m steps.
 */
import type { MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid } from "../../../apps/web/tests/fixtures/grids";
import { cellIndex, centreOfCell, loadGrid } from "../src/grid";
import { toLeg } from "../src/leg";
import { searchLeg } from "../src/route";

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

function reloaded(cell_m: number) {
  const cells = 120 / cell_m; // the same 120 m square at either cell size
  const source = makePlaneGrid({ width: cells, height: cells, cell_m, slope_deg: 0, origin_m: [0, 0] });
  const copy = (a: ArrayBufferView): ArrayBuffer => a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;
  return loadGrid(source.meta, {
    elevation: copy(source.elevation),
    slopeP90: copy(source.slopeP90),
    slopeMax: copy(source.slopeMax),
    flags: copy(source.flags),
    commHab: copy(source.commHab),
  });
}

describe("a 10 m routing grid (T03.24)", () => {
  it("loadGrid keeps the grid's own cell size", () => {
    expect(reloaded(10).meta.cell_m).toBe(10);
  });

  it("cell addressing and centres use the 10 m cell", () => {
    const g = reloaded(10);
    expect(cellIndex(g, 15, -5)).toBe(1); // x 15 m is column 1, y -5 m is row 0
    expect(centreOfCell(g.meta, 13)).toEqual([15, -15]);
  });

  it("a routed leg is measured in 10 m steps and equals the 5 m run's distance for the same ground track", () => {
    const g10 = reloaded(10);
    const search = searchLeg(g10, { x_m: 5, y_m: -5 }, { x_m: 85, y_m: -5 }, scenario);
    expect(search.status).toBe("OK");
    if (search.status !== "OK") return;
    const leg = toLeg(g10, "a", "b", search, scenario);
    expect(leg.status === "OK" && leg.distance_m).toBe(80);
    expect(leg.status === "OK" && leg.cell_path_length).toBe(9);
    const g5 = reloaded(5);
    const search5 = searchLeg(g5, { x_m: 5, y_m: -5 }, { x_m: 85, y_m: -5 }, scenario);
    expect(search5.status).toBe("OK");
    if (search5.status !== "OK") return;
    const leg5 = toLeg(g5, "a", "b", search5, scenario);
    expect(leg5.status === "OK" && leg5.distance_m).toBe(80);
  });
});
