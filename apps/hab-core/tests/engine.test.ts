/**
 * T22.05: reducer, event log, `log_hash`, snapshots and determinism (docs/specs/02 §A.6, §D.14,
 * §F.2 Engine; 05 §B session store, LogEvent; FR-34, NFR-06, NFR-10, NFR-14). TASK-22.
 *
 * Runs on the fake scenario (F8, T22.02). The scenario loader (T22.11) is not written yet, so the
 * test reads the fixture files itself. A "run" here is a fixed, scripted event sequence on that
 * scenario (no ticks: crew motion needs T22.09); the full headless determinism check over the real
 * scenario is T22.14.
 *
 * Rules these tests fix for T22.06 (reducer) and T22.07 (log), proposed 2026-11-07 by the owner:
 * - `log_hash` = SHA-256 (hex) of the bytes of `session.jsonl`, where each line is the RFC 8785
 *   canonical JSON of one LogEvent followed by "\n" (02 §A.6 "SHA-256 of the canonical event log";
 *   05 Session, RFC 8785 decided 2026-11-07). An empty log hashes the empty string.
 * - The reducer sets `session.last_seq` and `session.clock.sim_time` from every event it applies;
 *   `session.log_hash` is filled by the session manager (T22.12), not by the reducer.
 * - Warnings and cautions latch: an alert leaves `alerts` only when it is both acknowledged and
 *   cleared; an advisory leaves on clear (03 §E.7).
 * - Executing a rendezvous option logs VEHICLE_DISPATCHED, then PLAN_REVISED: the dispatch reads the
 *   option's crew, and the revision removes the alert's options.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DoseSeries,
  EarthLinkTable,
  LogEvent,
  LogEventData,
  LogEventKind,
  ParamSet,
  ProvenanceMap,
  Role,
  Scenario,
} from "@marswalk/protocol";
import { canonicalJson, openLog, resumeLog, SNAPSHOT_EVERY } from "../src/log";
import { initialState, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { LoadedScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function loadFakeScenario(): LoadedScenario {
  const scenario = readJson<Scenario>(join(fixtureDir, "scenario.json"));
  const params: Record<string, ParamSet> = {};
  for (const id of scenario.param_sets) params[id] = readJson<ParamSet>(join(fixtureDir, "param_sets", `${id}.json`));
  return {
    scenario,
    dose: readJson<DoseSeries>(join(fixtureDir, scenario.tables.dose_series.path)),
    earthLink: readJson<EarthLinkTable>(join(fixtureDir, scenario.tables.earth_link.path)),
    params,
    grid: null,
    comm: null,
  };
}

const fake = loadFakeScenario();
const SESSION_ID = "s-0001";

const dirs: string[] = [];
function tempSessionDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "marswalk-engine-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A pending event with its `data` typed by kind (05 "LogEvent `data` by kind"). */
function ev<K extends LogEventKind>(
  kind: K,
  sim_time: string,
  data: LogEventData[K],
  actor: Role | "system" = "system",
  provenance: ProvenanceMap = {},
): PendingEvent {
  return { sim_time, kind, actor, data: data as Record<string, unknown>, provenance };
}

const T0 = fake.scenario.start_utc; // 2024-05-20T00:00:00Z
const at = (s: number): string => new Date(Date.parse(T0) + s * 1000).toISOString().replace(".000Z", "Z");

