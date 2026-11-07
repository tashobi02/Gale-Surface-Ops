import { describe, expect, it } from "vitest";
import {
  crewTimeField,
  pathTo,
  rendezvous,
  rendezvousPair,
  timeAt,
  vehiclePassable,
  vehicleTimeField,
  type RendezvousOk,
  type TimeField,
} from "../src";
import {
  pr1Params,
  rendezvousBlockedVehicle,
  rendezvousRidge,
  ridgeScenario,
} from "./fixtures/v2grids";

// docs/specs/02 §D.10 validation (FR-40, NFR-06). TASK-05b.
//
// Every expected value is derived from the fixtures (v2grids.ts), closed forms,
// or a brute-force oracle. No result is hand-typed.
//
// When PENDING_RED is not set, the suites are skipped while compute stubs throw
// "TODO(TASK-05b): not implemented", keeping make test-web green during TDD red phase.
const PENDING =
  !process.env.PENDING_RED &&
  ([
    () => rendezvous(undefined as never, undefined as never, undefined as never),
    () => rendezvousPair(undefined as never, undefined as never, undefined as never, undefined as never),
  ] as (() => unknown)[]).some((probe) => {
    try {
      probe();
      return false;
    } catch (err) {
      return /TODO\(TASK-05b\): not implemented/.test(String(err));
    }
  });

function centreOf(field: TimeField, k: number): [number, number] {
  const row = Math.floor(k / field.width);
  const col = k % field.width;
  return [
    field.origin_m[0] + (col + 0.5) * field.cell_m + 0,
    field.origin_m[1] - (row + 0.5) * field.cell_m + 0,
  ];
}

/**
 * Independent brute-force oracle for rendezvous (02 §D.10).
 * Scans all cells in the crew field, filters by passable === 1 and finite times,
 * and finds argmin over candidates of max(T_crew, T_veh), tie-broken by min T_crew,
 * then cell index.
 */
