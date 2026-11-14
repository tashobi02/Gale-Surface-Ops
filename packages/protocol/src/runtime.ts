/**
 * Hab Core runtime entities (docs/specs/05 §C.2, ParamSet in §C.1). Field names are copied from 05;
 * 05 owns them. Change 05 first, then this file and schemas/*.schema.json together.
 *
 * Protocol v0 — freeze date 2026-11-07 (M1; T20.01, contract C13). After the freeze, changes go through a
 * `contract-change:` subtask in TASK-20. The wire version stays `v: 1` (02 §E.6); "v0" names the freeze.
 * Protocol v0.2 (2026-11-12, T32.01): the live-session additions of docs/plan/backend/01-contract.md, all
 * additive, so `PROTOCOL_VERSION` stays 1. Their text is in 02 §D.17, §E.5, §E.6 and 05 (Proposed 2026-11-12).
 *
 * Conventions: `sim_time` is ISO-8601 UTC on the mission clock (never wall-clock); `seq` is the
 * Hab Core's monotonic event number; positions are working-projection metres.
 */
import type { Leg, PlanExport, Provenance, Waypoint } from "./schema";
import type { RejectCode } from "./ws";

/** Provenance map keyed by field path, e.g. {"crew.o2_frac": "simulated"} (02 §E.6). */
export type ProvenanceMap = Record<string, Provenance>;

export type CrewId = "EV1" | "EV2";
/**
 * `hud:EVn` (added 2026-11-12, Proposed): the EVA HUD, a read-only viewer with no commands (02 §E.4).
 * `presenter` (added 2026-11-10, Proposed): drives the live session (02 §D.17, §E.4).
 */
export type Role = "planner" | "eva:EV1" | "eva:EV2" | "hud:EV1" | "hud:EV2" | "ops" | "earth" | "presenter";

// ---------------------------------------------------------------------------
// Parameters and scenario files
// ---------------------------------------------------------------------------

export type ParamSetKind = "suit" | "pressurized_rover" | "utility_rover" | "link" | "alert" | "shielding";

/** Every number the simulation uses that is not data (05 §C.1 ParamSet). */
export interface ParamSet {
  param_set_id: string;
  kind: ParamSetKind;
  title: string;
  /** Keys per kind: see 05 ParamSet table. */
  values: Record<string, number | boolean>;
  /** `assumed` unless every value is cited. */
  provenance: Provenance;
  source_ids?: string[];
  note?: string;
}

export type ScenarioEventKind = "EARTH_MESSAGE" | "DONKI_RECORD" | "ADVISORY" | "INJECT";

export interface ScenarioEvent {
  event_id: string;
  /** Mars-side time at which the event exists. */
  t_utc: string;
  kind: ScenarioEventKind;
  payload: Record<string, unknown>;
  provenance: Provenance;
  /** Required unless provenance is `simulated`. */
  source_id?: string;
}

export interface Scenario {
  scenario_schema_version: string;
  scenario_id: string;
  title: string;
  site_id: string;
  data_version: string;
  seed: number;
  start_utc: string;
  /** The reference plan of a headless run; a live session has none until PUBLISH_PLAN (05 Scenario, T32.07). */
  plan?: PlanExport;
  /** Initial stop tasks, authored fields only; beside `plan` so `plan_hash` is unchanged (05 Scenario, FR-50, U-48). */
  stop_tasks?: StopTaskSeed[];
  crew: { crew_id: CrewId; suit_param_set: string; start_offset_s: number }[];
  vehicles: { vehicle_id: string; kind: VehicleKind; param_set: string; start_x_m: number; start_y_m: number }[];
  param_sets: string[];
  /** Other scheduled inputs; absent reads as `[]` (05 Scenario, T32.07). */
  events?: ScenarioEvent[];
  /** Mission settings in force at load (05 Scenario `mission_setup`, 2026-11-10, Proposed). */
  mission_setup: Partial<MissionSetup> & { hab_candidate_id?: string };
  /** Events the presenter starts on demand with START_EVENT (05 EventLibraryEntry). */
  event_library: EventLibraryEntry[];
  /** Suggested tasks per POI (05 TaskLibraryEntry, FR-54). */
  task_library?: TaskLibraryEntry[];
  tables: { dose_series: { path: string; sha256: string }; earth_link: { path: string; sha256: string } };
  source_ids: string[];
}

