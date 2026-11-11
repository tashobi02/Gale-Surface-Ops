/**
 * Along-track slicing of a leg's polyline (05 Warning `from_m`/`to_m`; 02 §C.1 projected metres only) and the extent
 * the click-to-zoom of a located warning fits (T09.04).
 */
import { describe, expect, it } from "vitest";
import type { Leg, OkLeg } from "@marswalk/protocol";
import { legStretchExtent, sliceAlongTrack } from "../../../src/ui/map/routeGeometry";

describe("sliceAlongTrack", () => {
  const line: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
  ];

  it("cuts inside one segment at the interpolated ends", () => {
    expect(sliceAlongTrack(line, 25, 75)).toEqual([
      [25, 0],
      [75, 0],
    ]);
  });

  it("keeps the vertices between the ends and cuts across a corner", () => {
    expect(sliceAlongTrack(line, 50, 150)).toEqual([
      [50, 0],
      [100, 0],
      [100, 50],
    ]);
  });

  it("does not repeat a point when from_m falls exactly on a vertex", () => {
    expect(sliceAlongTrack(line, 100, 150)).toEqual([
      [100, 0],
      [100, 50],
    ]);
  });

  it("does not repeat a point when from_m is 0 or to_m is the full length", () => {
    expect(sliceAlongTrack(line, 0, 200)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it("clamps the ends to the polyline and returns [] for an empty or reversed range", () => {
    expect(sliceAlongTrack(line, -50, 40)).toEqual([
      [0, 0],
      [40, 0],
    ]);
    expect(sliceAlongTrack(line, 150, 900)).toEqual([
      [100, 50],
      [100, 100],
    ]);
    expect(sliceAlongTrack(line, 60, 60)).toEqual([]);
    expect(sliceAlongTrack(line, 80, 20)).toEqual([]);
    expect(sliceAlongTrack([[0, 0]], 0, 10)).toEqual([]);
  });

  it("skips zero-length segments", () => {
    expect(
      sliceAlongTrack(
        [
          [0, 0],
          [0, 0],
          [10, 0],
        ],
        2,
        8,
      ),
    ).toEqual([
      [2, 0],
      [8, 0],
    ]);
  });
});

const okLeg = (geometry: [number, number][]): OkLeg => ({
  from: "wp-0",
  to: "wp-1",
  status: "OK",
  distance_m: 100,
  walk_time_min: 1,
  climb_m: 0,
  descent_m: 0,
  max_slope_deg: 0,
  geometry,
  cell_path_length: 1,
  profile: { dist_m: [], elev_m: [], slope_class: [] },
});

describe("legStretchExtent", () => {
  const legs: Leg[] = [
    okLeg([
      [0, 0],
      [100, 0],
      [100, 100],
    ]),
    { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" },
  ];

  it("is the bounding box [minX, minY, maxX, maxY] of the stretch in projected metres", () => {
    expect(legStretchExtent(legs, 0, 50, 150)).toEqual([50, 0, 100, 50]);
  });

  it("is null for a missing leg, a NO_ROUTE leg, an empty geometry or a degenerate stretch", () => {
    expect(legStretchExtent(legs, 5, 0, 10)).toBeNull();
    expect(legStretchExtent(legs, 1, 0, 10)).toBeNull();
    expect(legStretchExtent([okLeg([])], 0, 0, 10)).toBeNull();
    expect(legStretchExtent(legs, 0, 40, 40)).toBeNull();
  });
});