/** The scripted run: load, walk to stop 1, radiation alert, summon, shelter, clear, end (no TASK_*: T31.04). */
function scriptedRun(): PendingEvent[] {
  const s = fake.scenario;
  return [
    ev("SESSION_LOADED", at(0), { session_id: SESSION_ID, scenario_id: s.scenario_id, data_version: s.data_version, seed: s.seed, plan_hash: s.plan.plan_hash }),
    ev("CLOCK_CHANGED", at(0), { speed: 60, paused: false }, "ops"),
    ev("EVA_STARTED", at(0), { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops"),
    ev("ARRIVED_STOP", at(1091), { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
    ev("ARRIVED_STOP", at(1091), { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 }),
    ev("LEFT_STOP", at(2291), { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
    ev(
      "ALERT_RAISED",
      at(3600),
      { alert_id: "a-7", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now", rate_ugy_h: 0.5, threshold_ugy_h: 0.25, source: "replayed:fixture-synthetic" },
      "system",
      { "data.rate_ugy_h": "replayed", "data.threshold_ugy_h": "assumed" },
    ),
    ev("OPTIONS_PROPOSED", at(3600), {
      alert_id: "a-7",
      options: [
        { option_id: "o1", alert_id: "a-7", kind: "VEHICLE_RENDEZVOUS", crew_ids: ["EV1", "EV2"], eta_shelter_min: 12.5, expected_dose_ugy: 0.1, stops_dropped: [2], violations: [], rank: 1, path_preview: [[1000, 0], [500, 0]], rendezvous: { x_m: 500, y_m: 0, eta_crew_s: 600, eta_vehicle_s: 540 } },
        { option_id: "o2", alert_id: "a-7", kind: "ABORT_TO_HAB", crew_ids: ["EV1", "EV2"], eta_shelter_min: 18.2, expected_dose_ugy: 0.15, stops_dropped: [2], violations: [], rank: 2, path_preview: [[1000, 0], [0, 0]], rendezvous: null },
      ],
    }),
    ev("ALERT_ACKED", at(3610), { alert_id: "a-7", acked_by: "eva:EV1" }, "eva:EV1"),
    ev("VEHICLE_DISPATCHED", at(3615), { vehicle_id: "PR1", option_id: "o1", rendezvous: { x_m: 500, y_m: 0, eta_crew_s: 600, eta_vehicle_s: 540 } }, "eva:EV1"),
    ev("PLAN_REVISED", at(3615), { plan_revision: 2, option_id: "o1", stops_dropped: [2] }, "eva:EV1"),
    ev("VEHICLE_ARRIVED", at(4155), { vehicle_id: "PR1", x_m: 500, y_m: 0 }),
    ev("CREW_SHELTERED", at(4215), { crew_id: "EV1", haven_kind: "vehicle", dose_event_ugy: 0.08, dose_event_unsheltered_ugy: 0.5 }),
    ev("CREW_SHELTERED", at(4215), { crew_id: "EV2", haven_kind: "vehicle", dose_event_ugy: 0.09, dose_event_unsheltered_ugy: 0.5 }),
    ev("LINK_LOST", at(4300), { node_id: "EV2" }),
    ev("LINK_RESTORED", at(4320), { node_id: "EV2" }),
    ev("COMMAND_REJECTED", at(4330), { code: "INVALID", message: "Unknown task" }, "eva:EV2"),
    ev("ALERT_CLEARED", at(7200), { alert_id: "a-7" }),
    ev("CLOCK_CHANGED", at(7200), { speed: 60, paused: true }, "ops"),
    ev("EVA_ENDED", at(7200), { crew_ids: ["EV1", "EV2"] }, "ops"),
  ];
}

/** Append every event and reduce it as the live session does; returns the live state. */
function runInto(dir: string, events: PendingEvent[]): { state: EngineState; log: ReturnType<typeof openLog> } {
  const log = openLog(dir);
  let state = initialState(fake, SESSION_ID);
  for (const pending of events) state = reduce(state, log.append(pending));
  return { state, log };
}

/** `n` filler events (CLOCK_CHANGED toggling speed) for the snapshot cadence tests. */
function filler(n: number, offset_s = 0): PendingEvent[] {
  return Array.from({ length: n }, (_, i) => ev("CLOCK_CHANGED", at(offset_s + i), { speed: i % 2 ? 10 : 60, paused: false }, "ops"));
}

const readLines = (dir: string): LogEvent[] =>
  readFileSync(join(dir, "session.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as LogEvent);

function fold(events: LogEvent[], from: EngineState = initialState(fake, SESSION_ID)): EngineState {
  return events.reduce(reduce, from);
}

// ---------------------------------------------------------------------------
// Event log (T22.07)
// ---------------------------------------------------------------------------

describe("event log (05 §B session store, LogEvent)", () => {
  it("seq is monotonic and gap-free, starting at 1", () => {
    const { log } = runInto(tempSessionDir(), scriptedRun());
    const seqs = log.after(0).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: scriptedRun().length }, (_, i) => i + 1));
    expect(log.lastSeq()).toBe(seqs.length);
  });

  it("after(seq) returns the events after seq, in order, as appended", () => {
    const dir = tempSessionDir();
    const log = openLog(dir);
    const appended = scriptedRun().map((p) => log.append(p));
    expect(log.after(5)).toEqual(appended.slice(5));
    expect(log.after(log.lastSeq())).toEqual([]);
    expect(appended[3]).toMatchObject({ ...scriptedRun()[3], seq: 4 });
  });

  it("writes one canonical JSON line per event to session.jsonl", () => {
    const dir = tempSessionDir();
    const { log } = runInto(dir, scriptedRun());
    const text = readFileSync(join(dir, "session.jsonl"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.slice(0, -1).split("\n");
    expect(lines).toHaveLength(log.lastSeq());
    lines.forEach((line, i) => expect(line).toBe(canonicalJson(log.after(i)[0])));
  });

  it("canonical JSON is RFC 8785: sorted keys, no whitespace, JavaScript number format", () => {
    expect(canonicalJson({ b: 1, a: [1.0, "x", null, true], c: { z: 0.1, y: -0 } })).toBe('{"a":[1,"x",null,true],"b":1,"c":{"y":0,"z":0.1}}');
    expect(canonicalJson([1e21, 1e-7, 123456789012345680000, 5e-324, 0.1 + 0.2])).toBe("[1e+21,1e-7,123456789012345680000,5e-324,0.30000000000000004]");
    // Keys sort by UTF-16 code units (RFC 8785 §3.2.3): "\u{1F600}" (surrogate D83D) sorts before "דּ".
    expect(canonicalJson({ "דּ": 1, "\u{1F600}": 2, a: 3, B: 4 })).toBe('{"B":4,"a":3,"\u{1F600}":2,"דּ":1}');
    expect(canonicalJson({ s: 'quote " and \\ and \n and \u0007' })).toBe(JSON.stringify({ s: 'quote " and \\ and \n and \u0007' }));
    // Properties whose value is undefined are left out, as JSON.stringify does.
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}');
  });

  it("log_hash is the SHA-256 of session.jsonl, updated on every append", () => {
    const dir = tempSessionDir();
    const log = openLog(dir);
    expect(log.hash()).toBe(sha256(""));
    for (const pending of scriptedRun().slice(0, 4)) {
      log.append(pending);
      expect(log.hash()).toBe(sha256(readFileSync(join(dir, "session.jsonl"), "utf8")));
    }
  });

  it(`writes snapshot-<seq>.json and meta.json when asked, every ${SNAPSHOT_EVERY} events (U-23)`, () => {
    expect(SNAPSHOT_EVERY).toBe(500);
    const dir = tempSessionDir();
    const log = openLog(dir);
    let state = initialState(fake, SESSION_ID);
    for (const pending of filler(1200)) {
      state = reduce(state, log.append(pending));
      if (log.lastSeq() % SNAPSHOT_EVERY === 0) log.snapshot(state);
    }
    const snapshots = readdirSync(dir).filter((f) => f.startsWith("snapshot-")).sort();
    expect(snapshots).toEqual(["snapshot-1000.json", "snapshot-500.json"]);
    expect(existsSync(join(dir, "meta.json"))).toBe(true);
    expect(readJson<EngineState>(join(dir, "snapshot-1000.json")).session.last_seq).toBe(1000);
  });

  it("resume reads the latest snapshot and the lines after it (NFR-10)", () => {
    const dir = tempSessionDir();
    const log = openLog(dir);
    let state = initialState(fake, SESSION_ID);
    let atSnapshot: EngineState | null = null;
    for (const pending of filler(1100)) {
      state = reduce(state, log.append(pending));
      if (log.lastSeq() % SNAPSHOT_EVERY === 0) {
        log.snapshot(state);
        atSnapshot = state;
      }
    }
    const resumed = resumeLog(dir);
    expect(resumed.state).toEqual(atSnapshot);
    expect(resumed.tail.map((e) => e.seq)).toEqual(Array.from({ length: 100 }, (_, i) => 1001 + i));
  });

  it("a resumed log continues seq and log_hash where it stopped", () => {
    const dir = tempSessionDir();
    const { log } = runInto(dir, scriptedRun().slice(0, 10));
    const hashBefore = log.hash();
    const resumed = resumeLog(dir);
    expect(resumed.state).toBeNull(); // no snapshot written yet
    expect(resumed.tail).toHaveLength(10);
    expect(resumed.log.lastSeq()).toBe(10);
    expect(resumed.log.hash()).toBe(hashBefore);
    const next = resumed.log.append(scriptedRun()[10]);
    expect(next.seq).toBe(11);
    expect(resumed.log.hash()).toBe(sha256(readFileSync(join(dir, "session.jsonl"), "utf8")));
  });
});

// ---------------------------------------------------------------------------
// Reducer (T22.06) and determinism
// ---------------------------------------------------------------------------

describe("engine determinism (02 §A.6, NFR-06, NFR-14)", () => {
  it("two headless runs of the same scenario + seed give the same log_hash", () => {
    const a = tempSessionDir();
    const b = tempSessionDir();
    const runA = runInto(a, scriptedRun());
    const runB = runInto(b, scriptedRun());
    expect(runA.log.hash()).toMatch(/^[0-9a-f]{64}$/);
    expect(runB.log.hash()).toBe(runA.log.hash());
    expect(readFileSync(join(b, "session.jsonl"))).toEqual(readFileSync(join(a, "session.jsonl")));
    expect(runB.state).toEqual(runA.state);
  });

  it("replaying session.jsonl over the initial state reproduces the live state", () => {
    const dir = tempSessionDir();
    const { state: live } = runInto(dir, scriptedRun());
    expect(fold(readLines(dir))).toEqual(live);
  });

  it("resume from the latest snapshot plus later events gives the same state", () => {
    const dir = tempSessionDir();
    const log = openLog(dir);
    let live = initialState(fake, SESSION_ID);
    for (const pending of [...filler(SNAPSHOT_EVERY), ...scriptedRun().slice(1)]) {
      live = reduce(live, log.append(pending));
      if (log.lastSeq() % SNAPSHOT_EVERY === 0) log.snapshot(live);
    }
    const resumed = resumeLog(dir);
    expect(resumed.state).not.toBeNull();
    expect(fold(resumed.tail, resumed.state!)).toEqual(live);
  });

  it("reduce is pure: it does not change its input state or event", () => {
    const state = initialState(fake, SESSION_ID);
    const before = structuredClone(state);
    const event: LogEvent = { ...scriptedRun()[2], seq: 1 };
    const eventBefore = structuredClone(event);
    const next = reduce(state, event);
    expect(state).toEqual(before);
    expect(event).toEqual(eventBefore);
    expect(next).not.toBe(state);
  });

  // Same rule as the T22.03 check in clock.test.ts: `new Date(x)` of a sim time is allowed, `new Date()` is not.
  it("no Date.now() / new Date() inside src/engine (static check)", () => {
    const engineDir = join(here, "../src/engine");
    const offenders = readdirSync(engineDir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bperformance\.now\s*\(/.test(readFileSync(join(engineDir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("reducer state transitions (03 §E.6–§E.10)", () => {
  /** State after the first `n` scripted events. */
  const after = (n: number): EngineState => fold(scriptedRun().slice(0, n).map((p, i) => ({ ...p, seq: i + 1 })));

  it("initial state: session LOADED at start_utc, crew IN_HAB at the plan start, vehicles PARKED at their starts", () => {
    const s = initialState(fake, SESSION_ID);
    expect(s.session).toMatchObject({ session_id: SESSION_ID, scenario_id: "fake-straight-line", data_version: "mock_site-fixture", seed: 4190, status: "LOADED", last_seq: 0 });
    expect(s.session.clock.sim_time).toBe(T0);
    expect(s.plan).toEqual(fake.scenario.plan);
    expect(s.crew.map((c) => [c.crew_id, c.activity, c.x_m, c.y_m, c.stop_index, c.linked])).toEqual([
      ["EV1", "IN_HAB", 0, 0, null, true],
      ["EV2", "IN_HAB", 0, 0, null, true],
    ]);
    expect(s.crew[0]).toMatchObject({ o2_frac: 1, eva_elapsed_s: 0, dose_event_ugy: 0, dose_event_unsheltered_ugy: 0, stale: false });
    expect(s.vehicles).toEqual([expect.objectContaining({ vehicle_id: "PR1", kind: "pressurized_rover", param_set: "pr1-assumed", x_m: 0, y_m: 0, state: "PARKED", task: null })]);
    expect([s.alerts, s.options, s.tasks, s.earthQueue]).toEqual([[], [], [], []]);
  });

  it("every event sets session.last_seq and session.clock.sim_time", () => {
    const s = after(4);
    expect(s.session.last_seq).toBe(4);
    expect(s.session.clock.sim_time).toBe(at(1091));
  });

  it("CLOCK_CHANGED sets speed and paused; EVA_STARTED makes the session RUNNING and the crew WALKING", () => {
    expect(after(2).session.clock).toMatchObject({ speed: 60, paused: false });
    const s = after(3);
    expect(s.session.status).toBe("RUNNING");
    expect(s.crew.map((c) => c.activity)).toEqual(["WALKING", "WALKING"]);
  });

  it("ARRIVED_STOP sets AT_STOP and stop_index; LEFT_STOP returns to WALKING", () => {
    const s = after(6);
    expect(s.crew.find((c) => c.crew_id === "EV1")).toMatchObject({ activity: "WALKING", stop_index: 1 });
    expect(s.crew.find((c) => c.crew_id === "EV2")).toMatchObject({ activity: "AT_STOP", stop_index: 1 });
  });

  it("ALERT_RAISED adds an alert with raised_seq; ALERT_ACKED sets acked_seq and acked_by", () => {
    expect(after(7).alerts).toEqual([
      expect.objectContaining({ alert_id: "a-7", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], raised_seq: 7, acked_seq: null, cleared_seq: null, acked_by: null }),
    ]);
    expect(after(7).alerts[0].data).toMatchObject({ rate_ugy_h: 0.5, threshold_ugy_h: 0.25 });
    expect(after(9).alerts[0]).toMatchObject({ acked_seq: 9, acked_by: "eva:EV1" });
  });

  it("OPTIONS_PROPOSED replaces the alert's options; executing one (PLAN_REVISED) sets plan_revision, sends its crew TO_HAVEN and clears the options", () => {
    expect(after(8).options.map((o) => o.option_id)).toEqual(["o1", "o2"]);
    const s = after(11);
    expect(s.session.plan_revision).toBe(2);
    expect(s.options).toEqual([]);
    expect(s.crew.map((c) => c.activity)).toEqual(["TO_HAVEN", "TO_HAVEN"]);
  });

  it("VEHICLE_DISPATCHED dispatches the vehicle to the rendezvous; VEHICLE_ARRIVED places it there", () => {
    expect(after(10).vehicles[0]).toMatchObject({ state: "DISPATCHED", task: { kind: "SUMMON", target: { x_m: 500, y_m: 0 }, crew_ids: ["EV1", "EV2"] }, eta_s: 540 });
    expect(after(12).vehicles[0]).toMatchObject({ state: "ARRIVED", x_m: 500, y_m: 0 });
  });

  it("a VEHICLE_DISPATCHED from TASK_ROVER sets the rover task with its target and CARRY item", () => {
    const base = after(3);
    const tasked = reduce(
      { ...base, vehicles: [...base.vehicles, { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", x_m: 0, y_m: 0, state: "PARKED", task: null, path: [], eta_s: null, battery_wh: null }] },
      { ...ev("VEHICLE_DISPATCHED", at(10), { vehicle_id: "UR1", task: "CARRY", target: { x_m: 900, y_m: 10 }, item: "sample bag" }, "ops"), seq: 4 },
    );
    expect(tasked.vehicles[1]).toMatchObject({ state: "TASKED", task: { kind: "CARRY", target: { x_m: 900, y_m: 10 }, item: "sample bag" } });
  });

  it("CREW_SHELTERED sets SHELTERED, the haven kind and both doses from the event", () => {
    expect(after(13).crew[0]).toMatchObject({ activity: "SHELTERED", dose_event_ugy: 0.08, dose_event_unsheltered_ugy: 0.5, haven: expect.objectContaining({ kind: "vehicle" }) });
  });

  it("LINK_LOST marks the crew member unlinked and stale; LINK_RESTORED reverses it (03 §E.10)", () => {
    expect(after(15).crew[1]).toMatchObject({ linked: false, stale: true });
    expect(after(16).crew[1]).toMatchObject({ linked: true, stale: false });
  });

  it("COMMAND_REJECTED changes nothing but last_seq and sim_time", () => {
    const strip = (s: EngineState): EngineState => ({ ...s, session: { ...s.session, last_seq: 0, clock: { ...s.session.clock, sim_time: "" } } });
    expect(strip(after(17))).toEqual(strip(after(16)));
  });

  it("a warning latches until it is acknowledged and cleared (03 §E.7)", () => {
    expect(after(18).alerts).toEqual([]); // acked at 9, cleared at 18
    const unacked = fold(
      [scriptedRun()[6], ev("ALERT_CLEARED", at(3700), { alert_id: "a-7" })].map((p, i) => ({ ...p, seq: i + 1 })),
    );
    expect(unacked.alerts).toEqual([expect.objectContaining({ alert_id: "a-7", cleared_seq: 2, acked_seq: null })]);
    const acked = reduce(unacked, { ...ev("ALERT_ACKED", at(3710), { alert_id: "a-7", acked_by: "ops" }, "ops"), seq: 3 });
    expect(acked.alerts).toEqual([]);
  });

  it("an advisory leaves the alert list when cleared, acknowledged or not", () => {
    const s = fold(
      [
        ev("ALERT_RAISED", at(10), { alert_id: "a-1", code: "ADVISORY", level: "advisory", subjects: [], message: "Earth forecast received" }),
        ev("ALERT_CLEARED", at(20), { alert_id: "a-1" }),
      ].map((p, i) => ({ ...p, seq: i + 1 })),
    );
    expect(s.alerts).toEqual([]);
  });

  it("CLOCK_CHANGED paused pauses a running session; EVA_ENDED ends it (03 §E.6)", () => {
    expect(after(19).session.status).toBe("PAUSED");
    expect(after(20).session.status).toBe("ENDED");
  });

  it("EARTH_MSG_QUEUED adds a QUEUED message; EARTH_MSG_DELIVERED marks it DELIVERED", () => {
    const s = fold(
      [
        ev("EARTH_MSG_QUEUED", at(3600), { message_id: "m-1", direction: "to_mars", body: "SEP event in progress. Recommend shelter.", sent_utc: at(3600), deliver_utc: at(4800), via: "dte" }, "system", { deliver_utc: "derived" }),
        ev("EARTH_MSG_DELIVERED", at(4800), { message_id: "m-1" }),
      ].map((p, i) => ({ ...p, seq: i + 1 })),
    );
    expect(s.earthQueue).toEqual([expect.objectContaining({ message_id: "m-1", state: "DELIVERED", via: "dte", deliver_utc: at(4800) })]);
  });
});

describe("alerts", () => {
  it.todo("RADIATION_ALERT fires at the first sample satisfying the trigger");
  it.todo("warnings latch until acknowledged and cleared (03 §E.7)");
});
