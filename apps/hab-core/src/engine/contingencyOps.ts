/**
 * Contingency options, APPROVE_OPTION and ABORT (docs/specs/02 §D.15; FR-44).
 * Owner T23.07 (TASK-23). Pure; sim time only, never wall-clock (NFR-06).
 * Approval and abort log PLAN_REVISED; tasks.ts (T31.04) reacts to it for dropped stops.
 * PLAN_REVISED carries the revised `waypoints` (the plan's minus `stops_dropped`) and `legs` (the new
 * leg built from the option's route), which replace the plan's in the reducer (decided 2026-11-07).
 */
import {
  crewTimeField,
  habTimeField,
  proposeOptions,
  rendezvous,
  vehiclePassable,
  vehicleTimeField,
  type ContingencyInputs,
  type LoadedGrid,
  type RendezvousResult,
} from "@marswalk/compute";
import type {
  Command,
  CommandResult,
  ContingencyOption,
  CrewId,
  Leg,
  OkLeg,
  Waypoint,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const PROTOCOL_VERSION = 1;

function buildPlanRevision(
  state: EngineState,
  scenario: LoadedScenario,
  option: ContingencyOption,
): { waypoints: Waypoint[]; legs: Leg[] } {
  const currentPlan = state.plan ?? scenario.scenario.plan;
  const stopWaypoints = currentPlan.waypoints.filter((w: Waypoint) => w.role === "stop");
  const stopNoMap = new Map<string, number>();
  stopWaypoints.forEach((w: Waypoint, idx: number) => stopNoMap.set(w.id, idx + 1));

  const revisedWaypoints = currentPlan.waypoints.filter(
    (w: Waypoint) => w.role !== "stop" || !option.stops_dropped.includes(stopNoMap.get(w.id)!),
  );

  const keptLegs: Leg[] = [];
  const startWpId = revisedWaypoints[0]?.id;
  const lastKeptWpId = revisedWaypoints[revisedWaypoints.length - 1]?.id;

  for (let i = 0; i < revisedWaypoints.length - 1; i++) {
    const fromId = revisedWaypoints[i].id;
    const toId = revisedWaypoints[i + 1].id;
    const existingLeg = currentPlan.result.legs.find((l: Leg) => l.from === fromId && l.to === toId);
    if (existingLeg) {
      keptLegs.push(existingLeg);
    }
  }

  const returnLeg: OkLeg = {
    from: lastKeptWpId,
    to: startWpId,
    status: "OK",
    distance_m: 0,
    walk_time_min: option.eta_shelter_min,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry: option.path_preview,
    cell_path_length: option.path_preview.length,
    profile: { dist_m: [0, 0], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  };

  return {
    waypoints: revisedWaypoints,
    legs: [...keptLegs, returnLeg],
  };
}

/** On a new warning, build options with @marswalk/compute and log OPTIONS_PROPOSED. */
export function contingencyTick(state: EngineState, ctx: TickContext): TickResult {
  const allEvents: PendingEvent[] = [];

  for (const alert of state.alerts) {
    if (alert.level !== "warning") continue;
    if (alert.cleared_seq !== null) continue;

    // Do not propose again if alert's options already stand
    if (state.options.some((o) => o.alert_id === alert.alert_id)) continue;

    // Do not propose again after an option was executed and crew are heading to a haven
    const subjectCrew = state.crew.filter((c) => alert.subjects.includes(c.crew_id));
    if (subjectCrew.some((c) => c.activity === "TO_HAVEN")) continue;

    // Filter to active crew still on EVA (WALKING or AT_STOP)
    const activeCrew = subjectCrew.filter((c) => c.activity === "WALKING" || c.activity === "AT_STOP");
    if (activeCrew.length === 0) continue;

    const grid = ctx.scenario.grid;
    const prParams = Object.values(ctx.scenario.params).find((p) => p.kind === "pressurized_rover");
    const shielding = Object.values(ctx.scenario.params).find((p) => p.kind === "shielding") ?? {
      param_set_id: "shielding",
      kind: "shielding",
      title: "Shielding",
      values: {},
      provenance: "assumed",
      source_ids: [],
    };
    const ingress = {
      hab_s: prParams?.values?.ingress_hab_s ? Number(prParams.values.ingress_hab_s) : 300,
      vehicle_s: prParams?.values?.ingress_vehicle_s ? Number(prParams.values.ingress_vehicle_s) : 300,
    };

    const currentPlan = state.plan ?? ctx.scenario.scenario.plan;
    const habPos = { x_m: currentPlan.waypoints[0]?.x_m ?? 0, y_m: currentPlan.waypoints[0]?.y_m ?? 0 };
    const habField = habTimeField(grid as LoadedGrid, habPos, currentPlan.scenario);
    const rendezvousMap = {} as Record<CrewId, RendezvousResult>;
    if (prParams && grid) {
      const passable = vehiclePassable(grid, prParams);
      const prVehicle = state.vehicles.find((v) => v.kind === "pressurized_rover");
      const vehPos = prVehicle ? { x_m: prVehicle.x_m, y_m: prVehicle.y_m } : { x_m: 0, y_m: 0 };
      const vehField = vehicleTimeField(grid, vehPos, prParams);
      for (const c of activeCrew) {
        const cField = crewTimeField(grid, { x_m: c.x_m, y_m: c.y_m }, currentPlan.scenario, Infinity);
        rendezvousMap[c.crew_id] = rendezvous(cField, vehField, passable);
      }
    } else {
      for (const c of activeCrew) {
        rendezvousMap[c.crew_id] = { status: "NO_RENDEZVOUS" };
      }
    }

    const inputs: ContingencyInputs = {
      alert_id: alert.alert_id,
      crew: activeCrew,
      now_utc: state.session.clock.sim_time,
      hab: habField,
      rendezvous: rendezvousMap,
      ingress,
      plan: { waypoints: currentPlan.waypoints, legs: currentPlan.result.legs },
      scenario: currentPlan.scenario,
      series: ctx.scenario.dose,
      shielding,
    };

    const options = proposeOptions(inputs);
    allEvents.push({
      kind: "OPTIONS_PROPOSED",
      actor: "system",
      sim_time: state.session.clock.sim_time,
      data: {
        alert_id: alert.alert_id,
        options,
      },
      provenance: {},
      command_ref: null,
    });
  }

  return {
    state,
    events: allEvents,
    deltas: [],
  };
}

/** APPROVE_OPTION: revise the plan; log PLAN_REVISED. */
export function handleApproveOption(
  state: EngineState,
  scenario: LoadedScenario,
  command: Command,
): CommandOutcome {
  const args = command.args as { option_id?: string };
  if (!args || typeof args.option_id !== "string" || !args.option_id) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: "APPROVE_OPTION requires option_id",
    };
    return { result, events: [] };
  }

  const option = state.options.find((o) => o.option_id === args.option_id);
  if (!option) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: `option ${args.option_id} not found or stale`,
    };
    return { result, events: [] };
  }

  const alert = state.alerts.find((a) => a.alert_id === option.alert_id);
  if (!alert || alert.cleared_seq !== null) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: `alert ${option.alert_id} is cleared or stale`,
    };
    return { result, events: [] };
  }

  const events: PendingEvent[] = [];

  if (option.kind === "VEHICLE_RENDEZVOUS") {
    const pr = state.vehicles.find((v) => v.kind === "pressurized_rover") ?? state.vehicles[0];
    events.push({
      kind: "VEHICLE_DISPATCHED",
      actor: command.role,
      sim_time: state.session.clock.sim_time,
      data: {
        vehicle_id: pr.vehicle_id,
        option_id: option.option_id,
        rendezvous: option.rendezvous,
      },
      provenance: {},
      command_ref: null,
    });
  }

  const revision = buildPlanRevision(state, scenario, option);
  events.push({
    kind: "PLAN_REVISED",
    actor: command.role,
    sim_time: state.session.clock.sim_time,
    data: {
      plan_revision: state.session.plan_revision + 1,
      option_id: option.option_id,
      stops_dropped: option.stops_dropped,
      waypoints: revision.waypoints,
      legs: revision.legs,
    },
    provenance: {},
    command_ref: null,
  });

  const result: CommandResult = {
    v: PROTOCOL_VERSION,
    type: "COMMAND_RESULT",
    command_id: command.command_id,
    ok: true,
    event_seq: 0,
  };

  return { result, events };
}