function oracleRendezvous(
  crew: TimeField,
  vehicle: TimeField,
  passable: Uint8Array,
): {
  status: "OK" | "NO_RENDEZVOUS";
  q: number;
  x_m: number;
  y_m: number;
  tc: number;
  tv: number;
} {
  let bestKey = Infinity;
  let bestTc = Infinity;
  let bestQ = -1;
  const n = crew.seconds.length;
  for (let q = 0; q < n; q++) {
    if (passable[q] !== 1) continue;
    const tc = crew.seconds[q]!;
    if (!(tc < Infinity)) continue;
    const [cx, cy] = centreOf(crew, q);
    const tv = timeAt(vehicle, cx, cy);
    if (!(tv < Infinity)) continue;
    const key = Math.max(tc, tv);
    if (key < bestKey || (key === bestKey && tc < bestTc)) {
      bestKey = key;
      bestTc = tc;
      bestQ = q;
    }
  }
  if (bestQ < 0) {
    return { status: "NO_RENDEZVOUS", q: -1, x_m: NaN, y_m: NaN, tc: Infinity, tv: Infinity };
  }
  const [x_m, y_m] = centreOf(crew, bestQ);
  return {
    status: "OK",
    q: bestQ,
    x_m,
    y_m,
    tc: crew.seconds[bestQ]!,
    tv: timeAt(vehicle, x_m, y_m),
  };
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

describe.skipIf(PENDING)("rendezvous", () => {
  it("crew on a ridge the vehicle cannot climb → rendezvous at the ridge foot", () => {
    // 02 §D.10 validation: crew on plateau (0, 0), vehicle at (-400, 0) west on flat ground.
    // Flank is 25 deg; vehicle hard limit is 20 deg (pr1Params); crew limit is 35 deg (ridgeScenario).
    const fix = rendezvousRidge();
    const scenario = ridgeScenario();
    const limitS = scenario.max_haven_min * 60;

    const crewField = crewTimeField(fix.grid, fix.shape.crew, scenario, limitS);
    const vehicleField = vehicleTimeField(fix.grid, fix.shape.vehicle, pr1Params);
    const passable = vehiclePassable(fix.grid, pr1Params);

    const oracle = oracleRendezvous(crewField, vehicleField, passable);
    expect(oracle.status).toBe("OK");
    expect(oracle.x_m).toBe(fix.shape.westFootX_m);

    const res = rendezvous(crewField, vehicleField, passable);
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;

    expect(res.x_m).toBe(oracle.x_m);
    expect(res.y_m).toBe(oracle.y_m);
    expect(res.eta_crew_s).toBe(oracle.tc);
    expect(res.eta_vehicle_s).toBe(oracle.tv);

    // crew_path runs from crew start to q*
    expect(res.crew_path.length).toBeGreaterThan(0);
    const crewStart = res.crew_path[0]!;
    expect(crewStart[0]).toBeCloseTo(fix.shape.crew.x_m, 1);
    expect(crewStart[1]).toBeCloseTo(fix.shape.crew.y_m, 1);
    const crewEnd = res.crew_path[res.crew_path.length - 1]!;
    expect(crewEnd[0]).toBeCloseTo(res.x_m, 1);
    expect(crewEnd[1]).toBeCloseTo(res.y_m, 1);

    // vehicle_path runs from vehicle start to q*
    expect(res.vehicle_path.length).toBeGreaterThan(0);
    const vehStart = res.vehicle_path[0]!;
    expect(vehStart[0]).toBeCloseTo(fix.shape.vehicle.x_m, 1);
    expect(vehStart[1]).toBeCloseTo(fix.shape.vehicle.y_m, 1);
    const vehEnd = res.vehicle_path[res.vehicle_path.length - 1]!;
    // Vehicle field is 10 m aggregate: the vehicle destination cell contains q*
    expect(Math.abs(vehEnd[0] - res.x_m)).toBeLessThanOrEqual(vehicleField.cell_m);
    expect(Math.abs(vehEnd[1] - res.y_m)).toBeLessThanOrEqual(vehicleField.cell_m);
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
    expect(oracle.status).toBe("NO_RENDEZVOUS");

    const res = rendezvous(crewField, vehicleField, passable);
    expect(res.status).toBe("NO_RENDEZVOUS");
  });

  it("tie-break: min crew time then cell index is deterministic", () => {
    // Part A: Tie on max(Tc, Tv) broken by smaller Tc.
    // 2x1 grid: cell 0 has (Tc=120, Tv=100) -> max=120
    //           cell 1 has (Tc=90, Tv=120)  -> max=120
    // Even though cell 0 has smaller index, cell 1 has min Tc (90 < 120), so cell 1 must win.
    const crewA = makeField({ width: 2, height: 1, cell_m: 5, seconds: [120, 90] });
    const vehA = makeField({ width: 2, height: 1, cell_m: 5, seconds: [100, 120] });
    const passA = Uint8Array.of(1, 1);

    const resA = rendezvous(crewA, vehA, passA);
    expect(resA.status).toBe("OK");
    if (resA.status === "OK") {
      expect(resA.eta_crew_s).toBe(90);
      expect(resA.x_m).toBe(7.5); // cell 1 centre: 0 + (1 + 0.5) * 5
    }

    // Part B: Tie on both max(Tc, Tv) AND Tc broken by cell index.
    // 2x1 grid: cell 0 has (Tc=100, Tv=100) -> max=100, Tc=100
    //           cell 1 has (Tc=100, Tv=100) -> max=100, Tc=100
    // Both equal: cell 0 must win by cell index.
    const crewB = makeField({ width: 2, height: 1, cell_m: 5, seconds: [100, 100] });
    const vehB = makeField({ width: 2, height: 1, cell_m: 5, seconds: [100, 100] });
    const passB = Uint8Array.of(1, 1);

    const resB = rendezvous(crewB, vehB, passB);
    expect(resB.status).toBe("OK");
    if (resB.status === "OK") {
      expect(resB.eta_crew_s).toBe(100);
      expect(resB.x_m).toBe(2.5); // cell 0 centre: 0 + (0 + 0.5) * 5
    }
  });

  it("vehicle path never exceeds the vehicle hard slope limit when re-sampled", () => {
    const fix = rendezvousRidge();
    const scenario = ridgeScenario();
    const limitS = scenario.max_haven_min * 60;

    const crewField = crewTimeField(fix.grid, fix.shape.crew, scenario, limitS);
    const vehicleField = vehicleTimeField(fix.grid, fix.shape.vehicle, pr1Params);
    const passable = vehiclePassable(fix.grid, pr1Params);

    const res = rendezvous(crewField, vehicleField, passable);
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;

    const maxSlopeDeg = pr1Params.values.hard_slope_deg as number;
    // For each point along vehicle_path, sample slopeP90 on the grid and verify it <= maxSlopeDeg
    const { width, height, cell_m, origin_m } = fix.grid.meta;
    for (const [x, y] of res.vehicle_path) {
      const col = Math.floor((x - origin_m[0]) / cell_m);
      const row = Math.floor((origin_m[1] - y) / cell_m);
      if (row >= 0 && row < height && col >= 0 && col < width) {
        const slopeDeg = fix.grid.slopeP90[row * width + col]! / 4;
        expect(slopeDeg).toBeLessThanOrEqual(maxSlopeDeg);
      }
    }
  });

  it("cells with passable !== 1 are not candidates even if crew and vehicle times are finite", () => {
    // 2x1 grid: cell 0 has (Tc=10, Tv=10), but passable[0] = 0
    //           cell 1 has (Tc=50, Tv=50), and passable[1] = 1
    // Cell 0 has lower max(Tc, Tv), but is impassable for vehicle, so cell 1 must be selected.
    const crew = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });
    const veh = makeField({ width: 2, height: 1, cell_m: 5, seconds: [10, 50] });
    const pass = Uint8Array.of(0, 1);

    const res = rendezvous(crew, veh, pass);
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.eta_crew_s).toBe(50);
      expect(res.x_m).toBe(7.5); // cell 1 centre
    }

    // All impassable -> NO_RENDEZVOUS
    const resNone = rendezvous(crew, veh, Uint8Array.of(0, 0));
    expect(resNone.status).toBe("NO_RENDEZVOUS");
  });

  it("throws RangeError when passable array length does not match crew field cells", () => {
    const crew = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    const veh = makeField({ width: 2, height: 2, cell_m: 5, seconds: [10, 20, 30, 40] });
    const badPass = Uint8Array.of(1, 1); // 2 cells instead of 4
    expect(() => rendezvous(crew, veh, badPass)).toThrow(RangeError);
  });
});

