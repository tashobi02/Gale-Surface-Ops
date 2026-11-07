/**
 * Summon, rendezvous dispatch and vehicle motion (docs/specs/02 §D.9–§D.10; FR-40).
 * Owner T23.05 (TASK-23). Pure; sim time only, never wall-clock (NFR-06).
 * Exports the motion helper TASK-29 reuses for the utility rover (T29.03).
 */
import {
  crewTimeField,
  rendezvous,
  vehiclePassable,
  vehicleTimeField,
} from "@marswalk/compute";
import type { Command, CommandResult, ParamSet, Vehicle } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

export const SHELTER_REACH_M = 1;
const PROTOCOL_VERSION = 1;

function findPressurizedRover(state: EngineState): Vehicle | undefined {
  return state.vehicles.find((v) => v.kind === "pressurized_rover");
}

function findRoverParamSet(scenario: LoadedScenario, kind: string): ParamSet | undefined {
  return Object.values(scenario.params).find((p) => p.kind === kind);
}

/** SUMMON_VEHICLE: compute the rendezvous with @marswalk/compute; log VEHICLE_DISPATCHED. */
export function handleSummon(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const vehicle = findPressurizedRover(state);
  // If not PARKED, result is BUSY, checked before any compute call (02 §D.10)
  if (!vehicle || vehicle.state !== "PARKED") {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "BUSY",
      message: "pressurized rover is busy or not available",
    };
    return { result, events: [] };
  }

  const args = command.args as { crew?: string[]; option_id?: string };
  const crewIds = args.crew ?? [];
  const optionId = typeof args.option_id === "string" ? args.option_id : undefined;

  let targetCrewId = crewIds[0];
  if (!targetCrewId && optionId) {
    const opt = state.options.find((o) => o.option_id === optionId);
    if (opt && opt.crew_ids.length > 0) {
      targetCrewId = opt.crew_ids[0];
    }
  }

  const crew = state.crew.find((c) => c.crew_id === targetCrewId) ?? state.crew[0];
  if (!crew) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: "no crew member found for summon",
    };
    return { result, events: [] };
  }

  const prParams = findRoverParamSet(scenario, "pressurized_rover");
  if (!prParams || !scenario.grid) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: !prParams ? "INVALID" : "NO_RENDEZVOUS",
      message: !prParams ? "pressurized rover parameter set not found" : "no terrain grid available for rendezvous",
    };
    return { result, events: [] };
  }

  const passable = vehiclePassable(scenario.grid, prParams);
  const crewField = crewTimeField(
    scenario.grid,
    { x_m: crew.x_m, y_m: crew.y_m },
    scenario.scenario.plan.scenario,
    Infinity,
  );
  const vehField = vehicleTimeField(
    scenario.grid,
    { x_m: vehicle.x_m, y_m: vehicle.y_m },
    prParams,
  );

  const rv = rendezvous(crewField, vehField, passable);
  if (rv.status !== "OK") {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "NO_RENDEZVOUS",
      message: "no reachable rendezvous cell found",
    };
    return { result, events: [] };
  }

  const eventData: Record<string, unknown> = {
    rendezvous: {
      x_m: rv.x_m,
      y_m: rv.y_m,
      eta_crew_s: rv.eta_crew_s,
      eta_vehicle_s: rv.eta_vehicle_s,
    },
    vehicle_id: vehicle.vehicle_id,
  };
  if (optionId !== undefined) {
    eventData.option_id = optionId;
  }

  const event: PendingEvent = {
    kind: "VEHICLE_DISPATCHED",
    actor: command.role,
    sim_time: state.session.clock.sim_time,
    data: eventData,
    provenance: { "data.rendezvous": "modelled" },
    command_ref: null,
  };

  const result: CommandResult = {
    v: PROTOCOL_VERSION,
    type: "COMMAND_RESULT",
    command_id: command.command_id,
    ok: true,
    event_seq: 0,
  };

  return { result, events: [event] };
}