/** The mission settings in force (05 Session `mission_setup`; ranges 02 §E.3; BD-96). */
export interface MissionSetup {
  /** Must equal the scenario `crew[]` length. */
  crew_count: number;
  vehicle_available: boolean;
  /** FK -> ParamSet of kind `pressurized_rover`. */
  vehicle_param_set: string | null;
  /** 05 MissionScenario name and values (`max` or `min`). */
  solar_phase: string;
  /** 05 MissionScenario range. */
  max_haven_min: number;
}

/** A scheduled input of a library event, timed at `t0 + t_offset_s` (05 EventLibraryEntry `inputs`, BD-99). */
export interface EventLibraryInput {
  input_id: string;
  t_offset_s: number;
  kind: ScenarioEventKind;
  payload: Record<string, unknown>;
  provenance: Provenance;
  source_id?: string;
}

/** An event the presenter starts at the current sim time with START_EVENT (05 EventLibraryEntry, 02 §D.17). */
export interface EventLibraryEntry {
  event_id: string;
  title: string;
  kind: "SPACE_WEATHER";
  /** Key in `Scenario.tables`. */
  dose_series: "dose_series";
  series_start_utc: string;
  label: string;
  source_id: string;
  provenance: "replayed";
  inputs?: EventLibraryInput[];
}

/** What SNAPSHOT carries of a library event (BD-104). */
export type EventLibrarySummary = Pick<EventLibraryEntry, "event_id" | "title" | "kind" | "label" | "source_id" | "provenance">;

/** A suggested task for a POI (05 TaskLibraryEntry, FR-54). */
export interface TaskLibraryEntry {
  library_task_id: string;
  poi_id: string;
  crew_id: CrewId | null;
  kind: StopTaskKind;
  /** <= 60 characters; any ASCII digit in it requires `source_id` (BD-101). */
  text: string;
  source_id?: string;
}

/** Replayed surface dose rate (05 DoseSeries). Absorbed dose; never Sv for the event. */
export interface DoseSeries {
  series_id: string;
  quantity: string;
  unit: "uGy/h";
  /** [t_utc, rate]; rate null marks a gap. */
  samples: [string, number | null][];
  background_rate: number;
  method: "archive" | "digitised" | "template_scaled";
  provenance: "replayed";
  source_id: string;
  integral_check: { expected_ugy: number; computed_ugy: number };
}

export interface EarthLinkRow {
  t_utc: string;
  light_time_s: number;
  sep_angle_deg: number;
  earth_elev_deg: number;
  orbiters: { mro: number; maven: number; tgo: number };
}

/** SPICE geometry precomputed by the pipeline (05 EarthLinkTable). */
export interface EarthLinkTable {
  step_s: number;
  rows: EarthLinkRow[];
  passes: { orbiter: "mro" | "maven" | "tgo"; start_utc: string; end_utc: string; max_elev_deg: number }[];
  kernels: { file: string; sha256: string; source_id: string }[];
  provenance: "derived";
}

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------

export interface Session {
  session_id: string;
  scenario_id: string;
  data_version: string;
  seed: number;
  status: "LOADED" | "RUNNING" | "PAUSED" | "ENDED";
  clock: { sim_time: string; speed: 1 | 10 | 60; paused: boolean };
  plan_revision: number;
  last_seq: number;
  log_hash: string;
  /** The chosen HabCandidate, null when the Site has none; changed only by SELECT_HAB_SITE (05 Session; BD-100). */
  hab_candidate_id: string | null;
  /** The settings in force (05 Session; BD-100). */
  mission_setup: MissionSetup;
  /** Library events started so far, reduced from EVENT_STARTED (05 Session; BD-100). */
  started_events: { event_id: string; t0_sim_time: string }[];
}

