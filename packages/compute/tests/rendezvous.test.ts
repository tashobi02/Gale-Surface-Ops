import { describe, expect, it } from "vitest";
import {
  crewTimeField,
  pathTo,
  rendezvous,
  rendezvousPair,
  timeAt,
  vehiclePassable,
  vehicleTimeField,
  VEHICLE_GRID_CELL_M,
  type RendezvousOk,
  type TimeField,
} from "../src";
import {
  HAVEN_CELL_M,
  RIDGE_CELL_M,
  havenFlat,
  pr1Params,
  rendezvousBlockedVehicle,
  rendezvousRidge,
  ridgeScenario,
} from "./fixtures/v2grids";

// docs/specs/02 §D.10 validation (FR-40, NFR-06). TASK-05b.
//
// Every expected value is derived from the fixtures (v2grids.ts), closed forms, the inputs of the
// case, or an oracle written differently from the implementation (collect all candidates, sort by
// the 02 §D.10 key; its own 05 §E.1 cell lookup instead of `timeAt`). No result is hand-typed.
//
// Added in review (8 Nov): the 5 m crew grid over the 10 m vehicle field, the passable-mask and
// field-shape guards, the vehicle_path end point, the cyclic back-pointer case, the second-crew
// wait and the `rendezvousPair` input guards.
//
/** 05 §C RoutingGrid: the slope rasters store degrees x 4 as u8. */
const SLOPE_U8_PER_DEG = 4;
const decodeSlopeDeg = (u8: number): number => u8 / SLOPE_U8_PER_DEG;

function centreOf(field: TimeField, k: number): [number, number] {
  const row = Math.floor(k / field.width);
  const col = k % field.width;
  return [
    field.origin_m[0] + (col + 0.5) * field.cell_m + 0,
    field.origin_m[1] - (row + 0.5) * field.cell_m + 0,
  ];
}

/** Row-major index of the cell containing a point, by the 05 §E.1 formula; -1 outside. Not `timeAt`. */
function cellIndexAt(field: TimeField, x: number, y: number): number {
  const col = Math.floor((x - field.origin_m[0]) / field.cell_m);
  const row = Math.floor((field.origin_m[1] - y) / field.cell_m);
  if (row < 0 || col < 0 || row >= field.height || col >= field.width) return -1;
  return row * field.width + col;
}

function secondsAt(field: TimeField, x: number, y: number): number {
  const k = cellIndexAt(field, x, y);
  return k < 0 ? Infinity : field.seconds[k]!;
}

interface Candidate {
  q: number;
  tc: number;
  tv: number;
  key: number;
}

/**
 * Independent oracle for rendezvous (02 §D.10): every passable cell with both times finite is a
 * candidate; sort by (max(Tc, Tv), Tc, cell index) and take the first. No running minimum.
 */
function oracleRendezvous(crew: TimeField, vehicle: TimeField, passable: Uint8Array): { best: Candidate | null; all: Candidate[] } {
  const all: Candidate[] = [];
  for (let q = 0; q < crew.seconds.length; q++) {
    if (passable[q] !== 1) continue;
    const tc = crew.seconds[q]!;
    const [cx, cy] = centreOf(crew, q);
    const tv = secondsAt(vehicle, cx, cy);
    if (!Number.isFinite(tc) || !Number.isFinite(tv)) continue;
    all.push({ q, tc, tv, key: Math.max(tc, tv) });
  }
  all.sort((a, b) => a.key - b.key || a.tc - b.tc || a.q - b.q);
  return { best: all[0] ?? null, all };
}

/**
 * Independent oracle for the two-crew step. `etaCrew[i]` / `etaVeh[i]` are member i's arrival
 * times at their own meeting point; `transit[i][j]` is the vehicle time from point i to point j.
 * For each visiting order the vehicle waits for the first crew member, drives on, and the later
 * arrival is the moment vehicle and the second crew member are both at the second point.
 */
