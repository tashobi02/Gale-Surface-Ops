/**
 * T20.02: every mock WebSocket fixture is a valid sequence of protocol v0 ServerMessages.
 * The key tables are `Record<keyof T, true>`, so adding, removing or renaming a field in
 * packages/protocol fails `make typecheck` here until the fixtures follow (contract C13 drift).
 */
import { describe, expect, it } from "vitest";
import type { CommandResult, Crew, LogEvent, LogEventKind, ServerMessage, Snapshot, StopTask } from "@marswalk/protocol";
import { BEATS, wsFixtures } from "./index";

type Keys<T> = Record<keyof T, true>;
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
const LOG_EVENT_KEYS: Omit<Keys<LogEvent>, "inputs_hash"> = { seq: true, sim_time: true, kind: true, actor: true, data: true, provenance: true };
const CREW_KEYS: Keys<Crew> = { crew_id: true, x_m: true, y_m: true, activity: true, stop_index: true, o2_frac: true, eva_elapsed_s: true, dose_event_ugy: true, dose_event_unsheltered_ugy: true, haven: true, linked: true, link_path: true, stale: true };
const TASK_KEYS: Keys<StopTask> = { task_id: true, stop_id: true, crew_id: true, kind: true, text: true, state: true, reason: true, origin: true, updated_sim_time: true, updated_by: true, provenance: true };
const LOG_EVENT_KINDS: Record<LogEventKind, true> = {
  SESSION_LOADED: true, EVA_STARTED: true, ARRIVED_STOP: true, LEFT_STOP: true, ALERT_RAISED: true, ALERT_ACKED: true,
  ALERT_CLEARED: true, OPTIONS_PROPOSED: true, PLAN_REVISED: true, VEHICLE_DISPATCHED: true, VEHICLE_ARRIVED: true,
  CREW_SHELTERED: true, LINK_LOST: true, LINK_RESTORED: true, EARTH_MSG_QUEUED: true, EARTH_MSG_DELIVERED: true,
  COMMAND_REJECTED: true, CLOCK_CHANGED: true, EVA_ENDED: true, TASK_ADDED: true, TASK_UPDATED: true, TASK_DROPPED: true,
};

function expectExactKeys(obj: object, keys: object, where: string): void {
  expect(Object.keys(obj).sort(), where).toEqual(Object.keys(keys).sort());
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
    expectExactKeys(m.event, LOG_EVENT_KEYS, `${where} event`);
    expect(Object.keys(LOG_EVENT_KINDS), where).toContain(m.event.kind);
    expect(m.event.seq, `${where} event.seq equals message seq`).toBe(m.seq);
  }
  if (m.type === "LINK_STATE") expect(["EV1", "EV2"], where).toContain(m.crew_id);
  if (m.type === "SNAPSHOT") checkSnapshot(m, where);
}

function checkSnapshot(s: Snapshot, where: string): void {
  s.crew.forEach((c, i) => expectExactKeys(c, CREW_KEYS, `${where} crew[${i}]`));
  s.tasks.forEach((t, i) => {
    expectExactKeys(t, TASK_KEYS, `${where} tasks[${i}]`);
    expect(t.text.length, `${where} tasks[${i}].text ≤ 60 chars (05 StopTask)`).toBeLessThanOrEqual(60);
  });
  expect(s.session.last_seq, `${where} SNAPSHOT seq equals session.last_seq (02 §E.6 HELLO last_seq 0)`).toBe(s.seq);
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
      }
    }
  });
});