export interface ClientConnection {
  client_id: string;
  role: Role;
  display_name: string;
  /** Wall-clock, diagnostics only; never logged. */
  connected_since: string;
  last_seq_acked: number;
}

/** `HOLDING`: stopped by SET_CREW_MOTION, a simulation control (02 §E.6, 05 Command; Q2, Proposed 2026-11-13). */
export type CrewActivity = "IN_HAB" | "WALKING" | "AT_STOP" | "TO_HAVEN" | "SHELTERED" | "HOLDING" | "RIDING";

/** Authoritative session-level EVA phase surfaced in ConditionsState (N-06 follow-up, BD-163). */
export type EvaPhase = "IN_HAB" | "WALKING" | "SHELTERED" | "PAUSED" | "ENDED";

export interface Crew {
  crew_id: CrewId;
  x_m: number;
  y_m: number;
  activity: CrewActivity;
  stop_index: number | null;
  o2_frac: number;
  eva_elapsed_s: number;
  dose_event_ugy: number;
  dose_event_unsheltered_ugy: number;
  haven: { minutes: number; kind: "hab" | "vehicle" | "refuge"; target_x_m: number; target_y_m: number };
  linked: boolean;
  link_path: string[];
  stale: boolean;
  /** Minutes of O2 left at the current activity, from compute `o2RemainingS`; `simulated` (BD-95). */
  o2_remaining_min?: number | null;
  /** 0-360 clockwise from grid north (+y of the working projection) to this member's next stop; `derived` (BD-95). */
  next_stop_bearing_deg?: number | null;
  /** Straight-line horizontal distance to that stop, projected metres; `derived` (BD-95). */
  next_stop_distance_m?: number | null;
  /** Seconds until arrival at that stop, including the remaining dwell at the current stop; `modelled` (BD-95). */
  next_stop_eta_s?: number | null;
  /** Radio hops to HAB along `link_path`, null when unlinked; `simulated` (BD-103). No signal strength exists. */
  link_hops?: number | null;
  /** The kind of the first hop of `link_path`; `simulated` (BD-103). */
  link_via?: "direct" | "relay" | "crew" | null;
  /** Sim time of the last tick this member was linked; `simulated` (BD-112). */
  last_linked_sim_time?: string | null;
}

export type VehicleKind = "pressurized_rover" | "utility_rover";
export type VehicleState = "PARKED" | "DISPATCHED" | "EN_ROUTE" | "ARRIVED" | "RETURNING" | "TASKED";

export interface Vehicle {
  vehicle_id: string;
  kind: VehicleKind;
  param_set: string;
  x_m: number;
  y_m: number;
  state: VehicleState;
  task: {
    kind: "SUMMON" | "SCOUT" | "CARRY" | "RELAY" | "RETURN" | "RIDE";
    target: { x_m: number; y_m: number };
    crew_ids?: CrewId[];
    /** RIDE only: the plan stop the rider is carried to (RIDE_VEHICLE, QoL Q3). */
    stop_id?: string;
    /** CARRY only: a free-text label (05 Vehicle; FR-41 names no item list; decided 2026-11-07). */
    item?: string;
  } | null;
  path: [number, number][];
  eta_s: number | null;
  /** Utility rover only. */
  battery_wh: number | null;
  /** Id of the active task (the head of the queue), utility rover only (BD-102). */
  task_id?: string | null;
  /** Tasks after the head; `[]` for the pressurized rover (BD-102). */
  queue?: QueuedRoverTask[];
  /** A utility rover parked as RELAY: increments when its coverage grid changes; null otherwise (BD-112, N-11). */
  relay_coverage_rev?: number | null;
}

/** One queued utility-rover task (05 Vehicle `queue`, BD-102). */
export interface QueuedRoverTask {
  /** `rt-<seq of its VEHICLE_DISPATCHED>`. */
  task_id: string;
  kind: RoverTaskKind;
  /** null for RETURN. */
  target: { x_m: number; y_m: number } | null;
  item?: string;
  /** Seconds from now until this task completes; `modelled`. null until the tick fills it. */
  eta_s: number | null;
  /** Battery after this task, 02 §D.9 energy form; `modelled`. null until the tick fills it. */
  battery_wh_after: number | null;
}

