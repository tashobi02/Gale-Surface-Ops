/**
 * T20.02: every mock WebSocket fixture is a valid sequence of protocol v0 ServerMessages.
 * Key tables are `Record<keyof T, true>` and enum tables `Record<Enum, true>`, so adding, removing
 * or renaming a field or enum member in packages/protocol fails `make typecheck` here until the
 * tables (and then the fixtures) follow (contract C13 drift).
 * Covered: every message; SNAPSHOT session, crew, vehicles, tasks, earth; LogEvent; options in
 * OPTIONS_PROPOSED; alert code and level in ALERT_RAISED; the `data` keys of every event against
 * `LogEventData` (05 "LogEvent `data` by kind", T20.11); `command_ref` of command-produced events.
 * Not covered: value types.
 */
import { describe, expect, it } from "vitest";
import type {
  AlertCode,
  AlertLevel,
  CommandResult,
  ContingencyOption,
  Crew,
  CrewActivity,
  LogEvent,
  LogEventData,
  LogEventKind,
  ServerMessage,
  Session,
  Snapshot,
  StopTask,
  StopTaskKind,
  StopTaskState,
  Vehicle,
  VehicleKind,
  VehicleState,
} from "@marswalk/protocol";
import { BEATS, wsFixtures } from "./index";

type Keys<T> = Record<keyof T, true>;
/** Every key of T, marked "req" or "opt" by whether T allows it to be absent. */
type KeySpec<T> = { [K in keyof T]-?: undefined extends T[K] ? "opt" : "req" };
type Msg<K extends ServerMessage["type"]> = Extract<ServerMessage, { type: K }>;

