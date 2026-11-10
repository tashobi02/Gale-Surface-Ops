/**
 * Haven per tick and HAVEN_TIME_EXCEEDED (docs/specs/02 §D.8 live form; FR-39, NFR-02, NFR-06).
 * Owner T23.03 (TASK-23, Anjim Hossain). Pure; sim time only, never wall-clock (NFR-06).
 * Haven minutes, kind and target per crew member, labelled `modelled`.
 */
import {
  HAB_INGRESS_S,
  crewTimeField,
  habTimeField,
  liveHaven,
  vehiclePassable,
  vehicleTimeField,
  type LoadedGrid,
  type TimeField,
} from "@marswalk/compute";
import type {
  Alert,
  Crew,
  CrewId,
  LogEventData,
  MissionScenario,
  ParamSet,
  PlanExport,
  Waypoint,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { isWaiting, type EngineState, type PendingEvent, type StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

interface HabCacheEntry {
  start_x: number;
  start_y: number;
  hard_slope: number;
  caution_slope: number;
  flat_speed: number;
  habField: TimeField;
}

const habCache = new WeakMap<LoadedGrid, HabCacheEntry>();

interface RoverCacheEntry {
  rover_x: number;
  rover_y: number;
  param_set_id: string;
  passable: Uint8Array;
  vehicleField: TimeField;
}

const roverCache = new WeakMap<LoadedGrid, RoverCacheEntry>();

const currentPlan = (state: EngineState, scenario: LoadedScenario): PlanExport =>
  state.plan ?? scenario.scenario.plan;

const startOf = (plan: PlanExport): Waypoint | undefined =>
  plan.waypoints.find((w) => w.role === "start");

const waiting = (
  state: EngineState,
  ctx: TickContext,
  c: Crew,
): boolean =>
  isWaiting(
    c,
    state.motion[c.crew_id],
    ctx.scenario.scenario.crew.find((x) => x.crew_id === c.crew_id)?.start_offset_s ?? 0,
  );

function getCachedHabField(
  grid: LoadedGrid,
  start: Waypoint,
  planScenario: MissionScenario,
): TimeField | null {
  const cached = habCache.get(grid);
  if (
    cached &&
    cached.start_x === start.x_m &&
    cached.start_y === start.y_m &&
    cached.hard_slope === planScenario.hard_slope_limit_deg &&
    cached.caution_slope === planScenario.caution_slope_deg &&
    cached.flat_speed === planScenario.suited_flat_speed_kmh
  ) {
    return cached.habField;
  }
  try {
    const habField = habTimeField(grid, { x_m: start.x_m, y_m: start.y_m }, planScenario);
    habCache.set(grid, {
      start_x: start.x_m,
      start_y: start.y_m,
      hard_slope: planScenario.hard_slope_limit_deg,
      caution_slope: planScenario.caution_slope_deg,
      flat_speed: planScenario.suited_flat_speed_kmh,
      habField,
    });
    return habField;
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

function getRoverFields(
  grid: LoadedGrid,
  state: EngineState,
  scenario: LoadedScenario,
  planScenario: MissionScenario,
): { vehicleField: TimeField; passable: Uint8Array; vehicle_s: number } | null {
  if (!planScenario.vehicle_available) return null;
  const rover = state.vehicles.find((v) => v.kind === "pressurized_rover");
  if (!rover || rover.state !== "PARKED") return null;

  const params: ParamSet | undefined = scenario.params[rover.param_set];
  const ingressMin = params?.values.ingress_min;
  if (
    !params ||
    params.kind !== rover.kind ||
    typeof ingressMin !== "number" ||
    !(Number.isFinite(ingressMin) && ingressMin >= 0)
  ) {
    return null;
  }

  const cached = roverCache.get(grid);
  if (
    cached &&
    cached.rover_x === rover.x_m &&
    cached.rover_y === rover.y_m &&
    cached.param_set_id === rover.param_set
  ) {
    return {
      vehicleField: cached.vehicleField,
      passable: cached.passable,
      vehicle_s: ingressMin * 60,
    };
  }

  try {
    const passable = vehiclePassable(grid, params);
    const vehicleField = vehicleTimeField(grid, { x_m: rover.x_m, y_m: rover.y_m }, params);
    roverCache.set(grid, {
      rover_x: rover.x_m,
      rover_y: rover.y_m,
      param_set_id: rover.param_set,
      passable,
      vehicleField,
    });
    return {
      vehicleField,
      passable,
      vehicle_s: ingressMin * 60,
    };
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

function raiseHavenAlert(
  state: EngineState,
  seq: number,
  crew_id: CrewId,
  haven: Crew["haven"],
): PendingEvent {
  const message =
    haven.kind === "vehicle"
      ? "Head to rover now — haven time exceeded"
      : "Head to hab now — haven time exceeded";

  const data: LogEventData["ALERT_RAISED"] = {
    alert_id: `a-${seq}`,
    code: "HAVEN_TIME_EXCEEDED",
    level: "warning",
    subjects: [crew_id],
    message,
    haven_min: Number.isFinite(haven.minutes) ? haven.minutes : null,
    haven_kind: haven.kind,
  };

  return {
    sim_time: state.session.clock.sim_time,
    kind: "ALERT_RAISED",
    actor: "system",
    data,
    provenance: {
      "data.haven_min": "modelled",
    },
  };
}

function clearAlert(state: EngineState, alert_id: string): PendingEvent {
  return {
    sim_time: state.session.clock.sim_time,
    kind: "ALERT_CLEARED",
    actor: "system",
    data: { alert_id },
    provenance: {},
  };
}

/** Recompute `crew[].haven`; raise HAVEN_TIME_EXCEEDED past the plan's haven rule. */
export function havenTick(state: EngineState, ctx: TickContext): TickResult {
  const grid = ctx.scenario.grid;
  if (!grid) {
    return { state, events: [], deltas: [] };
  }

  const plan = currentPlan(state, ctx.scenario);
  const start = startOf(plan);
  if (!start) {
    return { state, events: [], deltas: [] };
  }

  const habField = getCachedHabField(grid, start, plan.scenario);
  if (!habField) {
    return { state, events: [], deltas: [] };
  }

  const roverInfo = getRoverFields(grid, state, ctx.scenario, plan.scenario);
  const vehicleField = roverInfo?.vehicleField ?? null;
  const passable = roverInfo?.passable ?? null;
  const ingress = {
    hab_s: HAB_INGRESS_S,
    vehicle_s: roverInfo?.vehicle_s ?? 0,
  };

  const limit_s = plan.scenario.max_haven_min * 60;
  const nextCrew: Crew[] = [];
  const deltas: StateChange[] = [];
  const events: PendingEvent[] = [];

  const activeAlerts = state.alerts.filter(
    (a) => a.code === "HAVEN_TIME_EXCEEDED" && a.cleared_seq === null,
  );
  const clearedAlertIds = new Set<string>();

  for (const c of state.crew) {
    const isSafe = c.activity === "IN_HAB" || waiting(state, ctx, c);
    let haven: Crew["haven"];

    if (isSafe) {
      haven = {
        minutes: 0,
        kind: "hab",
        target_x_m: start.x_m,
        target_y_m: start.y_m,
      };
    } else if (c.activity === "SHELTERED") {
      haven = {
        minutes: 0,
        kind: c.haven.kind,
        target_x_m: c.haven.target_x_m,
        target_y_m: c.haven.target_y_m,
      };
    } else {
      const crew_at = { x_m: c.x_m, y_m: c.y_m };
      let live = null;
      try {
        const crewField = crewTimeField(grid, crew_at, plan.scenario, limit_s);
        live = liveHaven(habField, crewField, vehicleField, passable, ingress, crew_at);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
      }

      if (live === null) {
        haven = {
          minutes: Infinity,
          kind: "hab",
          target_x_m: start.x_m,
          target_y_m: start.y_m,
        };
      } else {
        haven = {
          minutes: live.haven_s / 60,
          kind: live.kind,
          target_x_m: live.target_x_m,
          target_y_m: live.target_y_m,
        };
      }
    }

    if (
      haven.minutes !== c.haven.minutes ||
      haven.kind !== c.haven.kind ||
      haven.target_x_m !== c.haven.target_x_m ||
      haven.target_y_m !== c.haven.target_y_m
    ) {
      deltas.push({ path: `crew/${c.crew_id}/haven`, value: haven });
    }
    nextCrew.push({ ...c, haven });

    // Alert evaluation for this crew member
    const myOpenAlerts = activeAlerts.filter(
      (a) => a.subjects.includes(c.crew_id) && !clearedAlertIds.has(a.alert_id),
    );
    const exceeded = !isSafe && c.activity !== "SHELTERED" && haven.minutes > plan.scenario.max_haven_min;

    if (exceeded) {
      if (myOpenAlerts.length === 0) {
        const seq = ctx.next_seq + events.length;
        events.push(raiseHavenAlert(state, seq, c.crew_id, haven));
      }
    } else {
      for (const open of myOpenAlerts) {
        clearedAlertIds.add(open.alert_id);
        events.push(clearAlert(state, open.alert_id));
      }
    }
  }

  return {
    state: { ...state, crew: nextCrew },
    events,
    deltas,
  };
}