/** Shared motion helper: advance `vehicle_id` along its path by `dt_s` (reused by rovers.ts). */
export function moveAlongPath(state: EngineState, vehicle_id: string, ctx: TickContext): TickResult {
  const vehicle = state.vehicles.find((v) => v.vehicle_id === vehicle_id);
  if (!vehicle || vehicle.path.length === 0) {
    return { state, events: [], deltas: [] };
  }

  const prParams = findRoverParamSet(ctx.scenario, vehicle.kind);
  const flatSpeedKmh = Number(prParams?.values?.flat_speed_kmh ?? 10);
  const speedMs = flatSpeedKmh / 3.6;
  let distToMove = speedMs * ctx.dt_s;

  const path = vehicle.path.map((p) => [...p] as [number, number]);
  let curr: [number, number] = [vehicle.x_m, vehicle.y_m];

  // If path starts at current position, drop it
  if (path.length > 0 && Math.hypot(path[0][0] - curr[0], path[0][1] - curr[1]) <= 1e-9) {
    path.shift();
  }

  while (distToMove > 0 && path.length > 0) {
    const nextPt = path[0];
    const dx = nextPt[0] - curr[0];
    const dy = nextPt[1] - curr[1];
    const segLen = Math.hypot(dx, dy);

    if (segLen <= 1e-9) {
      path.shift();
      continue;
    }

    if (distToMove >= segLen) {
      distToMove -= segLen;
      curr = nextPt;
      path.shift();
    } else {
      const frac = distToMove / segLen;
      curr = [curr[0] + dx * frac, curr[1] + dy * frac];
      distToMove = 0;
      break;
    }
  }

  const reachedEnd = path.length === 0;
  let remainingDist = 0;
  if (!reachedEnd) {
    let prevPt = curr;
    for (const pt of path) {
      remainingDist += Math.hypot(pt[0] - prevPt[0], pt[1] - prevPt[1]);
      prevPt = pt;
    }
  }

  const eta_s = reachedEnd ? 0 : remainingDist / speedMs;
  if (reachedEnd && vehicle.task?.target) {
    curr = [vehicle.task.target.x_m, vehicle.task.target.y_m];
  }

  const events: PendingEvent[] = [];
  if (reachedEnd) {
    events.push({
      kind: "VEHICLE_ARRIVED",
      actor: "system",
      sim_time: state.session.clock.sim_time,
      data: {
        vehicle_id: vehicle.vehicle_id,
        x_m: curr[0],
        y_m: curr[1],
      },
      provenance: {},
      command_ref: null,
    });
  }

  const deltas: StateChange[] = [];
  if (curr[0] !== vehicle.x_m) {
    deltas.push({ path: `vehicles/${vehicle.vehicle_id}/x_m`, value: curr[0] });
  }
  if (curr[1] !== vehicle.y_m) {
    deltas.push({ path: `vehicles/${vehicle.vehicle_id}/y_m`, value: curr[1] });
  }

  const updatedVehicles = state.vehicles.map((v) => {
    if (v.vehicle_id !== vehicle_id) return v;
    return {
      ...v,
      x_m: curr[0],
      y_m: curr[1],
      path: reachedEnd ? [] : [curr, ...path],
      eta_s,
    };
  });

  return {
    state: { ...state, vehicles: updatedVehicles },
    events,
    deltas,
  };
}

/** Move `pressurized_rover` vehicles along their paths at ParamSet speed; VEHICLE_ARRIVED, CREW_SHELTERED. Skips `utility_rover` (rovers.ts). */
export function vehiclesTick(state: EngineState, ctx: TickContext): TickResult {
  let currentState = state;
  const allEvents: PendingEvent[] = [];
  const allDeltas: StateChange[] = [];

  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "pressurized_rover") continue;

    if (vehicle.state === "DISPATCHED") {
      let path: [number, number][] = [];
      const target = vehicle.task?.target ?? { x_m: vehicle.x_m, y_m: vehicle.y_m };
      const crewIds = vehicle.task?.crew_ids ?? [];
      const crew = currentState.crew.find((c) => crewIds.includes(c.crew_id)) ?? currentState.crew[0];

      if (crew && ctx.scenario.grid) {
        const prParams = findRoverParamSet(ctx.scenario, vehicle.kind);
        if (prParams) {
          const passable = vehiclePassable(ctx.scenario.grid, prParams);
          const crewField = crewTimeField(
            ctx.scenario.grid,
            { x_m: crew.x_m, y_m: crew.y_m },
            ctx.scenario.scenario.plan.scenario,
            Infinity,
          );
          const vehField = vehicleTimeField(
            ctx.scenario.grid,
            { x_m: vehicle.x_m, y_m: vehicle.y_m },
            prParams,
          );
          const rv = rendezvous(crewField, vehField, passable);
          if (rv.status === "OK" && rv.vehicle_path && rv.vehicle_path.length > 0) {
            path = rv.vehicle_path;
          }
        }
      }

      if (path.length === 0) {
        path = [[vehicle.x_m, vehicle.y_m], [target.x_m, target.y_m]];
      }

      const updatedVehicles = currentState.vehicles.map((v) => {
        if (v.vehicle_id !== vehicle.vehicle_id) return v;
        return {
          ...v,
          state: "EN_ROUTE" as const,
          path,
        };
      });
      currentState = { ...currentState, vehicles: updatedVehicles };
    } else if (vehicle.state === "EN_ROUTE") {
      const result = moveAlongPath(currentState, vehicle.vehicle_id, ctx);
      currentState = result.state;
      allEvents.push(...result.events);
      allDeltas.push(...result.deltas);
    } else if (vehicle.state === "ARRIVED") {
      const targetCrewIds = vehicle.task?.crew_ids ?? [];
      for (const crewId of targetCrewIds) {
        const crew = currentState.crew.find((c) => c.crew_id === crewId);
        if (crew && crew.activity !== "SHELTERED") {
          const dist = Math.hypot(crew.x_m - vehicle.x_m, crew.y_m - vehicle.y_m);
          if (dist <= SHELTER_REACH_M) {
            allEvents.push({
              kind: "CREW_SHELTERED",
              actor: "system",
              sim_time: state.session.clock.sim_time,
              data: {
                crew_id: crew.crew_id,
                dose_event_ugy: crew.dose_event_ugy,
                dose_event_unsheltered_ugy: crew.dose_event_unsheltered_ugy,
                haven_kind: "vehicle",
              },
              provenance: {},
              command_ref: null,
            });
          }
        }
      }
    }
  }

  return {
    state: currentState,
    events: allEvents,
    deltas: allDeltas,
  };
}
