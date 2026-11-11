/**
 * Event-sourced state (docs/specs/02 §A.6): state = fold(events) over the scenario's initial state.
 * Pure; the same events always give the same state (NFR-06). Contract C14, frozen by T22.01;
 * implementation T22.06. TASK_* cases are delegated to `./tasks` (T31.04).
 *
 * Nothing under src/engine/ reads wall-clock time (NFR-06): time is `session.clock.sim_time`.
 *
 * Rules (tests: tests/engine.test.ts, T22.05):
 * - Each case reads only `event.data` and the current state; no science is recomputed (05 LogEvent).
 * - Every event sets `session.last_seq` and `session.clock.sim_time`. `session.log_hash` belongs to
 *   the session manager (T22.12), which copies it from the log.
 * - CREW_SHELTERED with `haven_kind "hab"` sets IN_HAB only from WALKING or AT_STOP (03 §E.8 "Walking →
 *   InHab: plan complete"; proposed 2026-11-07, T22.09); from TO_HAVEN, and for any other kind, it
 *   sets SHELTERED (03 §E.8 "ToHaven → Sheltered").
 * - Warnings and cautions latch: an alert leaves `alerts` once it is both acknowledged and cleared;
 *   an advisory leaves on clear (03 §E.7).
 * - Executing an option (PLAN_REVISED with an `option_id`) sends that option's crew TO_HAVEN unless
 *   it is CONTINUE_SKIP, and removes the alert's options (03 §E.8, 02 §D.15). A rendezvous option
 *   logs VEHICLE_DISPATCHED first, so the summon task takes the option's crew (`crew_ids`).
 */
