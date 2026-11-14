/**
 * Hab Core WebSocket protocol, wire version 1 (docs/specs/02 §E.6). Every message carries `v`;
 * server messages carry `seq` and `sim_time` (COMMAND_RESULT excepted, as in the 02 §E.6 example).
 * Roles and permissions: 02 §E.4.
 *
 * Protocol v0 — freeze date 2026-11-07 (M1; T20.01, contract C13). After the freeze, changes go
 * through a `contract-change:` subtask in TASK-20. Differences from the 02 §E.6 examples, decided
 * 2026-11-06 (a 02 spec-change aligns the examples):
 * - COMMAND per-kind fields nested in `command.args` (05 Command);
 * - HELLO carries `display_name` (02 §E.4);
 * - SNAPSHOT crew `haven` is nested (05 Crew), not `haven_min`/`haven_kind`;
 * - SNAPSHOT `earth` is top level with `queue` (02 shows `link.earth`; 05 defines no SNAPSHOT);
 * - EVENT alert fields sit in `event.data` with `level` (05 Alert), not `code`/`severity` on the event.
 *
 * Protocol v0.2 (2026-11-12, T32.01; docs/plan/backend/01-contract.md): additive. SNAPSHOT gains `conditions`,
 * `task_library`, `event_library`, `next_stop_target`; PERMISSIONS gains `presenter` and the live-session commands;
 * LINK_STATE gains `link_hops` and `link_via`. `PROTOCOL_VERSION` stays 1.
 */
import type {
  Alert,
  ClientConnection,
  Command,
  ConditionsState,
  ContingencyOption,
  Crew,
  CrewId,
  EarthMessage,
  EventLibrarySummary,
  LogEvent,
  ProvenanceMap,
  Role,
  Session,
  StopTask,
  TaskLibraryEntry,
  Vehicle,
} from "./runtime";
import type { PlanExport } from "./schema";

export const PROTOCOL_VERSION = 1 as const;
/** Server heartbeat interval and client "HAB LINK LOST" threshold (02 §E.6, FR-32). */
export const HEARTBEAT_MS = 2000;
export const LINK_LOST_AFTER_MS = 3000;
/**
 * Reconnect (02 §E.6, changed 2026-11-07): the server always sends a fresh SNAPSHOT first, then the
 * EVENTs after the HELLO `last_seq`; above this many missed events it sends the SNAPSHOT only.
 * Replayed EVENTs are at or below the SNAPSHOT's seq: they fill the event feed, not state.
 */
export const MAX_REPLAY_GAP = 1000;

export interface Hello {
  v: typeof PROTOCOL_VERSION;
  type: "HELLO";
  role: Role;
  client_id: string;
  /** 02 §E.4: a client joins with a role and a display name (shown in SNAPSHOT `clients`). */
  display_name: string;
  last_seq: number;
}

export interface Snapshot {
  v: typeof PROTOCOL_VERSION;
  type: "SNAPSHOT";
  seq: number;
  sim_time: string;
  session: Session;
  plan: PlanExport | null;
  crew: Crew[];
  vehicles: Vehicle[];
  alerts: Alert[];
  options: ContingencyOption[];
  /** Current stop tasks (02 §E.6, FR-50). */
  tasks: StopTask[];
  earth: {
    light_time_s: number;
    next_pass_utc: string | null;
    blackout: boolean;
    queue: EarthMessage[];
    /** Whether the link carries a message now: `AVAILABLE` (an orbiter pass or DTE), `WAITING` (between passes), `BLACKOUT` (conjunction); null before the Earth table starts (N-31, BD-156). Derived by compute `earthLinkState`. */
    link_state?: "AVAILABLE" | "WAITING" | "BLACKOUT" | null;
    /** The carrier of an AVAILABLE link; null otherwise. */
    link_via?: "mro" | "maven" | "tgo" | "dte" | null;
    /** End of the relay pass that carries an AVAILABLE link; null for DTE, WAITING and BLACKOUT. */
    link_until_utc?: string | null;
    /** Source reference for this snapshot field, supplied by the Hab Core transport (N-31, BD-166). */
    link_source_id?: string;
  };
  clients: Pick<ClientConnection, "client_id" | "role" | "display_name">[];
  provenance: ProvenanceMap;
  /** FR-36 conditions at the hab (BD-75); deltas at `conditions/<key>`. */
  conditions: ConditionsState;
  /** The scenario's task library, `[]` when it has none; static, sent to every role (BD-90). */
  task_library: TaskLibraryEntry[];
  /** Summaries of the scenario's event library; started ones are in `Session.started_events` (BD-104). */
  event_library: EventLibrarySummary[];
  /** The crew-wide next stop of 02 §D.17, computed by the engine; null with no plan or no stop left (BD-104). */
  next_stop_target: { stop_id: string; stop_index: number } | null;
}

export interface StateDelta {
  v: typeof PROTOCOL_VERSION;
  type: "STATE_DELTA";
  seq: number;
  sim_time: string;
  /** Path syntax: "crew/EV1/x_m". */
  changes: { path: string; value: unknown }[];
}