/** Utility rover goal-level tasks (FR-41). SUMMON is the pressurized rover's (FR-39). */
export type RoverTaskKind = "SCOUT" | "CARRY" | "RELAY" | "RETURN";

/**
 * `TASK_ROVER` args. Shape follows FR-41 (SCOUT(point), CARRY(item, to), RELAY(point), RETURN);
 * 02 §E.6 gives no example. CARRY's "to" is `target`. An accepted task emits `VEHICLE_DISPATCHED`
 * with `{vehicle_id, task, target}` (plus `item` for CARRY) in `data`; no new LogEventKind (decided
 * 2026-11-06, T20.01; written into 05 Vehicle on 2026-11-07, T20.10).
 */
export interface TaskRoverArgs {
  vehicle_id: string;
  task: RoverTaskKind;
  /** Required for SCOUT, CARRY and RELAY; absent for RETURN. Working-projection metres. */
  target?: { x_m: number; y_m: number };
  /** CARRY only: a free-text label (05 Vehicle; FR-41 names no item list; decided 2026-11-07). */
  item?: string;
}

export type AlertCode =
  | "RADIATION_ALERT"
  | "HAVEN_TIME_EXCEEDED"
  | "CONSUMABLES_LOW"
  | "COMM_SHADOW"
  | "LINK_LOST"
  | "BUDDY_SEPARATION"
  | "EARTH_FORECAST"
  | "ADVISORY"
  | "INJECTED";

/** 04 §D.2 alert hierarchy. */
export type AlertLevel = "warning" | "caution" | "advisory";

export interface Alert {
  alert_id: string;
  code: AlertCode;
  level: AlertLevel;
  subjects: string[];
  raised_seq: number;
  acked_seq: number | null;
  cleared_seq: number | null;
  acked_by: Role | null;
  /** Action first, ≤ 60 chars (04 §D.2). */
  message: string;
  data: Record<string, unknown> & { provenance?: ProvenanceMap };
}

export interface ContingencyOption {
  option_id: string;
  alert_id: string;
  kind: "ABORT_TO_HAB" | "VEHICLE_RENDEZVOUS" | "TERRAIN_REFUGE" | "CONTINUE_SKIP";
  crew_ids: CrewId[];
  eta_shelter_min: number;
  expected_dose_ugy: number;
  stops_dropped: number[];
  violations: string[];
  /** 1 = best. */
  rank: number;
  path_preview: [number, number][];
  rendezvous: { x_m: number; y_m: number; eta_crew_s: number; eta_vehicle_s: number } | null;
}

// ---------------------------------------------------------------------------
// Stop tasks (FR-50; 05 StopTask)
// ---------------------------------------------------------------------------

export type StopTaskKind = "observe" | "image" | "sample" | "measure" | "deploy" | "other";
export type StopTaskState = "TODO" | "DONE" | "SKIPPED" | "DROPPED";
/** Reason for SKIPPED. DROPPED is set by `system` on plan revision. */
export type StopTaskReason = "time" | "terrain" | "alert" | "other";

/** One thing to do at one planned stop (05 StopTask). State is reduced from TASK_* events only. */
export interface StopTask {
  /** Unique per session, e.g. `t-s2-02`. */
  task_id: string;
  /** `id` of the plan stop Waypoint it belongs to, e.g. `wp-2` (05 StopTask, U-61). */
  stop_id: string;
  /** null = either crew member. */
  crew_id: CrewId | null;
  kind: StopTaskKind;
  /** ≤ 60 characters, imperative; any number cites its source. */
  text: string;
  state: StopTaskState;
  reason: StopTaskReason | null;
  /** `ops` shows the "added by ops" tag. */
  origin: "plan" | "ops";
  updated_sim_time: string;
  updated_by: Role | "system";
  /** State `simulated`; text `assumed` with the POI source id (05 StopTask). */
  provenance: ProvenanceMap;
}