const MESSAGE_KEYS: { [K in Exclude<ServerMessage["type"], "COMMAND_RESULT">]: Keys<Msg<K>> } = {
  SNAPSHOT: { v: true, type: true, seq: true, sim_time: true, session: true, plan: true, crew: true, vehicles: true, alerts: true, options: true, tasks: true, earth: true, clients: true, provenance: true },
  STATE_DELTA: { v: true, type: true, seq: true, sim_time: true, changes: true },
  EVENT: { v: true, type: true, seq: true, sim_time: true, event: true },
  LINK_STATE: { v: true, type: true, seq: true, sim_time: true, crew_id: true, linked: true },
  PING: { v: true, type: true, seq: true, sim_time: true },
};
const RESULT_OK_KEYS: Keys<Extract<CommandResult, { ok: true }>> = { v: true, type: true, command_id: true, ok: true, event_seq: true };
const RESULT_FAIL_KEYS: Keys<Extract<CommandResult, { ok: false }>> = { v: true, type: true, command_id: true, ok: true, code: true, message: true };
const LOG_EVENT_KEYS: KeySpec<LogEvent> = { seq: "req", sim_time: "req", kind: "req", actor: "req", data: "req", provenance: "req", inputs_hash: "opt", command_ref: "req" };
const COMMAND_REF_KEYS: Keys<NonNullable<LogEvent["command_ref"]>> = { client_id: true, command_id: true };
const STOP = { crew_id: "req", stop_id: "req", stop_index: "req" } as const;
const LOG_EVENT_DATA_KEYS: { [K in LogEventKind]: KeySpec<LogEventData[K]> } = {
  SESSION_LOADED: { session_id: "req", scenario_id: "req", data_version: "req", seed: "req", plan_hash: "req" },
  EVA_STARTED: { crew_ids: "req", plan_revision: "req" },
  ARRIVED_STOP: STOP,
  LEFT_STOP: STOP,
  ALERT_RAISED: { alert_id: "req", code: "req", level: "req", subjects: "req", message: "req", rate_ugy_h: "opt", threshold_ugy_h: "opt", source: "opt",
    o2_remaining_min: "opt", haven_min: "opt", haven_kind: "opt", margin: "opt", threshold_margin: "opt", distance_m: "opt", threshold_m: "opt" },
  ALERT_ACKED: { alert_id: "req", acked_by: "req" },
  ALERT_CLEARED: { alert_id: "req" },
  OPTIONS_PROPOSED: { alert_id: "req", options: "req" },
  PLAN_REVISED: { plan_revision: "req", option_id: "req", stops_dropped: "req", waypoints: "req", legs: "req", plan: "opt" },
  VEHICLE_DISPATCHED: { vehicle_id: "req", option_id: "opt", rendezvous: "opt", task: "opt", target: "opt", item: "opt" },
  VEHICLE_ARRIVED: { vehicle_id: "req", x_m: "req", y_m: "req" },
  CREW_SHELTERED: { crew_id: "req", haven_kind: "req", dose_event_ugy: "req", dose_event_unsheltered_ugy: "req" },
  LINK_LOST: { node_id: "req" },
  LINK_RESTORED: { node_id: "req" },
  EARTH_MSG_QUEUED: { message_id: "req", direction: "req", body: "req", sent_utc: "req", deliver_utc: "req", via: "req" },
  EARTH_MSG_DELIVERED: { message_id: "req" },
  COMMAND_REJECTED: { code: "req", message: "req" },
  CLOCK_CHANGED: { speed: "req", paused: "req" },
  EVA_ENDED: { crew_ids: "req" },
  TASK_ADDED: { task_id: "req", stop_id: "req", crew_id: "req", kind: "req", text: "req", origin: "req" },
  TASK_UPDATED: { task_id: "req", stop_id: "req", crew_id: "req", state: "req", reason: "req", undo: "opt" },
  TASK_DROPPED: { task_id: "req", stop_id: "req", plan_revision: "req" },
};
const CREW_KEYS: Keys<Crew> = { crew_id: true, x_m: true, y_m: true, activity: true, stop_index: true, o2_frac: true, eva_elapsed_s: true, dose_event_ugy: true, dose_event_unsheltered_ugy: true, haven: true, linked: true, link_path: true, stale: true };
const TASK_KEYS: Keys<StopTask> = { task_id: true, stop_id: true, crew_id: true, kind: true, text: true, state: true, reason: true, origin: true, updated_sim_time: true, updated_by: true, provenance: true };
const SESSION_KEYS: Keys<Session> = { session_id: true, scenario_id: true, data_version: true, seed: true, status: true, clock: true, plan_revision: true, last_seq: true, log_hash: true };
const VEHICLE_KEYS: Keys<Vehicle> = { vehicle_id: true, kind: true, param_set: true, x_m: true, y_m: true, state: true, task: true, path: true, eta_s: true, battery_wh: true };
const EARTH_KEYS: Keys<Snapshot["earth"]> = { light_time_s: true, next_pass_utc: true, blackout: true, queue: true };
const OPTION_KEYS: Keys<ContingencyOption> = { option_id: true, alert_id: true, kind: true, crew_ids: true, eta_shelter_min: true, expected_dose_ugy: true, stops_dropped: true, violations: true, rank: true, path_preview: true, rendezvous: true };
const ACTIVITY: Record<CrewActivity, true> = { IN_HAB: true, WALKING: true, AT_STOP: true, TO_HAVEN: true, SHELTERED: true };
const SESSION_STATUS: Record<Session["status"], true> = { LOADED: true, RUNNING: true, PAUSED: true, ENDED: true };
const VEHICLE_KIND: Record<VehicleKind, true> = { pressurized_rover: true, utility_rover: true };
const VEHICLE_STATE: Record<VehicleState, true> = { PARKED: true, DISPATCHED: true, EN_ROUTE: true, ARRIVED: true, RETURNING: true, TASKED: true };
const TASK_KIND: Record<StopTaskKind, true> = { observe: true, image: true, sample: true, measure: true, deploy: true, other: true };
const TASK_STATE: Record<StopTaskState, true> = { TODO: true, DONE: true, SKIPPED: true, DROPPED: true };
const OPTION_KIND: Record<ContingencyOption["kind"], true> = { ABORT_TO_HAB: true, VEHICLE_RENDEZVOUS: true, TERRAIN_REFUGE: true, CONTINUE_SKIP: true };
const ALERT_LEVEL: Record<AlertLevel, true> = { warning: true, caution: true, advisory: true };
const ALERT_CODE: Record<AlertCode, true> = { RADIATION_ALERT: true, HAVEN_TIME_EXCEEDED: true, CONSUMABLES_LOW: true, COMM_SHADOW: true, LINK_LOST: true, BUDDY_SEPARATION: true, EARTH_FORECAST: true, ADVISORY: true, INJECTED: true };
const LOG_EVENT_KINDS: Record<LogEventKind, true> = {
  SESSION_LOADED: true, EVA_STARTED: true, ARRIVED_STOP: true, LEFT_STOP: true, ALERT_RAISED: true, ALERT_ACKED: true,
  ALERT_CLEARED: true, OPTIONS_PROPOSED: true, PLAN_REVISED: true, VEHICLE_DISPATCHED: true, VEHICLE_ARRIVED: true,
  CREW_SHELTERED: true, LINK_LOST: true, LINK_RESTORED: true, EARTH_MSG_QUEUED: true, EARTH_MSG_DELIVERED: true,
  COMMAND_REJECTED: true, CLOCK_CHANGED: true, EVA_ENDED: true, TASK_ADDED: true, TASK_UPDATED: true, TASK_DROPPED: true,
};

function expectExactKeys(obj: object, keys: object, where: string): void {
  expect(Object.keys(obj).sort(), where).toEqual(Object.keys(keys).sort());
}

/** Every "req" key present, and no key outside the spec. */
function expectSpecKeys(obj: object, spec: Record<string, "req" | "opt">, where: string): void {
  const keys = Object.keys(obj);
  for (const [k, r] of Object.entries(spec)) if (r === "req") expect(keys, `${where} has ${k}`).toContain(k);
  for (const k of keys) expect(Object.keys(spec), `${where} key ${k} is in the spec`).toContain(k);
}