function oraclePair(
  etaCrew: [number, number],
  etaVeh: [number, number],
  transit: [[number, number], [number, number]],
): { order: [0, 1] | [1, 0]; later: number } {
  const orders: ([0, 1] | [1, 0])[] = [
    [0, 1],
    [1, 0],
  ];
  let best: { order: [0, 1] | [1, 0]; later: number } | null = null;
  for (const order of orders) {
    const [first, second] = order;
    const vehicleFreeAt = Math.max(etaVeh[first], etaCrew[first]);
    const vehicleAtSecond = vehicleFreeAt + transit[first][second];
    const later = Math.max(vehicleAtSecond, etaCrew[second]);
    if (best === null || later < best.later) best = { order, later };
  }
  return best!;
}

function makeField(opts: {
  width: number;
  height: number;
  cell_m: number;
  origin_m?: [number, number];
  seconds: number[];
  prev?: number[];
}): TimeField {
  const n = opts.width * opts.height;
  return {
    width: opts.width,
    height: opts.height,
    cell_m: opts.cell_m,
    origin_m: opts.origin_m ?? [0, 0],
    seconds: new Float64Array(opts.seconds),
    prev: new Int32Array(opts.prev ?? new Array(n).fill(-1)),
  };
}

/** A 1 x 1 vehicle field covering the meeting points of the pair cases (x 0..200 m, y -100..100 m). */
function transitField(seconds: number): TimeField {
  return makeField({ width: 1, height: 1, cell_m: 200, origin_m: [0, 100], seconds: [seconds] });
}

function ridgeCase(crewCell_m: number) {
  const fix = rendezvousRidge(crewCell_m);
  const scenario = ridgeScenario();
  const limitS = scenario.max_haven_min * 60;
  const crewField = crewTimeField(fix.grid, fix.shape.crew, scenario, limitS);
  const vehicleField = vehicleTimeField(fix.grid, fix.shape.vehicle, pr1Params);
  const passable = vehiclePassable(fix.grid, pr1Params);
  const oracle = oracleRendezvous(crewField, vehicleField, passable);
  const res = rendezvous(crewField, vehicleField, passable);
  return { fix, crewField, vehicleField, passable, oracle, res };
}

