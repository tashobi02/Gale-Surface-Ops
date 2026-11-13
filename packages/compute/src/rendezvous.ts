/**
 * Crew–vehicle rendezvous (docs/specs/02 §D.10; FR-40). TASK-05b.
 * q* = argmin over cells reachable by both of max(T_crew(q), T_vehicle(q));
 * tie-break: min T_crew, then cell index (NFR-06).
 * Signatures frozen by T05b.01 (contract C15). Positions are working-projection metres.
 */
import { centreOfCell } from "./grid";
import { pathTo, timeAt } from "./haven";
import type { TimeField } from "./haven";

export type RendezvousResult =
  | {
      status: "OK";
      x_m: number;
      y_m: number;
      eta_crew_s: number;
      eta_vehicle_s: number;
      /**
       * From the crew start to q*: cell centres of the 5 m crew field (the `pathTo` walk, reversed so it
       * runs start to q*). Its last vertex is q* itself. Empty if the back-pointer chain is cyclic (a
       * corrupt field; `status` stays "OK", Proposed 2026-11-08).
       */
      crew_path: [number, number][];
      /**
       * From the vehicle start to q*: cell centres of the 10 m vehicle field (the reversed `pathTo` walk),
       * so the first vertex is the centre of the vehicle's 10 m cell, up to half a cell from the vehicle
       * position. The exact point (x_m, y_m) is appended as the last vertex unless it already is the last
       * centre (Proposed 2026-11-08), so the path ends at q* itself. Empty if the chain is cyclic.
       */
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

function checkField(who: string, f: TimeField): void {
  if (!(Number.isFinite(f.cell_m) && f.cell_m > 0)) {
    throw new RangeError(`rendezvous: ${who} field cell_m must be a finite number > 0, got ${f.cell_m}`);
  }
  if (!(Number.isInteger(f.width) && Number.isInteger(f.height) && f.width > 0 && f.height > 0)) {
    throw new RangeError(`rendezvous: ${who} field width and height must be integers > 0, got ${f.width} x ${f.height}`);
  }
  const cells = f.width * f.height;
  if (f.seconds.length !== cells || f.prev.length !== cells) {
    throw new RangeError(
      `rendezvous: ${who} field has ${f.seconds.length} seconds and ${f.prev.length} prev for ${f.width} x ${f.height} = ${cells} cells`,
    );
  }
}

/**
 * Single crew member. `passable` is the `vehiclePassable` mask (haven.ts), indexed on the crew
 * field's 5 m grid; the vehicle field (10 m) is sampled to 5 m inside the function (02 §D.10).
 * The result's paths run from each start to q* (see the field docs on `RendezvousResult`).
 * Throws RangeError if a field is internally inconsistent (cell size, or array lengths against
 * width x height) or the mask length differs from the crew cell count; a mask is a bare array, so its
 * length is all that can be checked against the crew frame. TASK-05b.
 */
export function rendezvous(crew: TimeField, vehicle: TimeField, passable: Uint8Array): RendezvousResult {
  checkField("crew", crew);
  checkField("vehicle", vehicle);
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
  // `pathTo` returns a fresh array, so reversing in place is safe.
  const crewPath = pathTo(crew, qx, qy).reverse();
  const vehiclePath = pathTo(vehicle, qx, qy).reverse();
  // The vehicle walk ends at the centre of the 10 m parent cell, up to ~3.5 m from q* on a 5 m crew grid:
  // finish at q* itself (T23.05 needs the path to end at the target).
  const lastV = vehiclePath[vehiclePath.length - 1];
  if (lastV !== undefined && (lastV[0] !== qx || lastV[1] !== qy)) vehiclePath.push([qx, qy]);

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
 * - Throws RangeError if any of the four arrival times is not finite, if a transit time is NaN, or if
 *   the vehicle cannot drive between the two points in either direction (both transits Infinity): the
 *   caller falls back to separate rendezvous. If only one direction is unreachable, the other order wins.
 *   The result is always JSON-safe (finite `later_arrival_s`).
 * TASK-05b.
 */
export function rendezvousPair(
  a: RendezvousOk,
  b: RendezvousOk,
  vehicleFromA: TimeField,
  vehicleFromB: TimeField,
): RendezvousPair {
  for (const [who, v] of [
    ["a.eta_crew_s", a.eta_crew_s],
    ["a.eta_vehicle_s", a.eta_vehicle_s],
    ["b.eta_crew_s", b.eta_crew_s],
    ["b.eta_vehicle_s", b.eta_vehicle_s],
  ] as const) {
    if (!Number.isFinite(v)) throw new RangeError(`rendezvousPair: ${who} must be finite, got ${v}`);
  }

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

  // A NaN transit (a corrupt field) would fail every comparison and silently flip the order.
  if (Number.isNaN(later01) || Number.isNaN(later10)) {
    throw new RangeError("rendezvousPair: a vehicle transit time is NaN");
  }
  if (later01 === Infinity && later10 === Infinity) {
    throw new RangeError("rendezvousPair: the vehicle cannot reach either meeting point from the other");
  }

  // Tie rule: [0, 1] wins when equal
  if (later01 <= later10) {
    return { order: [0, 1], later_arrival_s: later01 };
  }
  return { order: [1, 0], later_arrival_s: later10 };
}
