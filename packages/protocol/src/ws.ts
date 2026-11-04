/**
 * Hab Core WebSocket protocol, version 1 (docs/specs/02 §E.6). Every message carries `v`;
 * server messages carry `seq` and `sim_time`. Roles and permissions: 02 §E.4.
 */
import type {
  Alert,
  ClientConnection,
  Command,
  ContingencyOption,
  Crew,
  EarthMessage,
  LogEvent,
  ProvenanceMap,
  Role,
  Session,
  Vehicle,
} from "./runtime";
import type { PlanExport } from "./schema";

export const PROTOCOL_VERSION = 1 as const;
/** Server heartbeat interval and client "HAB LINK LOST" threshold (02 §E.6, FR-32). */
export const HEARTBEAT_MS = 2000;
export const LINK_LOST_AFTER_MS = 3000;
/** Above this many missed events the server sends a fresh SNAPSHOT instead of replaying. */
export const MAX_REPLAY_GAP = 1000;

export interface Hello {
  v: typeof PROTOCOL_VERSION;
  type: "HELLO";
  role: Role;
  client_id: string;
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
  earth: { light_time_s: number; next_pass_utc: string | null; blackout: boolean; queue: EarthMessage[] };
  clients: Pick<ClientConnection, "client_id" | "role" | "display_name">[];
  provenance: ProvenanceMap;
}

export interface StateDelta {
  v: typeof PROTOCOL_VERSION;
  type: "STATE_DELTA";
  seq: number;
  sim_time: string;
  /** Path syntax: "crew/EV1/x_m". */
  changes: { path: string; value: unknown }[];
}

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
  crew_id: string;
  linked: boolean;
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

export interface Ping {
  v: typeof PROTOCOL_VERSION;
  type: "PING";
  seq: number;
  sim_time: string;
}

export type ClientMessage = Hello | CommandMessage;
export type ServerMessage = Snapshot | StateDelta | EventMessage | LinkStateMessage | CommandResult | Ping;

/** Role → allowed command kinds (02 §E.4). `self` restrictions are checked by the Hab Core. */
export const PERMISSIONS: Record<Role, readonly Command["kind"][]> = {
  planner: ["PUBLISH_PLAN"],
  "eva:EV1": ["SUMMON_VEHICLE", "ABORT", "ACK_ALERT", "TASK_ROVER", "SEND_MESSAGE"],
  "eva:EV2": ["SUMMON_VEHICLE", "ABORT", "ACK_ALERT", "TASK_ROVER", "SEND_MESSAGE"],
  ops: [
    "LOAD_SCENARIO",
    "SET_CLOCK",
    "JUMP_NEXT_EVENT",
    "PUBLISH_PLAN",
    "START_EVA",
    "APPROVE_OPTION",
    "SUMMON_VEHICLE",
    "ABORT",
    "ACK_ALERT",
    "TASK_ROVER",
    "SEND_MESSAGE",
    "INJECT_EVENT",
  ],
  earth: ["SEND_MESSAGE"],
};
