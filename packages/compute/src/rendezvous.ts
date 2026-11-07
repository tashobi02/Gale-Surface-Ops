/**
 * Crew–vehicle rendezvous (docs/specs/02 §D.10; FR-40). TASK-05b.
 * q* = argmin over cells reachable by both of max(T_crew(q), T_vehicle(q));
 * tie-break: min T_crew, then cell index (NFR-06).
 * Signatures frozen by T05b.01 (contract C15). Positions are working-projection metres.
 */
import { pathTo, timeAt } from "./haven";
import type { TimeField } from "./haven";

export type RendezvousResult =
  | {
      status: "OK";
      x_m: number;
      y_m: number;
      eta_crew_s: number;
      eta_vehicle_s: number;
      /** From the crew start to q* (`rendezvous` reverses the `pathTo` output, which runs from q* back to the start). */
      crew_path: [number, number][];
      /** From the vehicle start to q* (reversed `pathTo` output, as `crew_path`). */
      vehicle_path: [number, number][];
    }
  | { status: "NO_RENDEZVOUS" };

/** A rendezvous that exists; only these can be ordered by `rendezvousPair`. */
export type RendezvousOk = Extract<RendezvousResult, { status: "OK" }>;

/** The chosen visiting order for two crew and the later arrival (see `rendezvousPair`). */
export interface RendezvousPair {
  order: [0, 1] | [1, 0];
  later_arrival_s: number;
}

function centreOfCell(field: TimeField, k: number): [number, number] {
  const row = Math.floor(k / field.width);
  const col = k - row * field.width;
  // "+ 0" turns a negative zero into 0.
  return [
    field.origin_m[0] + (col + 0.5) * field.cell_m + 0,
    field.origin_m[1] - (row + 0.5) * field.cell_m + 0,
  ];
}

/**
 * Single crew member. `passable` is the `vehiclePassable` mask (haven.ts), indexed on the crew
 * field's 5 m grid; the vehicle field (10 m) is sampled to 5 m inside the function (02 §D.10).
 * The result's paths run from each start to q*. TASK-05b.
 */
export function rendezvous(crew: TimeField, vehicle: TimeField, passable: Uint8Array): RendezvousResult {
  const n = crew.seconds.length;
  if (passable.length !== n) {
    throw new RangeError(`rendezvous: passable mask length ${passable.length} does not match crew field cell count ${n}`);
  }

  let bestKey = Infinity;
  let bestTc = Infinity;
  let bestQ = -1;

  for (let q = 0; q < n; q++) {
    if (passable[q] !== 1) continue;
    const tc = crew.seconds[q]!;
    // key >= tc, so a cell with tc >= bestKey cannot win (a tie on key needs a smaller tc than bestTc <= bestKey).
    if (!(tc < bestKey)) continue;
    const [cx, cy] = centreOfCell(crew, q);
    const tv = timeAt(vehicle, cx, cy);
    if (!(tv < Infinity)) continue;
    const key = tc > tv ? tc : tv;
    if (key < bestKey || (key === bestKey && tc < bestTc)) {
      bestKey = key;
      bestTc = tc;
      bestQ = q;
    }
  }

  if (bestQ < 0) {
    return { status: "NO_RENDEZVOUS" };
  }

  const [qx, qy] = centreOfCell(crew, bestQ);
  const etaCrew = crew.seconds[bestQ]!;
  const etaVehicle = timeAt(vehicle, qx, qy);
  const crewPath = pathTo(crew, qx, qy).slice().reverse();
  const vehiclePath = pathTo(vehicle, qx, qy).slice().reverse();

  return {
    status: "OK",
    x_m: qx,
    y_m: qy,
    eta_crew_s: etaCrew,
    eta_vehicle_s: etaVehicle,
    crew_path: crewPath,
    vehicle_path: vehiclePath,
  };
}

/**
 * Two crew: choose the vehicle visiting order (2 permutations) that minimises the later arrival
 * (02 §D.10). `vehicleFromA` is the vehicle's field from A's rendezvous point and `vehicleFromB`
 * from B's, so both orders can be costed.
 *
 * Proposed definitions (02 §D.10 is silent; NFR-06 needs them fixed):
 * - `later_arrival_s` is the time at which the vehicle is at the second-visited crew member's
 *   meeting point and that crew member is there too. It is measured from now (the alert) and
 *   excludes ingress.
 * - Tie rule: when both orders give the same `later_arrival_s`, the order is [0, 1].
 * TASK-05b.
 */
export function rendezvousPair(
  a: RendezvousOk,
  b: RendezvousOk,
  vehicleFromA: TimeField,
  vehicleFromB: TimeField,
): RendezvousPair {
  // Permutation [0, 1]: visit member A first, then member B
  const tFirst0 = Math.max(a.eta_vehicle_s, a.eta_crew_s);
  const tTransitAB = timeAt(vehicleFromA, b.x_m, b.y_m);
  const tVehAtB = tFirst0 + tTransitAB;
  const later01 = Math.max(tVehAtB, b.eta_crew_s);

  // Permutation [1, 0]: visit member B first, then member A
  const tFirst1 = Math.max(b.eta_vehicle_s, b.eta_crew_s);
  const tTransitBA = timeAt(vehicleFromB, a.x_m, a.y_m);
  const tVehAtA = tFirst1 + tTransitBA;
  const later10 = Math.max(tVehAtA, a.eta_crew_s);

  // Tie rule: [0, 1] wins when equal
  if (later01 <= later10) {
    return { order: [0, 1], later_arrival_s: later01 };
  }
  return { order: [1, 0], later_arrival_s: later10 };
}
