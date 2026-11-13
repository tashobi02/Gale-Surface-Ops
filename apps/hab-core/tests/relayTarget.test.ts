/**
 * T21.15 / T26.07 / T29.06 (FR-41, FR-42; 02 §D.9, §D.11; BD-147): `scripts/relay-target.ts` picks the cell the utility rover is
 * sent to as a relay in the reference run. The rule, on a flat synthetic grid (F9 `havenFlat`, hab at the origin, no terrain
 * shadow, so only the ranges decide): among the cells the rover can reach within the budget, on a lattice, that the hab
 * mast sees within the rover range, take the one that links the most samples of the route to the hab (compute `linkStates`
 * with the same line-of-sight test the engine uses); ties go to the earliest arrival, then to the lowest (y, x).
 * Expected values are derived here from compute (the oracle) and by brute force over the same lattice; no science number is typed.
 */
import { describe, expect, it } from "vitest";
import { lineOfSight, linkStates, timeAt, vehicleTimeField, type LinkNode } from "@marswalk/compute";
import type { ParamSet } from "@marswalk/protocol";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";
import { findRelayTarget, type RelayTargetInput } from "../scripts/relay-target";

const fx = havenFlat(10);
const mast = { x_m: 0, y_m: 0, height_m: 10 };
const link: ParamSet = {
  param_set_id: "link-synthetic",
  kind: "link",
  title: "synthetic",
  values: { range_hab_suit_m: 500, range_suit_suit_m: 100, range_rover_m: 700 },
  provenance: "assumed",
};
const rover: ParamSet = {
  param_set_id: "ur-synthetic",
  kind: "utility_rover",
  title: "synthetic",
  values: { flat_speed_kmh: 2, hard_slope_deg: 25, caution_slope_deg: 20, low_ti_cost: 1.5, min_speed_frac: 0.3, antenna_m: 3 },
  provenance: "assumed",
};
const from = { x_m: -300, y_m: 0 };
/** A route that starts inside the hab range and runs out of it, along y = 0. */
const route: [number, number][] = [200, 300, 400, 500, 600, 700, 800].map((x) => [x, 0]);
const base: RelayTargetInput = { grid: fx.grid, mast, route, rover, link, suit_antenna_m: 2, from, budget_s: 6 * 3600, stride_m: 50 };

/** The oracle: how many samples are linked to the hab with a relay at (x, y). */
function linkedSamples(x: number, y: number): number {
  const los = (a: LinkNode, b: LinkNode): boolean => lineOfSight(fx.grid, { x_m: a.x_m, y_m: a.y_m, height_m: a.antenna_m }, { x_m: b.x_m, y_m: b.y_m, height_m: b.antenna_m });
  let n = 0;
  for (const [sx, sy] of route) {
    const nodes: LinkNode[] = [
      { node_id: "HAB", kind: "hab", x_m: mast.x_m, y_m: mast.y_m, antenna_m: mast.height_m },
      { node_id: "UR1", kind: "rover", x_m: x, y_m: y, antenna_m: 3 },
      { node_id: "EV1", kind: "suit", x_m: sx, y_m: sy, antenna_m: 2 },
    ];
    if (linkStates(nodes, los, link, "2024-05-20T00:00:00Z").find((s) => s.node_id === "EV1")!.linked_to_hab) n++;
  }
  return n;
}

describe("findRelayTarget", () => {
  it("links every sample of the route, with the rover inside its range of the mast", () => {
    const t = findRelayTarget(base)!;
    expect(t).not.toBeNull();
    expect(t.total).toBe(route.length);
    expect(t.covered).toBe(route.length);
    expect(linkedSamples(t.x_m, t.y_m)).toBe(route.length);
    expect(Math.hypot(t.x_m - mast.x_m, t.y_m - mast.y_m)).toBeLessThanOrEqual(Number(link.values.range_rover_m));
  });

  it("without a relay the far samples are not linked, so the search is needed", () => {
    expect(linkedSamples(1e6, 1e6)).toBeLessThan(route.length);
  });

  it("takes the earliest arrival among the cells that link the most samples (brute force over the same lattice)", () => {
    const t = findRelayTarget(base)!;
    const field = vehicleTimeField(fx.grid, from, rover);
    expect(t.arrival_s).toBeCloseTo(timeAt(field, t.x_m, t.y_m), 6);
    const k = Math.max(1, Math.round(base.stride_m / field.cell_m)); // the lattice: every k-th row and column of the rover's field
    for (let i = 0; i < field.height; i += k) {
      for (let j = 0; j < field.width; j += k) {
        const x = field.origin_m[0] + (j + 0.5) * field.cell_m;
        const y = field.origin_m[1] - (i + 0.5) * field.cell_m;
        const s = field.seconds[i * field.width + j]!;
        if (!(s < t.arrival_s - 1e-9) || Math.hypot(x - mast.x_m, y - mast.y_m) > Number(link.values.range_rover_m)) continue;
        expect(linkedSamples(x, y), `(${x}, ${y}) arrives earlier at ${s} and would link as many`).toBeLessThan(t.covered);
      }
    }
  });

  it("is the same on every call", () => {
    expect(findRelayTarget(base)).toEqual(findRelayTarget(base));
  });

  it("returns null when no cell is reachable within the budget", () => {
    // From 2 km west of the mast, one second reaches only the start cell, which is beyond the rover range of the mast.
    expect(findRelayTarget({ ...base, from: { x_m: -2000, y_m: 0 }, budget_s: 1 })).toBeNull();
  });

  it("returns the best partial cover when no cell links the whole route, and says how many it links", () => {
    const far: [number, number][] = [...route, [1100, 0]];
    const shortRange: ParamSet = { ...link, values: { ...link.values, range_rover_m: 450 } };
    const t = findRelayTarget({ ...base, route: far, link: shortRange })!;
    expect(t.total).toBe(far.length);
    expect(t.covered).toBeLessThan(far.length);
    expect(t.covered).toBeGreaterThan(0);
  });

  it("rejects an empty route and a non-positive stride", () => {
    expect(() => findRelayTarget({ ...base, route: [] })).toThrow(/route/);
    expect(() => findRelayTarget({ ...base, stride_m: 0 })).toThrow(/stride/);
  });
});