describe("rendezvous", () => {
  // 10 m: the vehicle lattice equals the crew grid. 5 m (the real routing grid, 02 §D.2): the
  // 10 m vehicle field is sampled at the 5 m crew cell centres (02 §D.10 "sample to 5 m").
  it.each([RIDGE_CELL_M, HAVEN_CELL_M])(
    "crew on a ridge the vehicle cannot climb → rendezvous at the ridge foot (%s m crew grid)",
    (crewCell_m) => {
      // 02 §D.10 validation: crew on plateau (0, 0), vehicle west on flat ground. The flank is
      // above the vehicle hard limit (pr1Params) and below the crew limit (ridgeScenario).
      const { fix, crewField, vehicleField, oracle, res } = ridgeCase(crewCell_m);
      const foot = fix.shape.footCell;

      expect(crewField.cell_m).toBe(crewCell_m);
      expect(vehicleField.cell_m).toBe(VEHICLE_GRID_CELL_M);

      // Fixture precondition (v2grids.ts header): the vehicle reaches the foot before the crew.
      const tcFoot = timeAt(crewField, foot.x_m, foot.y_m);
      const tvFoot = secondsAt(vehicleField, foot.x_m, foot.y_m);
      expect(tvFoot).toBeLessThan(tcFoot);

      expect(oracle.best).not.toBeNull();
      expect(res.status).toBe("OK");
      if (res.status !== "OK" || oracle.best === null) return;

      const [ox, oy] = centreOf(crewField, oracle.best.q);
      expect(ox).toBe(fix.shape.westFootX_m);
      expect(res.x_m).toBe(fix.shape.westFootX_m);
      expect(res.y_m).toBe(oy);
      expect(res.eta_crew_s).toBe(oracle.best.tc);
      expect(res.eta_vehicle_s).toBe(oracle.best.tv);

      // The chosen cell is in the foot column and is time-equivalent to the declared foot cell
      // (its crew time ties with the foot cell, so the optimum is the foot, not a point on the flank).
      expect(res.eta_crew_s).toBe(tcFoot);

      // Of all cells with the winning key and crew time, the winner has the lowest index
      // (02 §D.10 tie-break). Several rows tie on this fixture, so the foot row y = 0 is not
      // necessarily the one chosen: TODO(decision) in TASK-05b, T05b.07 notes.
      const ties = oracle.all.filter((c) => c.key === oracle.best!.key && c.tc === oracle.best!.tc);
      expect(ties.length).toBeGreaterThan(0);
      expect(Math.min(...ties.map((c) => c.q))).toBe(oracle.best.q);
      expect(ties.map((c) => c.q)).toContain(cellIndexAt(crewField, foot.x_m, foot.y_m));

      // crew_path runs from the crew start to q*
      expect(res.crew_path.length).toBeGreaterThan(0);
      expect(res.crew_path[0]).toEqual(centreOf(crewField, cellIndexAt(crewField, fix.shape.crew.x_m, fix.shape.crew.y_m)));
      expect(res.crew_path[res.crew_path.length - 1]).toEqual([res.x_m, res.y_m]);
    },
  );

  it.each([RIDGE_CELL_M, HAVEN_CELL_M])(
    "vehicle_path starts in the vehicle's cell and ends exactly at q* (%s m crew grid)",
    (crewCell_m) => {
      const { fix, vehicleField, res } = ridgeCase(crewCell_m);
      expect(res.status).toBe("OK");
      if (res.status !== "OK") return;

      // First vertex: the centre of the vehicle-field cell holding the vehicle (a 10 m lattice
      // centre, up to half a cell from the vehicle position itself).
      const first = res.vehicle_path[0]!;
      const startCell = cellIndexAt(vehicleField, fix.shape.vehicle.x_m, fix.shape.vehicle.y_m);
      expect(first).toEqual(centreOf(vehicleField, startCell));
      expect(Math.abs(first[0] - fix.shape.vehicle.x_m)).toBeLessThanOrEqual(vehicleField.cell_m / 2);
      expect(Math.abs(first[1] - fix.shape.vehicle.y_m)).toBeLessThanOrEqual(vehicleField.cell_m / 2);

      // Last vertex: q* itself (T23.05 needs the path to end within 1 m of the target).
      const last = res.vehicle_path[res.vehicle_path.length - 1]!;
      expect(last).toEqual([res.x_m, res.y_m]);

      // Every other vertex is a vehicle-lattice cell centre, from the back-pointer walk.
      const walk = pathTo(vehicleField, res.x_m, res.y_m).slice().reverse();
      const lattice = res.vehicle_path.slice(0, walk.length);
      expect(lattice).toEqual(walk);
      // The exact point is appended only when it is not already the last lattice centre.
      const lastIsLatticeCentre = walk[walk.length - 1]![0] === res.x_m && walk[walk.length - 1]![1] === res.y_m;
      expect(res.vehicle_path.length).toBe(lastIsLatticeCentre ? walk.length : walk.length + 1);
    },
  );

  it("5 m crew grid over the 10 m vehicle field: times are read from the vehicle cell containing the crew cell centre", () => {
    const { fix, crewField, vehicleField, passable, oracle, res } = ridgeCase(HAVEN_CELL_M);
    // Preconditions: the two lattices differ, and the crew grid is the one the mask is indexed on.
    expect(crewField.cell_m).toBe(HAVEN_CELL_M);
    expect(vehicleField.cell_m).toBe(2 * HAVEN_CELL_M);
    expect(passable.length).toBe(crewField.seconds.length);
    expect(vehicleField.seconds.length).not.toBe(crewField.seconds.length);

    expect(res.status).toBe("OK");
    if (res.status !== "OK" || oracle.best === null) return;

    // The crew-cell centre lies on a 5 m centre, which is not a 10 m centre: the vehicle time must
    // be that of the parent 10 m cell, not the value at the same linear index.
    const parent = cellIndexAt(vehicleField, res.x_m, res.y_m);
    expect(parent).toBeGreaterThanOrEqual(0);
    expect(centreOf(vehicleField, parent)).not.toEqual([res.x_m, res.y_m]);
    expect(res.eta_vehicle_s).toBe(vehicleField.seconds[parent]);
    expect(res.eta_vehicle_s).toBe(oracle.best.tv);
    expect(res.x_m).toBe(fix.shape.westFootX_m);
  });

  it("vehicle fully blocked → NO_RENDEZVOUS", () => {
    // 02 §D.10 validation: vehicle surrounded by a closed HARD_HAZARD ring.
    const fix = rendezvousBlockedVehicle();
    const scenario = ridgeScenario();
    const limitS = scenario.max_haven_min * 60;

    const crewField = crewTimeField(fix.grid, fix.shape.crew, scenario, limitS);
    const vehicleField = vehicleTimeField(fix.grid, fix.shape.vehicle, pr1Params);
    const passable = vehiclePassable(fix.grid, pr1Params);

    const oracle = oracleRendezvous(crewField, vehicleField, passable);
    expect(oracle.best).toBeNull();

    const res = rendezvous(crewField, vehicleField, passable);
    expect(res.status).toBe("NO_RENDEZVOUS");
  });

  it("tie-break: min crew time then cell index is deterministic", () => {
    // Part A: tie on max(Tc, Tv) broken by the smaller Tc.
    // Cell 0: Tc = KEY, Tv < KEY. Cell 1: Tc < KEY, Tv = KEY. Both have key KEY; cell 1 has the
    // smaller Tc although cell 0 has the smaller index, so cell 1 must win.
    const KEY = 120;
    const crewA = makeField({ width: 2, height: 1, cell_m: 5, seconds: [KEY, KEY - 30] });
    const vehA = makeField({ width: 2, height: 1, cell_m: 5, seconds: [KEY - 20, KEY] });
    const resA = rendezvous(crewA, vehA, Uint8Array.of(1, 1));
    expect(resA.status).toBe("OK");
    if (resA.status === "OK") {
      expect(resA.eta_crew_s).toBe(crewA.seconds[1]);
      expect([resA.x_m, resA.y_m]).toEqual(centreOf(crewA, 1));
    }

    // Part B: tie on both max(Tc, Tv) and Tc, broken by cell index: cell 0 must win.
    const T = 100;
    const crewB = makeField({ width: 2, height: 1, cell_m: 5, seconds: [T, T] });
    const vehB = makeField({ width: 2, height: 1, cell_m: 5, seconds: [T, T] });
    const resB = rendezvous(crewB, vehB, Uint8Array.of(1, 1));
    expect(resB.status).toBe("OK");
    if (resB.status === "OK") {
      expect(resB.eta_crew_s).toBe(crewB.seconds[0]);
      expect([resB.x_m, resB.y_m]).toEqual(centreOf(crewB, 0));
    }
  });

  it.each([RIDGE_CELL_M, HAVEN_CELL_M])(
    "vehicle path never exceeds the vehicle hard slope limit when re-sampled (%s m crew grid)",
    (crewCell_m) => {
      const { fix, res } = ridgeCase(crewCell_m);
      expect(res.status).toBe("OK");
      if (res.status !== "OK") return;

      const maxSlopeDeg = pr1Params.values.hard_slope_deg as number;
      const { width, height, cell_m, origin_m } = fix.grid.meta;
      let sampled = 0;
      for (const [x, y] of res.vehicle_path) {
        const col = Math.floor((x - origin_m[0]) / cell_m);
        const row = Math.floor((origin_m[1] - y) / cell_m);
        if (row >= 0 && row < height && col >= 0 && col < width) {
          expect(decodeSlopeDeg(fix.grid.slopeP90[row * width + col]!)).toBeLessThanOrEqual(maxSlopeDeg);
          sampled++;
        }
      }
      // Not vacuous: every vertex lies on the grid.
      expect(sampled).toBe(res.vehicle_path.length);
    },
  );

  it("cells with passable !== 1 are not candidates even if crew and vehicle times are finite", () => {
    // Cell 0 has the lower max(Tc, Tv) but is impassable for the vehicle, so cell 1 must be selected.
    const crew = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });
    const veh = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });

    const res = rendezvous(crew, veh, Uint8Array.of(0, 1));
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.eta_crew_s).toBe(crew.seconds[1]);
      expect([res.x_m, res.y_m]).toEqual(centreOf(crew, 1));
    }

    // All impassable -> NO_RENDEZVOUS
    expect(rendezvous(crew, veh, Uint8Array.of(0, 0)).status).toBe("NO_RENDEZVOUS");
  });

  it("same lattice for crew and vehicle: no duplicate vertex is appended at q*", () => {
    // Same lattice: q* is already a vehicle-cell centre, so nothing is appended (no duplicate vertex).
    const crew = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });
    const veh = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });
    const res = rendezvous(crew, veh, Uint8Array.of(1, 1));
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.vehicle_path).toEqual([[res.x_m, res.y_m]]);
    expect(res.crew_path).toEqual([[res.x_m, res.y_m]]);
  });

  it("a cyclic back-pointer chain gives an empty path while status stays OK (Proposed, documented)", () => {
    // pathTo returns [] for a corrupt (cyclic) field; `rendezvous` passes that through rather
    // than inventing a path. TODO(decision) in TASK-05b, T05b.07 notes.
    const crew = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 20], prev: [1, 0] });
    const veh = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 20] });
    const res = rendezvous(crew, veh, Uint8Array.of(1, 1));
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.crew_path).toEqual([]);
    expect(Number.isFinite(res.eta_crew_s)).toBe(true);
  });

  it("throws RangeError when passable array length does not match crew field cells", () => {
    const crew = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    const veh = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    const badPass = Uint8Array.of(1, 1); // 2 cells instead of 4
    expect(() => rendezvous(crew, veh, badPass)).toThrow(RangeError);
  });

  it("throws RangeError when a field's seconds length is not width x height", () => {
    const good = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    // 3 values for a 2 x 2 field; a mask of 3 would pass a length-only check against `seconds`.
    const shortCrew = { ...good, seconds: new Float64Array([10, 20, 30]) };
    expect(() => rendezvous(shortCrew, good, Uint8Array.of(1, 1, 1))).toThrow(RangeError);
    expect(() => rendezvous(shortCrew, good, Uint8Array.of(1, 1, 1, 1))).toThrow(RangeError);
    const shortVehicle = { ...good, seconds: new Float64Array([10, 20, 30]) };
    expect(() => rendezvous(good, shortVehicle, Uint8Array.of(1, 1, 1, 1))).toThrow(RangeError);
  });

  it("throws RangeError when a field's prev length is not width x height", () => {
    const good = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    // seconds and the mask are consistent; only prev is short.
    const shortPrev = { ...good, prev: new Int32Array([-1, 0, 1]) };
    expect(() => rendezvous(shortPrev, good, Uint8Array.of(1, 1, 1, 1))).toThrow(RangeError);
    expect(() => rendezvous(good, shortPrev, Uint8Array.of(1, 1, 1, 1))).toThrow(RangeError);
  });

  it("throws RangeError when a field's width or height is not a positive integer", () => {
    // 1.5 x 2 = 3 cells, so seconds, prev and a 3-cell mask all agree with the product: only the
    // integer check can reject it; so does -1 x -3 = 3 cells, which only the > 0 check rejects.
    const good = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    const three = makeField({ width: 3, height: 1, cell_m: 5, seconds: [10, 20, 30] });
    for (const bad of [{ width: 1.5, height: 2 }, { width: 2, height: 1.5 }, { width: 0, height: 3 }, { width: -1, height: -3 }]) {
      const odd = { ...three, ...bad };
      expect(() => rendezvous(odd, good, new Uint8Array(3).fill(1))).toThrow(RangeError);
      expect(() => rendezvous(good, odd, Uint8Array.of(1, 1, 1, 1))).toThrow(RangeError);
    }
  });

  it("throws RangeError when a field's cell size is not a positive finite number", () => {
    const good = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 20] });
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(() => rendezvous({ ...good, cell_m: bad }, good, Uint8Array.of(1, 1))).toThrow(RangeError);
      expect(() => rendezvous(good, { ...good, cell_m: bad }, Uint8Array.of(1, 1))).toThrow(RangeError);
    }
  });
});

