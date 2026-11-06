/**
 * Hab Core runtime entities (docs/specs/05 §C.2, ParamSet in §C.1). Field names are copied from 05;
 * 05 owns them. Change 05 first, then this file and schemas/*.schema.json together.
 *
 * Conventions: `sim_time` is ISO-8601 UTC on the mission clock (never wall-clock); `seq` is the
 * Hab Core's monotonic event number; positions are working-projection metres.
 */
import type { PlanExport, Provenance } from "./schema";

/** Provenance map keyed by field path, e.g. {"crew.o2_frac": "simulated"} (02 §E.6). */
export type ProvenanceMap = Record<string, Provenance>;

export type CrewId = "EV1" | "EV2";
export type Role = "planner" | "eva:EV1" | "eva:EV2" | "ops" | "earth";

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
  plan: PlanExport;
  /** Initial stop tasks, authored fields only; beside `plan` so `plan_hash` is unchanged (05 Scenario, FR-50, U-48). */
  stop_tasks?: StopTaskSeed[];
  crew: { crew_id: CrewId; suit_param_set: string; start_offset_s: number }[];
  vehicles: { vehicle_id: string; kind: VehicleKind; param_set: string; start_x_m: number; start_y_m: number }[];
  param_sets: string[];
  events: ScenarioEvent[];
  tables: { dose_series: { path: string; sha256: string }; earth_link: { path: string; sha256: string } };
  source_ids: string[];
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
}

export interface ClientConnection {
  client_id: string;
  role: Role;
  display_name: string;
  /** Wall-clock, diagnostics only; never logged. */
  connected_since: string;
  last_seq_acked: number;
}

export type CrewActivity = "IN_HAB" | "WALKING" | "AT_STOP" | "TO_HAVEN" | "SHELTERED";

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
  task: { kind: "SUMMON" | "SCOUT" | "CARRY" | "RELAY" | "RETURN"; target: { x_m: number; y_m: number }; crew_ids?: CrewId[] } | null;
  path: [number, number][];
  eta_s: number | null;
  /** Utility rover only. */
  battery_wh: number | null;
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
  /** The plan stop it belongs to (05: "POI id"; U-61). */
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
  | "ABORT"
  | "ACK_ALERT"
  | "APPROVE_OPTION"
  | "TASK_ROVER"
  | "SEND_MESSAGE"
  | "INJECT_EVENT"
  | "UPDATE_STOP_TASK"
  | "ADD_STOP_TASK";

export interface Command {
  command_id: string;
  role: Role;
  kind: CommandKind;
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
  | "VEHICLE_DISPATCHED"
  | "VEHICLE_ARRIVED"
  | "CREW_SHELTERED"
  | "LINK_LOST"
  | "LINK_RESTORED"
  | "EARTH_MSG_QUEUED"
  | "EARTH_MSG_DELIVERED"
  | "COMMAND_REJECTED"
  | "CLOCK_CHANGED"
  | "EVA_ENDED"
  | "TASK_ADDED"
  | "TASK_UPDATED"
  | "TASK_DROPPED";

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
}

export interface EarthMessage {
  message_id: string;
  direction: "to_earth" | "to_mars";
  body: string;
  sent_utc: string;
  deliver_utc: string;
  via: "mro" | "maven" | "tgo" | "dte";
  state: "QUEUED" | "IN_TRANSIT" | "DELIVERED";
  provenance: "simulated";
}

export interface LinkState {
  node_id: string;
  neighbors: string[];
  linked_to_hab: boolean;
  since_sim_time: string;
}