/** The authored fields of a StopTask, as written in `scenario.json` `stop_tasks`. */
export type StopTaskSeed = Pick<StopTask, "task_id" | "stop_id" | "crew_id" | "kind" | "text">;

export type CommandKind =
  | "LOAD_SCENARIO"
  | "SET_CLOCK"
  | "JUMP_NEXT_EVENT"
  | "START_EVA"
  | "PUBLISH_PLAN"
  | "SUMMON_VEHICLE"
  | "RIDE_VEHICLE"
  | "ABORT"
  | "ACK_ALERT"
  | "APPROVE_OPTION"
  | "TASK_ROVER"
  | "SEND_MESSAGE"
  | "INJECT_EVENT"
  | "UPDATE_STOP_TASK"
  | "ADD_STOP_TASK"
  // Live session (02 §D.17, added 2026-11-10, Proposed).
  | "JUMP_NEXT_STOP"
  | "START_EVENT"
  | "RESET_SESSION"
  | "SELECT_HAB_SITE"
  | "SET_MISSION_SETUP"
  // Simulation control (02 §E.6, 05 Command, added 2026-11-13, Proposed): not a real EVA function.
  | "SET_CREW_MOTION";

export interface Command {
  command_id: string;
  role: Role;
  kind: CommandKind;
  /**
   * Per-kind fields, nested here on the wire too (05 Command; decided 2026-11-06, T20.01).
   * The 02 §E.6 COMMAND examples still show them beside `kind`; a 02 spec-change aligns them.
   */
  args: Record<string, unknown>;
  /** Set by an EVA client resending after LINK_STATE linked=true. */
  queued_offline?: boolean;
}

export type LogEventKind =
  | "SESSION_LOADED"
  | "EVA_STARTED"
  | "ARRIVED_STOP"
  | "LEFT_STOP"
  | "ALERT_RAISED"
  | "ALERT_ACKED"
  | "ALERT_CLEARED"
  | "OPTIONS_PROPOSED"
  | "PLAN_REVISED"
  /** Also emitted for an accepted `TASK_ROVER` (data `{vehicle_id, task, target, item?}`). */
  | "VEHICLE_DISPATCHED"
  | "VEHICLE_ARRIVED"
  | "CREW_SHELTERED"
  /** QoL Q3: a crew member boards the pressurized rover / steps out at the stop (RIDE_VEHICLE). */
  | "CREW_BOARDED"
  | "CREW_DISMOUNTED"
  | "LINK_LOST"
  | "LINK_RESTORED"
  | "EARTH_MSG_QUEUED"
  | "EARTH_MSG_DELIVERED"
  | "COMMAND_REJECTED"
  | "CLOCK_CHANGED"
  | "EVA_ENDED"
  | "TASK_ADDED"
  | "TASK_UPDATED"
  | "TASK_DROPPED"
  // Live session (05 LogEvent, 2026-11-10, Proposed).
  | "CLOCK_JUMPED"
  | "EVENT_STARTED"
  | "SESSION_RESET"
  | "SITE_SELECTED"
  | "MISSION_SETUP_SET"
  /** A HELLO for a held role displaced its holder (02 §E.4, added 2026-11-12, Proposed). Actor `system`, `command_ref` null. */
  | "ROLE_TAKEN_OVER"
  /** A crew member was held or resumed by SET_CREW_MOTION, a simulation control (05 LogEvent, added 2026-11-13, Proposed). */
  | "CREW_MOTION_SET";

/** The command that produced a LogEvent (05 LogEvent `command_ref`, added 2026-11-07). */
export interface CommandRef {
  client_id: string;
  command_id: string;
}

/** One line of session.jsonl (05 LogEvent). Immutable. */
export interface LogEvent {
  seq: number;
  sim_time: string;
  kind: LogEventKind;
  actor: Role | "system";
  data: Record<string, unknown>;
  provenance: ProvenanceMap;
  /** SHA-256 of compute inputs when the event carries a computed value. */
  inputs_hash?: string;
  /**
   * The command that produced the event, including COMMAND_REJECTED; null for `system` events.
   * Lets the Hab Core rebuild the accepted `command_id`s after a restart (05 Command dedupe rule).
   * Required, decided 2026-11-07: an absent field and `null` would hash differently in `log_hash`.
   */
  command_ref: CommandRef | null;
}