describe("rendezvousPair", () => {
  // Member A meets the vehicle at (0, 0), member B at (100, 0); both inside the 1 x 1 transit fields.
  function member(x_m: number, eta_crew_s: number, eta_vehicle_s: number): RendezvousOk {
    return { status: "OK", x_m, y_m: 0, eta_crew_s, eta_vehicle_s, crew_path: [[x_m, 0]], vehicle_path: [[x_m, 0]] };
  }
  const A_X = 0;
  const B_X = 100;

  /** Run the implementation and the oracle on one case (transit A->B, B->A) and compare. */
  function check(a: RendezvousOk, b: RendezvousOk, transitAB: number, transitBA: number) {
    const res = rendezvousPair(a, b, transitField(transitAB), transitField(transitBA));
    const want = oraclePair(
      [a.eta_crew_s, b.eta_crew_s],
      [a.eta_vehicle_s, b.eta_vehicle_s],
      [
        [0, transitAB],
        [transitBA, 0],
      ],
    );
    expect(res.order).toEqual(want.order);
    expect(res.later_arrival_s).toBe(want.later);
    return res;
  }

  it("chooses the visiting order that minimises the later arrival", () => {
    const a = member(A_X, 300, 200);
    const b = member(B_X, 350, 500);

    // Transit A->B short, B->A long: visiting A first wins.
    const r1 = check(a, b, 100, 400);
    expect(r1.order).toEqual([0, 1]);

    // Transit A->B long, B->A short: visiting B first wins.
    const r2 = check(a, b, 500, 50);
    expect(r2.order).toEqual([1, 0]);
  });

  it("exact tie on later_arrival_s → order [0, 1]", () => {
    // Proposed tie rule (see rendezvous.ts). Choose transit B->A so both orders cost the same:
    // order [0,1] = max(max(a.etaVeh, a.etaCrew) + tAB, b.etaCrew); order [1,0] likewise.
    const a = member(A_X, 300, 200);
    const b = member(B_X, 350, 500);
    const tAB = 200;
    const first01 = Math.max(a.eta_vehicle_s, a.eta_crew_s) + tAB; // vehicle at B in order [0, 1]
    const later01 = Math.max(first01, b.eta_crew_s);
    const first10 = Math.max(b.eta_vehicle_s, b.eta_crew_s);
    const tBA = later01 - first10; // makes the vehicle reach A exactly at later01
    const res = check(a, b, tAB, tBA);
    expect(res.order).toEqual([0, 1]);
    expect(res.later_arrival_s).toBe(later01);
  });

  it("the second crew member's own arrival bounds the later arrival (they may arrive after the vehicle)", () => {
    // B's crew arrive long after the vehicle could reach B in order [0, 1].
    const a = member(A_X, 300, 200);
    const b = member(B_X, 2000, 500);
    const r = check(a, b, 100, 50);
    // Whatever the order, the later arrival cannot precede the second-visited member's crew time.
    const secondCrewEta = r.order[1] === 1 ? b.eta_crew_s : a.eta_crew_s;
    expect(r.later_arrival_s).toBeGreaterThanOrEqual(secondCrewEta);
    expect(r.order).toEqual([0, 1]);
    expect(r.later_arrival_s).toBe(b.eta_crew_s);

    // Mirror: A's crew arrive late, so visiting B first and A second is bounded by A's crew time.
    const a2 = member(A_X, 2000, 200);
    const b2 = member(B_X, 350, 500);
    const r2 = check(a2, b2, 400, 100);
    expect(r2.order).toEqual([1, 0]);
    expect(r2.later_arrival_s).toBe(a2.eta_crew_s);
  });

  it("only one order reachable → that order, finite result", () => {
    const a = member(A_X, 300, 200);
    const b = member(B_X, 350, 500);
    // The vehicle cannot drive from A's point to B's point, but can from B's to A's.
    const res = rendezvousPair(a, b, transitField(Infinity), transitField(60));
    expect(res.order).toEqual([1, 0]);
    expect(Number.isFinite(res.later_arrival_s)).toBe(true);
    const want = oraclePair([a.eta_crew_s, b.eta_crew_s], [a.eta_vehicle_s, b.eta_vehicle_s], [[0, Infinity], [60, 0]]);
    expect(res.later_arrival_s).toBe(want.later);
    // Result is JSON-safe.
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });

  it("both orders unreachable → RangeError, not an Infinity result", () => {
    const a = member(A_X, 300, 200);
    const b = member(B_X, 350, 500);
    expect(() => rendezvousPair(a, b, transitField(Infinity), transitField(Infinity))).toThrow(RangeError);
    // A meeting point outside the vehicle field is unreachable from it (timeAt gives Infinity).
    const outside = member(1e6, 350, 500);
    expect(() => rendezvousPair(a, outside, transitField(100), transitField(100))).not.toThrow(); // B -> A still works
    expect(() => rendezvousPair(a, outside, transitField(100), transitField(Infinity))).toThrow(RangeError);
  });

  it("non-finite input times → RangeError (no silent order flip, no NaN output)", () => {
    const a = member(A_X, 300, 200);
    const b = member(B_X, 350, 500);
    const t = transitField(100);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => rendezvousPair(member(A_X, bad, 200), b, t, t)).toThrow(RangeError);
      expect(() => rendezvousPair(member(A_X, 300, bad), b, t, t)).toThrow(RangeError);
      expect(() => rendezvousPair(a, member(B_X, bad, 500), t, t)).toThrow(RangeError);
      expect(() => rendezvousPair(a, member(B_X, 350, bad), t, t)).toThrow(RangeError);
    }
    // A NaN transit time is rejected too.
    expect(() => rendezvousPair(a, b, transitField(NaN), t)).toThrow(RangeError);
    expect(() => rendezvousPair(a, b, t, transitField(NaN))).toThrow(RangeError);
  });

  it("on real vehicle fields: transit times come from the fields and match distance / speed on flat ground", () => {
    const fix = havenFlat();
    // The vehicle drives between the two meeting points; flat ground, so both transits are alike.
    const pointA = fix.shape.hab;
    const pointB = fix.shape.crew;
    const vFromA = vehicleTimeField(fix.grid, pointA, pr1Params);
    const vFromB = vehicleTimeField(fix.grid, pointB, pr1Params);
    const a = member(pointA.x_m, 100, 50);
    const b = member(pointB.x_m, 600, 400);

    const tAB = timeAt(vFromA, pointB.x_m, pointB.y_m);
    const tBA = timeAt(vFromB, pointA.x_m, pointA.y_m);
    const speed_ms = (pr1Params.values.flat_speed_kmh as number) / 3.6;
    const ideal = fix.shape.crewToHab_m / speed_ms;
    expect(Math.abs(tAB - ideal)).toBeLessThanOrEqual(VEHICLE_GRID_CELL_M / speed_ms);
    expect(Math.abs(tBA - ideal)).toBeLessThanOrEqual(VEHICLE_GRID_CELL_M / speed_ms);

    const res = rendezvousPair(a, b, vFromA, vFromB);
    const want = oraclePair(
      [a.eta_crew_s, b.eta_crew_s],
      [a.eta_vehicle_s, b.eta_vehicle_s],
      [
        [0, tAB],
        [tBA, 0],
      ],
    );
    expect(res.order).toEqual(want.order);
    expect(res.later_arrival_s).toBe(want.later);
  });
});