/** ABORT: abort to hab; log PLAN_REVISED. */
export function handleAbort(
  state: EngineState,
  scenario: LoadedScenario,
  command: Command,
): CommandOutcome {
  const args = command.args as { crew?: string[] };
  if (!args || !Array.isArray(args.crew) || args.crew.length === 0) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: "ABORT requires args.crew list",
    };
    return { result, events: [] };
  }

  for (const cId of args.crew) {
    if (!state.crew.some((c) => c.crew_id === cId)) {
      const result: CommandResult = {
        v: PROTOCOL_VERSION,
        type: "COMMAND_RESULT",
        command_id: command.command_id,
        ok: false,
        code: "INVALID",
        message: `unknown crew id ${cId}`,
      };
      return { result, events: [] };
    }
  }

  if (command.role.startsWith("eva:")) {
    const selfId = command.role === "eva:EV1" ? "EV1" : "EV2";
    if (!args.crew.includes(selfId)) {
      const result: CommandResult = {
        v: PROTOCOL_VERSION,
        type: "COMMAND_RESULT",
        command_id: command.command_id,
        ok: false,
        code: "FORBIDDEN_ROLE",
        message: `${command.role} may only abort for itself`,
      };
      return { result, events: [] };
    }
  }

  const abortOpt = state.options.find(
    (o) => o.kind === "ABORT_TO_HAB" && o.crew_ids.some((id) => args.crew!.includes(id)),
  );
  if (!abortOpt) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: "no active ABORT_TO_HAB option for crew",
    };
    return { result, events: [] };
  }

  const alert = state.alerts.find((a) => a.alert_id === abortOpt.alert_id);
  if (!alert || alert.cleared_seq !== null) {
    const result: CommandResult = {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code: "INVALID",
      message: "alert is cleared or stale",
    };
    return { result, events: [] };
  }

  const revision = buildPlanRevision(state, scenario, abortOpt);
  const event: PendingEvent = {
    kind: "PLAN_REVISED",
    actor: command.role,
    sim_time: state.session.clock.sim_time,
    data: {
      plan_revision: state.session.plan_revision + 1,
      option_id: abortOpt.option_id,
      stops_dropped: abortOpt.stops_dropped,
      waypoints: revision.waypoints,
      legs: revision.legs,
    },
    provenance: {},
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