/** `event.data` carries the event's values; for `ALERT_RAISED` the Alert fields (`code`, `level`, …; 05 Alert). */
export interface EventMessage {
  v: typeof PROTOCOL_VERSION;
  type: "EVENT";
  seq: number;
  sim_time: string;
  event: LogEvent;
}

/** Sent once to a suit's device when its simulated surface link changes (02 §A.5). */
export interface LinkStateMessage {
  v: typeof PROTOCOL_VERSION;
  type: "LINK_STATE";
  seq: number;
  sim_time: string;
  crew_id: CrewId;
  linked: boolean;
  /** Same meaning as on Crew (BD-103, N-04). Optional until the link module fills them (work package 17). */
  link_hops?: number | null;
  link_via?: Crew["link_via"];
}

export interface CommandMessage {
  v: typeof PROTOCOL_VERSION;
  type: "COMMAND";
  command_id: string;
  role: Role;
  command: Pick<Command, "kind" | "args" | "queued_offline">;
}

export type RejectCode = "FORBIDDEN_ROLE" | "NO_LINK" | "INVALID" | "NO_RENDEZVOUS" | "BUSY";

export type CommandResult =
  | { v: typeof PROTOCOL_VERSION; type: "COMMAND_RESULT"; command_id: string; ok: true; event_seq: number }
  | { v: typeof PROTOCOL_VERSION; type: "COMMAND_RESULT"; command_id: string; ok: false; code: RejectCode; message: string };

/**
 * Sent once to a client whose role a newer client took over (02 §E.4, §E.6; added 2026-11-12, Proposed), just before the
 * Hab Core closes its socket with close code `TAKEN_OVER_CLOSE_CODE`. The client must not reconnect by itself.
 */
export interface TakenOverMessage {
  v: typeof PROTOCOL_VERSION;
  type: "TAKEN_OVER";
  seq: number;
  sim_time: string;
  /** The role that was lost. */
  role: Role;
}

/** WebSocket close code (application range) of a socket closed because its role was taken over (02 §E.6). */
export const TAKEN_OVER_CLOSE_CODE = 4001;
/** Its close reason. */
export const TAKEN_OVER_CLOSE_REASON = "taken over";

export interface Ping {
  v: typeof PROTOCOL_VERSION;
  type: "PING";
  seq: number;
  sim_time: string;
}

export type ClientMessage = Hello | CommandMessage;
export type ServerMessage = Snapshot | StateDelta | EventMessage | LinkStateMessage | TakenOverMessage | CommandResult | Ping;

/**
 * Role → allowed command kinds (02 §E.4). `self` restrictions are checked by the Hab Core,
 * including UPDATE_STOP_TASK "own tasks" for EVA roles (FR-50).
 */
export const PERMISSIONS: Record<Role, readonly Command["kind"][]> = {
  // The presenter drives the live session; no crew or planner action (02 §E.4, 2026-11-10, Proposed).
  presenter: ["LOAD_SCENARIO", "SET_CLOCK", "JUMP_NEXT_EVENT", "JUMP_NEXT_STOP", "START_EVENT", "RESET_SESSION"],
  planner: ["PUBLISH_PLAN"],
  "eva:EV1": ["SUMMON_VEHICLE", "RIDE_VEHICLE", "ABORT", "ACK_ALERT", "TASK_ROVER", "SEND_MESSAGE", "UPDATE_STOP_TASK", "SET_CREW_MOTION"],
  "eva:EV2": ["SUMMON_VEHICLE", "RIDE_VEHICLE", "ABORT", "ACK_ALERT", "TASK_ROVER", "SEND_MESSAGE", "UPDATE_STOP_TASK", "SET_CREW_MOTION"],
  // The HUD is a viewer: no command at all (02 §E.4, added 2026-11-12, Proposed).
  "hud:EV1": [],
  "hud:EV2": [],
  ops: [
    "LOAD_SCENARIO",
    "SET_CLOCK",
    "JUMP_NEXT_EVENT",
    "START_EVENT", // N-200, BD-165: OPS may start the same library storm as the presenter.
    "PUBLISH_PLAN",
    "START_EVA",
    "APPROVE_OPTION",
    "SUMMON_VEHICLE",
    "RIDE_VEHICLE",
    "ABORT",
    "ACK_ALERT",
    "TASK_ROVER",
    "SEND_MESSAGE",
    // Not in the 02 §E.4 table; ops-only per 05 Command and TASK-23. The 02 spec-change adds the row.
    "INJECT_EVENT",
    "UPDATE_STOP_TASK",
    "ADD_STOP_TASK",
    // Ops only (02 §D.17, 2026-11-10, Proposed).
    "SELECT_HAB_SITE",
    "SET_MISSION_SETUP",
    // Simulation control (02 §E.6, 2026-11-13, Proposed): ops for either crew member; an EVA role only for itself.
    "SET_CREW_MOTION",
  ],
  earth: ["SEND_MESSAGE"],
};