import type {
  Alert,
  CommandResult,
  ContingencyOption,
  Crew,
  CrewId,
  EarthMessage,
  LinkState,
  LogEvent,
  PlanExport,
  Session,
  StopTask,
  TypedLogEvent,
  Vehicle,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { ConditionsState } from "./conditions";
import { reduceTaskEvent } from "./tasks";

export interface EngineState {
  session: Session;
  /** Current plan; replaced on PLAN_REVISED (02 §E.6 SNAPSHOT `plan`). */
  plan: PlanExport | null;
  crew: Crew[];
  vehicles: Vehicle[];
  alerts: Alert[];
  options: ContingencyOption[];
  /** Reduced from TASK_ADDED / TASK_UPDATED / TASK_DROPPED only (05 StopTask, FR-50). TASK-31. */
  tasks: StopTask[];
  /** Surface link graph, recomputed each tick for mobile nodes (05 LinkState). TASK-26. */
  links: LinkState[];
  /** Earth link status for SNAPSHOT `earth` (02 §E.6). TASK-26. */
  earth: { light_time_s: number; next_pass_utc: string | null; blackout: boolean };
  earthQueue: EarthMessage[];
  /** FR-36 conditions feed values. TASK-22 (T22.16). */
  conditions: ConditionsState;
  /**
   * Walk progress per crew member, written only by tick.ts (T22.09; `TODO(decision)` S1). Engine-only:
   * it is saved in snapshots so resume continues the walk, and never sent to clients.
   */
  motion: Partial<Record<CrewId, CrewMotion>>;
  /**
   * Alert ids that already had an OPTIONS_PROPOSED, in log order; contingencyOps.ts (T23.07) answers
   * an alert once. Engine-only and JSON-safe, like `motion`; absent (= none) in states and snapshots
   * written before 2026-11-08. Added by the T23.07 rework, Proposed 2026-11-08 — TODO(decision).
   */
  proposed_alerts?: string[];
  /**
   * `session.plan_revision` at the time of each task's last TASK_UPDATED, by task id; tasks.ts decides
   * from it whether an undo is stale ("no PLAN_REVISED since that change", 01 FR-50, 02 §E.6; spec
   * change #202, Proposed 2026-11-11). Engine-only and JSON-safe, like `motion`; absent in states and
   * snapshots written before that change (an undo is then refused as stale). Added to the T20 reducer
   * state with the authorisation of its owner (Sadman Shaharier Mahim) — TODO(decision) until #194 merges.
   */
  task_plan_rev?: Record<string, number>;
}

/**
 * Where a crew member is on the plan's legs. `phase` "wait" counts `t_s` toward `start_offset_s`;
 * "walk" is `t_s` seconds into leg `leg_index`; "dwell" is `t_s` seconds into the stop dwell before
 * leg `leg_index`; "hold" is the end of the route. `last_wp_id` is the last waypoint reached.
 */
export interface CrewMotion {
  plan_revision: number;
  phase: "wait" | "walk" | "dwell" | "hold";
  leg_index: number;
  t_s: number;
  last_wp_id: string;
}

/**
 * True while a crew member waits out `start_offset_s` at the start (S4): still `WALKING` by activity,
 * but not out yet. Without a motion record the scenario's offset decides.
 */
export function isWaiting(c: Crew, m: CrewMotion | undefined, offset_s: number): boolean {
  return c.activity === "WALKING" && (m === undefined ? offset_s > 0 : m.phase === "wait");
}

/** A LogEvent before the log assigns its `seq`. */
export type PendingEvent = Omit<LogEvent, "seq" | "command_ref"> & { command_ref?: LogEvent["command_ref"] };

/** The LogEvent a pending event becomes at `seq`; engine modules leave `command_ref` out, so it is null. */
export function logged(pending: PendingEvent, seq: number): LogEvent {
  return { ...pending, command_ref: pending.command_ref ?? null, seq };
}

/** What a command handler returns; commands.ts (T23.02) answers COMMAND_RESULT from it. */
export interface CommandOutcome {
  result: CommandResult;
  events: PendingEvent[];
}

/** One STATE_DELTA change; path syntax "crew/EV1/x_m" (02 §E.6). */
export interface StateChange {
  path: string;
  value: unknown;
}

/** State at `scenario.start_utc` before any event: crew in the hab, vehicles at their starts. T22.06. */
export function initialState(scenario: LoadedScenario, session_id: string): EngineState {
  const s = scenario.scenario;
  const start = s.plan.waypoints.find((w) => w.role === "start") ?? s.plan.waypoints[0];
  const hab = { x_m: start?.x_m ?? 0, y_m: start?.y_m ?? 0 };
  const firstEarthRow = scenario.earthLink.rows[0];
  return {
    session: {
      session_id,
      scenario_id: s.scenario_id,
      data_version: s.data_version,
      seed: s.seed,
      status: "LOADED",
      // 1× and not paused until the first SET_CLOCK (CLOCK_CHANGED); decided 2026-11-07 (05 Session clock).
      clock: { sim_time: s.start_utc, speed: 1, paused: false },
      // The published plan is revision 1; each PLAN_REVISED carries the new number (05 Session).
      plan_revision: 1,
      last_seq: 0,
      log_hash: "",
    },
    plan: s.plan,
    crew: s.crew.map(
      (c): Crew => ({
        crew_id: c.crew_id,
        ...hab,
        activity: "IN_HAB",
        stop_index: null,
        o2_frac: 1,
        eva_elapsed_s: 0,
        dose_event_ugy: 0,
        dose_event_unsheltered_ugy: 0,
        haven: { minutes: 0, kind: "hab", target_x_m: hab.x_m, target_y_m: hab.y_m },
        linked: true,
        link_path: [c.crew_id, "HAB"],
        stale: false,
      }),
    ),
    vehicles: s.vehicles.map(
      (v): Vehicle => ({
        vehicle_id: v.vehicle_id,
        kind: v.kind,
        param_set: v.param_set,
        x_m: v.start_x_m,
        y_m: v.start_y_m,
        state: "PARKED",
        task: null,
        path: [],
        eta_s: null,
        battery_wh: null,
      }),
    ),
    alerts: [],
    options: [],
    tasks: [],
    links: [],
    earth: { light_time_s: firstEarthRow?.light_time_s ?? 0, next_pass_utc: null, blackout: false },
    earthQueue: [],
    conditions: { ltst: null, sun_elevation_deg: null, dose_rate_background_ugy_h: null, dose_rate_event_ugy_h: null, provenance: {} },
    motion: {},
  };
}

/** Apply one logged event. TASK_* events go to `reduceTaskEvent` (T31.04). T22.06. */
export function reduce(state: EngineState, event: LogEvent): EngineState {
  const next: EngineState = {
    ...state,
    session: { ...state.session, last_seq: event.seq, clock: { ...state.session.clock, sim_time: event.sim_time } },
  };
  const e = event as TypedLogEvent;
  switch (e.kind) {
    case "SESSION_LOADED":
      return { ...next, session: { ...next.session, status: "LOADED" } };
    case "EVA_STARTED":
      return {
        ...next,
        session: { ...next.session, status: "RUNNING", plan_revision: e.data.plan_revision },
        crew: updateCrew(next.crew, e.data.crew_ids, () => ({ activity: "WALKING" })),
      };
    case "ARRIVED_STOP":
      return { ...next, crew: updateCrew(next.crew, [e.data.crew_id], () => ({ activity: "AT_STOP", stop_index: e.data.stop_index })) };
    case "LEFT_STOP":
      return { ...next, crew: updateCrew(next.crew, [e.data.crew_id], () => ({ activity: "WALKING", stop_index: e.data.stop_index })) };
    case "ALERT_RAISED": {
      const { alert_id, code, level, subjects, message, ...values } = e.data;
      const alert: Alert = {
        alert_id,
        code,
        level,
        subjects: [...subjects],
        message,
        raised_seq: e.seq,
        acked_seq: null,
        cleared_seq: null,
        acked_by: null,
        data: { ...values, provenance: { ...e.provenance } },
      };
      return { ...next, alerts: [...next.alerts.filter((a) => a.alert_id !== alert_id), alert] };
    }
    case "ALERT_ACKED":
      return { ...next, alerts: settle(next.alerts, e.data.alert_id, { acked_seq: e.seq, acked_by: e.data.acked_by }) };
    case "ALERT_CLEARED":
      return { ...next, alerts: settle(next.alerts, e.data.alert_id, { cleared_seq: e.seq }) };
    case "OPTIONS_PROPOSED": {
      const answered = next.proposed_alerts ?? [];
      return {
        ...next,
        options: [...next.options.filter((o) => o.alert_id !== e.data.alert_id), ...e.data.options],
        proposed_alerts: answered.includes(e.data.alert_id) ? answered : [...answered, e.data.alert_id],
      };
    }
    case "PLAN_REVISED": {
      // The revised waypoints and legs replace the plan's, so the map shows the new route; a
      // published plan arrives whole in `plan` (decided 2026-11-07).
      const option = next.options.find((o) => o.option_id === e.data.option_id);
      const toHaven = option && option.kind !== "CONTINUE_SKIP" ? option.crew_ids : [];
      const base = e.data.plan ?? next.plan;
      return {
        ...next,
        session: { ...next.session, plan_revision: e.data.plan_revision },
        // `?? base…` keeps logs written before 2026-11-07 (no waypoints/legs in the data) readable.
        plan: base && { ...base, waypoints: e.data.waypoints ?? base.waypoints, result: { ...base.result, legs: e.data.legs ?? base.result.legs } },
        options: option ? next.options.filter((o) => o.alert_id !== option.alert_id) : next.options,
        crew: updateCrew(next.crew, toHaven, () => ({ activity: "TO_HAVEN" })),
      };
    }
    case "VEHICLE_DISPATCHED": {
      const d = e.data;
      return {
        ...next,
        vehicles: updateVehicle(next.vehicles, d.vehicle_id, (v): Partial<Vehicle> => {
          if (d.task) {
            const target = d.target ?? { x_m: v.x_m, y_m: v.y_m };
            return { state: "TASKED", task: { kind: d.task, target: { ...target }, ...(d.item === undefined ? {} : { item: d.item }) } };
          }
          const option = state.options.find((o) => o.option_id === d.option_id);
          const rv = d.rendezvous ?? null;
          return {
            state: "DISPATCHED",
            task: {
              kind: "SUMMON",
              target: rv ? { x_m: rv.x_m, y_m: rv.y_m } : { x_m: v.x_m, y_m: v.y_m },
              ...(option ? { crew_ids: [...option.crew_ids] } : {}),
            },
            // Whole seconds (05 Vehicle `eta_s` is an int). Math.ceil: a no-op on T23.05's rounded ETAs, and a
            // precomputed (T23.07) fractional ETA > 0 never becomes 0, which would stop the vehicle (Proposed 2026-11-08).
            eta_s: rv ? Math.ceil(rv.eta_vehicle_s) : null,
          };
        }),
      };
    }
    case "VEHICLE_ARRIVED":
      return { ...next, vehicles: updateVehicle(next.vehicles, e.data.vehicle_id, () => ({ state: "ARRIVED", x_m: e.data.x_m, y_m: e.data.y_m, eta_s: 0 })) };
    case "CREW_SHELTERED":
      return {
        ...next,
        crew: updateCrew(next.crew, [e.data.crew_id], (c) => ({
          // Back in the hab at the end of the plan is "plan complete" (03 §E.8) for a crew member who
          // walked or stood at a stop; one sent to a haven is Sheltered (ToHaven → Sheltered), as is any other kind.
          activity: e.data.haven_kind === "hab" && (c.activity === "WALKING" || c.activity === "AT_STOP") ? "IN_HAB" : "SHELTERED",
          dose_event_ugy: e.data.dose_event_ugy,
          dose_event_unsheltered_ugy: e.data.dose_event_unsheltered_ugy,
          haven: { ...c.haven, kind: e.data.haven_kind },
        })),
      };
    case "LINK_LOST":
      return { ...next, crew: updateCrew(next.crew, [e.data.node_id], () => ({ linked: false, stale: true })) };
    case "LINK_RESTORED":
      return { ...next, crew: updateCrew(next.crew, [e.data.node_id], () => ({ linked: true, stale: false })) };
    case "EARTH_MSG_QUEUED":
      return { ...next, earthQueue: [...next.earthQueue, { ...e.data, state: "QUEUED", provenance: { ...e.provenance } }] };
    case "EARTH_MSG_DELIVERED":
      return { ...next, earthQueue: next.earthQueue.map((m) => (m.message_id === e.data.message_id ? { ...m, state: "DELIVERED" } : m)) };
    case "COMMAND_REJECTED":
      return next;
    case "CLOCK_CHANGED": {
      const status = next.session.status;
      const running = status === "RUNNING" || status === "PAUSED" ? (e.data.paused ? "PAUSED" : "RUNNING") : status;
      return { ...next, session: { ...next.session, status: running, clock: { ...next.session.clock, speed: e.data.speed, paused: e.data.paused } } };
    }
    case "EVA_ENDED":
      return { ...next, session: { ...next.session, status: "ENDED" } };
    case "TASK_ADDED":
    case "TASK_UPDATED":
    case "TASK_DROPPED":
      return reduceTaskEvent(next, event);
    default:
      return assertNever(e);
  }
}

function updateCrew(crew: Crew[], ids: readonly string[], patch: (c: Crew) => Partial<Crew>): Crew[] {
  return crew.map((c) => (ids.includes(c.crew_id) ? { ...c, ...patch(c) } : c));
}

function updateVehicle(vehicles: Vehicle[], id: string, patch: (v: Vehicle) => Partial<Vehicle>): Vehicle[] {
  return vehicles.map((v) => (v.vehicle_id === id ? { ...v, ...patch(v) } : v));
}

/** Apply an ack or clear, then drop the alert if its latch is released (03 §E.7). */
function settle(alerts: Alert[], alert_id: string, patch: Partial<Alert>): Alert[] {
  return alerts
    .map((a) => (a.alert_id === alert_id ? { ...a, ...patch } : a))
    .filter((a) => a.alert_id !== alert_id || !(a.cleared_seq !== null && (a.level === "advisory" || a.acked_seq !== null)));
}

function assertNever(event: never): never {
  throw new Error(`reduce: unknown LogEvent kind ${(event as LogEvent).kind}`);
}