describe.skipIf(PENDING)("rendezvousPair", () => {
  it("chooses the visiting order that minimises the later arrival", () => {
    // Member A ok rendezvous: meeting point (0, 0), arrival times
    const a: RendezvousOk = {
      status: "OK",
      x_m: 0,
      y_m: 0,
      eta_crew_s: 300,
      eta_vehicle_s: 200,
      crew_path: [[0, 0]],
      vehicle_path: [[0, 0]],
    };
    // Member B ok rendezvous: meeting point (100, 0)
    const b: RendezvousOk = {
      status: "OK",
      x_m: 100,
      y_m: 0,
      eta_crew_s: 350,
      eta_vehicle_s: 500,
      crew_path: [[100, 0]],
      vehicle_path: [[100, 0]],
    };

    // Case 1: transit A->B takes 100 s; transit B->A takes 400 s.
    // Order [0, 1] (visit A then B):
    //   At A: max(200, 300) = 300 s.
    //   Vehicle reaches B at 300 + 100 = 400 s.
    //   Crew B is at B at 350 s. Later arrival = max(400, 350) = 400 s.
    // Order [1, 0] (visit B then A):
    //   At B: max(500, 350) = 500 s.
    //   Vehicle reaches A at 500 + 400 = 900 s.
    //   Crew A is at A at 300 s. Later arrival = max(900, 300) = 900 s.
    // Expect order [0, 1] with later_arrival_s = 400.
    const vehFromA1 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [100],
    });
    const vehFromB1 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [400],
    });

    const res1 = rendezvousPair(a, b, vehFromA1, vehFromB1);
    expect(res1.order).toEqual([0, 1]);
    expect(res1.later_arrival_s).toBe(400);

    // Case 2: reverse transit costs to make [1, 0] win.
    // Transit A->B takes 500 s; transit B->A takes 50 s.
    // Order [0, 1]: At A: 300; reaches B at 300 + 500 = 800; max(800, 350) = 800 s.
    // Order [1, 0]: At B: 500; reaches A at 500 + 50 = 550; max(550, 300) = 550 s.
    // Expect order [1, 0] with later_arrival_s = 550.
    const vehFromA2 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [500],
    });
    const vehFromB2 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [50],
    });

    const res2 = rendezvousPair(a, b, vehFromA2, vehFromB2);
    expect(res2.order).toEqual([1, 0]);
    expect(res2.later_arrival_s).toBe(550);

    // Case 3: exact tie on later_arrival_s.
    // Order [0, 1] gives 500 s; Order [1, 0] gives 500 s.
    // Frozen spec tie rule: when later_arrival_s is equal, order is [0, 1].
    const vehFromA3 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [200], // At A: 300 + 200 = 500 s; max(500, 350) = 500 s
    });
    const vehFromB3 = makeField({
      width: 1,
      height: 1,
      cell_m: 200,
      origin_m: [0, 100],
      seconds: [0], // At B: 500 + 0 = 500 s; max(500, 300) = 500 s
    });

    const res3 = rendezvousPair(a, b, vehFromA3, vehFromB3);
    expect(res3.order).toEqual([0, 1]);
    expect(res3.later_arrival_s).toBe(500);
  });
});