/*
 * `data` of each LogEvent kind (05 "LogEvent `data` by kind", added 2026-11-07). Fields marked
 * Proposed in 05 may change in TASK-22 without a spec change; field names follow the 05 entity.
 * `LogEvent.data` stays an open record; read a typed view with `TypedLogEvent<K>`.
 */
type Point = { x_m: number; y_m: number };

export interface LogEventData {
  /** `plan_hash` is null for a plan-less session (BD-96). */
  SESSION_LOADED: Pick<Session, "session_id" | "scenario_id" | "data_version" | "seed"> & { plan_hash: string | null };
  EVA_STARTED: { crew_ids: CrewId[]; plan_revision: number };
  ARRIVED_STOP: { crew_id: CrewId; stop_id: string; stop_index: number };
  LEFT_STOP: { crew_id: CrewId; stop_id: string; stop_index: number };
  ALERT_RAISED: Pick<Alert, "alert_id" | "code" | "level" | "subjects" | "message"> & {
    /** RADIATION_ALERT values (05 §F.6, fixture `radiation-alert`); other codes add their own. */
    rate_ugy_h?: number | null;
    threshold_ugy_h?: number | null;
    source?: string;
    /** CONSUMABLES_LOW values (02 §D.14, decided 2026-11-07; 05 Proposed). */
    o2_remaining_min?: number;
    /** null when no haven can be reached. */
    haven_min?: number | null;
    haven_kind?: Crew["haven"]["kind"];
    margin?: number;
    threshold_margin?: number;
    /** BUDDY_SEPARATION values (05 Proposed). */
    distance_m?: number;
    threshold_m?: number;
  };
  ALERT_ACKED: { alert_id: string; acked_by: Role };
  ALERT_CLEARED: { alert_id: string };
  OPTIONS_PROPOSED: { alert_id: string; options: ContingencyOption[] };
  /**
   * `waypoints` and `legs` are the revised plan's and replace the current ones, so the map shows the
   * new route (decided 2026-11-07). `plan` is present only when the planner publishes a new plan.
   */
  PLAN_REVISED: { plan_revision: number; option_id: string | null; stops_dropped: number[]; waypoints: Waypoint[]; legs: Leg[]; plan?: PlanExport };
  /** Summon: `option_id` + `rendezvous`. Accepted TASK_ROVER: `task` + `target` (+ `item` for CARRY). */
  VEHICLE_DISPATCHED: {
    vehicle_id: string;
    option_id?: string;
    rendezvous?: ContingencyOption["rendezvous"];
    task?: RoverTaskKind;
    target?: Point;
    item?: string;
    /** Accepted TASK_ROVER only: `rt-<seq of this event>` (BD-102). */
    task_id?: string;
  };
  VEHICLE_ARRIVED: { vehicle_id: string } & Point;
  /** `actor` repeats the LogEvent actor (the issuing role) so the hold is readable on its own. */
  CREW_MOTION_SET: { crew_id: CrewId; motion: "HOLD" | "RESUME"; actor: Role };
  CREW_SHELTERED: Pick<Crew, "crew_id" | "dose_event_ugy" | "dose_event_unsheltered_ugy"> & {
    haven_kind: Crew["haven"]["kind"];
  };
  /** RIDE_VEHICLE (QoL Q3, Proposed 2026-11-13): the rider boards; the drive is the VEHICLE_DISPATCHED that follows. */
  CREW_BOARDED: { crew_id: CrewId; vehicle_id: string; to_stop_id: string };
  /** The rider steps out at the stop the vehicle reached; the crew member is then AT_STOP. */
  CREW_DISMOUNTED: { crew_id: CrewId; vehicle_id: string; stop_id: string; stop_index: number } & Point;
  LINK_LOST: { node_id: string };
  LINK_RESTORED: { node_id: string };
  EARTH_MSG_QUEUED: Pick<EarthMessage, "message_id" | "direction" | "body" | "sent_utc" | "deliver_utc" | "via">;
  EARTH_MSG_DELIVERED: { message_id: string };
  COMMAND_REJECTED: { code: RejectCode; message: string };
  CLOCK_CHANGED: Pick<Session["clock"], "speed" | "paused">;
  EVA_ENDED: { crew_ids: CrewId[] };
  TASK_ADDED: Pick<StopTask, "task_id" | "stop_id" | "crew_id" | "kind" | "text" | "origin">;
  /** `undo: true` marks a reversal to TODO (05 LogEvent, 01 FR-50; added 2026-11-11, Proposed, spec change #202). */
  TASK_UPDATED: Pick<StopTask, "task_id" | "stop_id" | "crew_id" | "state" | "reason"> & { undo?: boolean };
  TASK_DROPPED: { task_id: string; stop_id: string; plan_revision: number };
  /** Logged after the events of the jump, because `to_sim_time` is known only then (BD-92). */
  CLOCK_JUMPED: {
    reason: "next_stop";
    from_sim_time: string;
    to_sim_time: string;
    stop_id: string;
    ended_by: "arrival" | "alert" | "plan_revised" | "eva_ended" | "sheltered";
  };
  EVENT_STARTED: { event_id: string; t0_sim_time: string; series_start_utc: string; source_id: string };
  /** Last line of the old log (02 §D.17). */
  SESSION_RESET: { session_id: string; next_session_id: string };
  SITE_SELECTED: { candidate_id: string };
  /** The keys set, `vehicle_param_set` included (BD-96). */
  MISSION_SETUP_SET: Partial<MissionSetup>;
  /** 05 LogEvent `ROLE_TAKEN_OVER`; `crew_id` only for an `eva:EVn` or `hud:EVn` role (the key is absent otherwise). Changes no state. */
  ROLE_TAKEN_OVER: { role: Role; crew_id?: CrewId; old_client_id: string; new_client_id: string };
}