function expectMember(value: unknown, members: object, where: string): void {
  expect(Object.keys(members), where).toContain(value);
}

function checkMessage(m: ServerMessage, where: string): void {
  expect(m.v, where).toBe(1);
  if (m.type === "COMMAND_RESULT") {
    expectExactKeys(m, m.ok ? RESULT_OK_KEYS : RESULT_FAIL_KEYS, where);
    return;
  }
  expect(Object.keys(MESSAGE_KEYS), where).toContain(m.type);
  expectExactKeys(m, MESSAGE_KEYS[m.type], where);
  if (m.type === "EVENT") {
    expectSpecKeys(m.event, LOG_EVENT_KEYS, `${where} event`);
    expect(Object.keys(LOG_EVENT_KINDS), where).toContain(m.event.kind);
    expectSpecKeys(m.event.data, LOG_EVENT_DATA_KEYS[m.event.kind], `${where} ${m.event.kind} data`);
    if (m.event.command_ref) expectExactKeys(m.event.command_ref, COMMAND_REF_KEYS, `${where} command_ref`);
    if (m.event.actor === "system") expect(m.event.command_ref ?? null, `${where} system event has no command_ref`).toBeNull();
    expect(m.event.seq, `${where} event.seq equals message seq`).toBe(m.seq);
    const data = m.event.data as Record<string, unknown>;
    if (m.event.kind === "ALERT_RAISED") {
      expectMember(data.code, ALERT_CODE, `${where} alert code`);
      expectMember(data.level, ALERT_LEVEL, `${where} alert level`);
    }
    if (m.event.kind === "OPTIONS_PROPOSED") {
      (data.options as ContingencyOption[]).forEach((o, i) => {
        expectExactKeys(o, OPTION_KEYS, `${where} options[${i}]`);
        expectMember(o.kind, OPTION_KIND, `${where} options[${i}].kind`);
      });
    }
  }
  if (m.type === "LINK_STATE") expect(["EV1", "EV2"], where).toContain(m.crew_id);
  if (m.type === "SNAPSHOT") checkSnapshot(m, where);
}

function checkSnapshot(s: Snapshot, where: string): void {
  expectExactKeys(s.session, SESSION_KEYS, `${where} session`);
  expectMember(s.session.status, SESSION_STATUS, `${where} session.status`);
  expectExactKeys(s.earth, EARTH_KEYS, `${where} earth`);
  s.crew.forEach((c, i) => {
    expectExactKeys(c, CREW_KEYS, `${where} crew[${i}]`);
    expectMember(c.activity, ACTIVITY, `${where} crew[${i}].activity`);
  });
  s.vehicles.forEach((v, i) => {
    expectExactKeys(v, VEHICLE_KEYS, `${where} vehicles[${i}]`);
    expectMember(v.kind, VEHICLE_KIND, `${where} vehicles[${i}].kind`);
    expectMember(v.state, VEHICLE_STATE, `${where} vehicles[${i}].state`);
  });
  s.tasks.forEach((t, i) => {
    expectExactKeys(t, TASK_KEYS, `${where} tasks[${i}]`);
    expectMember(t.kind, TASK_KIND, `${where} tasks[${i}].kind`);
    expectMember(t.state, TASK_STATE, `${where} tasks[${i}].state`);
    expect(t.text.length, `${where} tasks[${i}].text ≤ 60 chars (05 StopTask)`).toBeLessThanOrEqual(60);
  });
  // Fixture convention: a SNAPSHOT is current as of its own seq (02 §E.6 gives no explicit rule).
  expect(s.session.last_seq, `${where} SNAPSHOT seq equals session.last_seq`).toBe(s.seq);
}

describe("mock WebSocket fixtures (T20.02, F7)", () => {
  it("has one non-empty file per demo beat", () => {
    expect(Object.keys(wsFixtures).sort()).toEqual([...BEATS].sort());
    for (const beat of BEATS) expect(wsFixtures[beat].length, beat).toBeGreaterThan(0);
  });

  it.each(BEATS)("%s: every message is a protocol v0 ServerMessage", (beat) => {
    wsFixtures[beat].forEach((m, i) => checkMessage(m, `${beat}[${i}]`));
  });

  it("every COMMAND_RESULT points at an EVENT in the same beat", () => {
    for (const beat of BEATS) {
      const msgs = wsFixtures[beat];
      for (const m of msgs) {
        if (m.type !== "COMMAND_RESULT" || !m.ok) continue;
        const seqs = msgs.flatMap((e) => (e.type === "EVENT" ? [e.seq] : []));
        expect(seqs, `${beat} ${m.command_id}`).toContain(m.event_seq);
        const ev = msgs.find((e) => e.type === "EVENT" && e.seq === m.event_seq);
        const ref = ev?.type === "EVENT" ? ev.event.command_ref : undefined;
        expect(ref?.command_id, `${beat} event ${m.event_seq} command_ref (05 LogEvent)`).toBe(m.command_id);
      }
    }
  });
});