/** A LogEvent of one kind with its `data` typed. */
export type TypedLogEvent<K extends LogEventKind = LogEventKind> = K extends LogEventKind
  ? Omit<LogEvent, "kind" | "data"> & { kind: K; data: LogEventData[K] }
  : never;

export interface EarthMessage {
  message_id: string;
  direction: "to_earth" | "to_mars";
  body: string;
  sent_utc: string;
  deliver_utc: string;
  via: "mro" | "maven" | "tgo" | "dte";
  state: "QUEUED" | "IN_TRANSIT" | "DELIVERED";
  /** 05 EarthMessage: `simulated`, delivery time `derived`, e.g. {"state": "simulated", "deliver_utc": "derived"}. */
  provenance: ProvenanceMap;
}

export interface LinkState {
  node_id: string;
  neighbors: string[];
  linked_to_hab: boolean;
  since_sim_time: string;
}

/**
 * FR-36 conditions at the hab, in SNAPSHOT `conditions` and STATE_DELTA paths `conditions/<key>` (BD-75).
 * Temperature and pressure are absent ("not included in this build", FR-36). Pure engine output; sim time only.
 */
export interface ConditionsState {
  /** "HH:MM" local true solar time at the hab; `derived`. */
  ltst: string | null;
  /** Flat-horizon model, 02 §D.5; `derived`. */
  sun_elevation_deg: number | null;
  /** `replayed` (DoseSeries.background_rate). */
  dose_rate_background_ugy_h: number | null;
  /** `replayed`; equals the background before START_EVENT. */
  dose_rate_event_ugy_h: number | null;
  /** The series time being played (time-shifted); null before START_EVENT. */
  event_series_utc: string | null;
  /** MSL mission sol at sim time, compute `mslSol()`; `derived` (N-06). */
  sol: number | null;
  /** Authoritative EVA phase derived from session status and crew activity; `simulated` (N-06 follow-up). */
  eva_phase?: EvaPhase | null;
  /** Field -> source id, e.g. dose rates -> "rad-sol4190", ltst -> "mars24-allison-mcewen-2000". */
  source_ids: Record<string, string>;
  provenance: ProvenanceMap;
}
