/**
 * Backend package 01a (T32.01; contract change C13 v0 -> v0.2, docs/plan/backend/01-contract.md §1-§7).
 * Two parts: compile-time checks of every new protocol name (`expectTypeOf`, enforced by `make typecheck`),
 * and run-time checks of the five new reducer cases and the rover queue cases (pure, 02 §A.6).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  CommandKind,
  ConditionsState,
  Crew,
  DoseSeries,
  EarthLinkTable,
  EventLibraryEntry,
  EventLibrarySummary,
  GridLoaded,
  LoadGridRequest,
  LogEvent,
  LogEventData,
  LogEventKind,
  ManualLegResult,
  MissionSetup,
  ParamSet,
  QueuedRoverTask,
  Role,
  Scenario,
  Session,
  Snapshot,
  TaskLibraryEntry,
  ValidateManualLegRequest,
  Vehicle,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";
import type {
  CommandArgs,
  CommandJournalLine,
  CommandList,
  PostEvaReport,
  Recording,
  RecordedCommand,
} from "@marswalk/protocol";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { canonicalJson, logHashOf, logLine } from "@marswalk/protocol";
import { openLog } from "../src/log";
import { initialState, reduce, type EngineState } from "../src/engine/reducer";
import type { LoadedScenario } from "../src/scenario";

// ---- compile-time: new names (checked by tsc) ------------------------------------------------------

describe("protocol v0.2 types (compile-time)", () => {
  it("Role and CommandKind gain the live-session names", () => {
    expectTypeOf<"presenter">().toMatchTypeOf<Role>();
    for (const k of ["JUMP_NEXT_STOP", "START_EVENT", "RESET_SESSION", "SELECT_HAB_SITE", "SET_MISSION_SETUP"] as const) {
      expectTypeOf(k).toMatchTypeOf<CommandKind>();
    }
  });

  it("Crew gains seven optional nullable fields (BD-95, BD-103, BD-112)", () => {
    expectTypeOf<Crew["o2_remaining_min"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Crew["next_stop_bearing_deg"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Crew["next_stop_distance_m"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Crew["next_stop_eta_s"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Crew["link_hops"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Crew["link_via"]>().toEqualTypeOf<"direct" | "relay" | "crew" | null | undefined>();
    expectTypeOf<Crew["last_linked_sim_time"]>().toEqualTypeOf<string | null | undefined>();
  });

  it("Vehicle gains task_id, queue and relay_coverage_rev (BD-102, N-11)", () => {
    expectTypeOf<Vehicle["task_id"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Vehicle["queue"]>().toEqualTypeOf<QueuedRoverTask[] | undefined>();
    expectTypeOf<Vehicle["relay_coverage_rev"]>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<QueuedRoverTask["eta_s"]>().toEqualTypeOf<number | null>();
    expectTypeOf<QueuedRoverTask["battery_wh_after"]>().toEqualTypeOf<number | null>();
    expectTypeOf<QueuedRoverTask["target"]>().toEqualTypeOf<{ x_m: number; y_m: number } | null>();
  });

  it("Scenario and Session carry the live-session fields (BD-90, BD-100)", () => {
    expectTypeOf<Scenario["event_library"]>().toEqualTypeOf<EventLibraryEntry[]>();
    expectTypeOf<Scenario["task_library"]>().toEqualTypeOf<TaskLibraryEntry[] | undefined>();
    expectTypeOf<Scenario["mission_setup"]>().toEqualTypeOf<Partial<MissionSetup> & { hab_candidate_id?: string }>();
    expectTypeOf<Session["hab_candidate_id"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Session["mission_setup"]>().toEqualTypeOf<MissionSetup | undefined>();
    expectTypeOf<Session["started_events"]>().toEqualTypeOf<{ event_id: string; t0_sim_time: string }[] | undefined>();
    expectTypeOf<EventLibrarySummary>().toHaveProperty("source_id");
  });

  it("Snapshot gains conditions, task_library, event_library and next_stop_target (BD-75, BD-90, BD-104)", () => {
    expectTypeOf<Snapshot["conditions"]>().toEqualTypeOf<ConditionsState>();
    expectTypeOf<Snapshot["task_library"]>().toEqualTypeOf<TaskLibraryEntry[]>();
    expectTypeOf<Snapshot["event_library"]>().toEqualTypeOf<EventLibrarySummary[]>();
    expectTypeOf<Snapshot["next_stop_target"]>().toEqualTypeOf<{ stop_id: string; stop_index: number } | null>();
    expectTypeOf<ConditionsState["sol"]>().toEqualTypeOf<number | null>();
  });

  it("LogEvent data of the new and changed kinds", () => {
    expectTypeOf<LogEventData["SESSION_LOADED"]["plan_hash"]>().toEqualTypeOf<string | null>();
    expectTypeOf<LogEventData["CLOCK_JUMPED"]["ended_by"]>().toEqualTypeOf<"arrival" | "alert" | "plan_revised" | "eva_ended" | "sheltered">();
    expectTypeOf<LogEventData["EVENT_STARTED"]["series_start_utc"]>().toEqualTypeOf<string>();
    expectTypeOf<LogEventData["SESSION_RESET"]["next_session_id"]>().toEqualTypeOf<string>();
    expectTypeOf<LogEventData["SITE_SELECTED"]["candidate_id"]>().toEqualTypeOf<string>();
    expectTypeOf<LogEventData["MISSION_SETUP_SET"]>().toEqualTypeOf<Partial<MissionSetup>>();
    expectTypeOf<LogEventData["VEHICLE_DISPATCHED"]["task_id"]>().toEqualTypeOf<string | undefined>();
    for (const k of ["CLOCK_JUMPED", "EVENT_STARTED", "SESSION_RESET", "SITE_SELECTED", "MISSION_SETUP_SET"] as const) {
      expectTypeOf(k).toMatchTypeOf<LogEventKind>();
    }
  });

  it("worker messages LOAD_GRID, GRID_LOADED, VALIDATE_MANUAL_LEG, MANUAL_LEG_RESULT (BD-40, T05.30)", () => {
    expectTypeOf<LoadGridRequest["type"]>().toEqualTypeOf<"LOAD_GRID">();
    expectTypeOf<GridLoaded["type"]>().toEqualTypeOf<"GRID_LOADED">();
    expectTypeOf<ValidateManualLegRequest["type"]>().toEqualTypeOf<"VALIDATE_MANUAL_LEG">();
    expectTypeOf<ManualLegResult["type"]>().toEqualTypeOf<"MANUAL_LEG_RESULT">();
    expectTypeOf<LoadGridRequest>().toMatchTypeOf<WorkerRequest>();
    expectTypeOf<ValidateManualLegRequest>().toMatchTypeOf<WorkerRequest>();
    expectTypeOf<GridLoaded>().toMatchTypeOf<WorkerResponse>();
    expectTypeOf<ManualLegResult>().toMatchTypeOf<WorkerResponse>();
  });

  it("report, recording, command list and typed args exist (BD-76, BD-93, BD-105, N-08)", () => {
    expectTypeOf<PostEvaReport["trace"]>().toBeArray();
    expectTypeOf<PostEvaReport["dose"]["planned_background_ugy"]>().toEqualTypeOf<number | null>();
    expectTypeOf<PostEvaReport["dose"]["planned_background_reason"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Recording["format"]>().toEqualTypeOf<"marswalk-recording">();
    expectTypeOf<Recording["label"]>().toEqualTypeOf<"replayed recording">();
    expectTypeOf<CommandList["commands"]>().toEqualTypeOf<RecordedCommand[]>();
    expectTypeOf<CommandJournalLine>().toMatchTypeOf<RecordedCommand>();
    expectTypeOf<CommandArgs["PUBLISH_PLAN"]>().toHaveProperty("stop_tasks");
    expectTypeOf<CommandArgs["START_EVENT"]>().toEqualTypeOf<{ event_id: string }>();
  });
});

// ---- run-time: logHash and reducer ---------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function fakeScenario(): LoadedScenario {
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

let nextSeq = 1;
function event<K extends LogEventKind>(kind: K, data: LogEventData[K], sim_time = "2024-05-20T13:00:00Z"): LogEvent {
  return { seq: nextSeq++, sim_time, kind, actor: "system", data, provenance: {}, command_ref: null } as LogEvent;
}

const base = (): EngineState => initialState(fakeScenario(), "s-0001");

describe("reducer: the five live-session cases (contract §6)", () => {
  it("SITE_SELECTED sets session.hab_candidate_id", () => {
    const s = reduce(base(), event("SITE_SELECTED", { candidate_id: "hab-alternative" }));
    expect(s.session.hab_candidate_id).toBe("hab-alternative");
  });

  it("MISSION_SETUP_SET merges the keys set into session.mission_setup and keeps the others", () => {
    const full: MissionSetup = { crew_count: 2, vehicle_available: false, vehicle_param_set: null, solar_phase: "max", max_haven_min: 30 };
    const start: EngineState = { ...base(), session: { ...base().session, mission_setup: full } };
    const s = reduce(start, event("MISSION_SETUP_SET", { vehicle_available: true, vehicle_param_set: "pr1-assumed" }));
    expect(s.session.mission_setup).toEqual({ ...full, vehicle_available: true, vehicle_param_set: "pr1-assumed" });
    expect(start.session.mission_setup).toEqual(full); // pure: the input is not mutated
  });

  it("MISSION_SETUP_SET on a session without mission_setup keeps just the keys set", () => {
    const s = reduce(base(), event("MISSION_SETUP_SET", { crew_count: 1 }));
    expect(s.session.mission_setup).toEqual({ crew_count: 1 });
  });

  it("EVENT_STARTED appends {event_id, t0_sim_time} to session.started_events, in order", () => {
    let s = reduce(base(), event("EVENT_STARTED", { event_id: "storm", t0_sim_time: "2024-05-20T13:00:00Z", series_start_utc: "2024-05-20T05:00:00Z", source_id: "rad-sol4190" }));
    s = reduce(s, event("EVENT_STARTED", { event_id: "second", t0_sim_time: "2024-05-20T14:00:00Z", series_start_utc: "2024-05-20T06:00:00Z", source_id: "rad-sol4190" }));
    expect(s.session.started_events).toEqual([
      { event_id: "storm", t0_sim_time: "2024-05-20T13:00:00Z" },
      { event_id: "second", t0_sim_time: "2024-05-20T14:00:00Z" },
    ]);
  });

  it.each([
    ["CLOCK_JUMPED", { reason: "next_stop", from_sim_time: "2024-05-20T13:00:00Z", to_sim_time: "2024-05-20T13:20:00Z", stop_id: "wp-2", ended_by: "arrival" }],
    ["SESSION_RESET", { session_id: "s-0001", next_session_id: "s-0002" }],
  ] as const)("%s changes only last_seq and sim_time", (kind, data) => {
    const before = base();
    const e = event(kind, data as never, "2024-05-20T13:20:00Z");
    const after = reduce(before, e);
    expect(after).toEqual({ ...before, session: { ...before.session, last_seq: e.seq, clock: { ...before.session.clock, sim_time: "2024-05-20T13:20:00Z" } } });
  });
});

describe("reducer: utility rover queue (BD-102)", () => {
  const withRover = (): EngineState => {
    const s = base();
    const rover: Vehicle = { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", x_m: 10, y_m: 20, state: "PARKED", task: null, path: [], eta_s: null, battery_wh: 100 };
    return { ...s, vehicles: [...s.vehicles.filter((v) => v.vehicle_id !== "UR1"), rover] };
  };
  const ur = (s: EngineState): Vehicle => s.vehicles.find((v) => v.vehicle_id === "UR1") as Vehicle;

  it("the first accepted task becomes the head (task, task_id); the next ones fill the queue with eta and battery null", () => {
    let s = reduce(withRover(), event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 1, y_m: 2 }, task_id: "rt-1" }));
    expect(ur(s).task_id).toBe("rt-1");
    expect(ur(s).task).toMatchObject({ kind: "SCOUT", target: { x_m: 1, y_m: 2 } });
    expect(ur(s).state).toBe("TASKED");
    s = reduce(s, event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "CARRY", target: { x_m: 3, y_m: 4 }, item: "sample bag", task_id: "rt-2" }));
    s = reduce(s, event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "RETURN", task_id: "rt-3" }));
    expect(ur(s).task_id).toBe("rt-1");
    expect(ur(s).queue).toEqual([
      { task_id: "rt-2", kind: "CARRY", target: { x_m: 3, y_m: 4 }, item: "sample bag", eta_s: null, battery_wh_after: null },
      { task_id: "rt-3", kind: "RETURN", target: null, eta_s: null, battery_wh_after: null },
    ]);
  });

  it("VEHICLE_ARRIVED pops the head: the next queued task becomes the head", () => {
    let s = reduce(withRover(), event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 1, y_m: 2 }, task_id: "rt-1" }));
    s = reduce(s, event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "CARRY", target: { x_m: 3, y_m: 4 }, item: "x", task_id: "rt-2" }));
    s = reduce(s, event("VEHICLE_ARRIVED", { vehicle_id: "UR1", x_m: 1, y_m: 2 }));
    expect(ur(s).task_id).toBe("rt-2");
    expect(ur(s).task).toMatchObject({ kind: "CARRY", target: { x_m: 3, y_m: 4 }, item: "x" });
    expect(ur(s).queue).toEqual([]);
    expect(ur(s).state).toBe("TASKED");
  });

  it("VEHICLE_ARRIVED with an empty queue leaves the rover ARRIVED with no active task id", () => {
    let s = reduce(withRover(), event("VEHICLE_DISPATCHED", { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 1, y_m: 2 }, task_id: "rt-1" }));
    s = reduce(s, event("VEHICLE_ARRIVED", { vehicle_id: "UR1", x_m: 1, y_m: 2 }));
    expect(ur(s).task_id).toBeNull();
    expect(ur(s).state).toBe("ARRIVED");
    expect(ur(s).queue).toEqual([]);
  });

  it("a summon of the pressurized rover (no task_id) keeps the existing behaviour and has no queue", () => {
    const s = reduce(base(), event("VEHICLE_DISPATCHED", { vehicle_id: "PR1", option_id: "o1", rendezvous: { x_m: 5, y_m: 6, eta_crew_s: 10, eta_vehicle_s: 20 } }));
    const pr = s.vehicles.find((v) => v.vehicle_id === "PR1") as Vehicle;
    expect(pr.state).toBe("DISPATCHED");
    expect(pr.task?.kind).toBe("SUMMON");
  });
});

describe("logHash helper (packages/protocol, contract §7)", () => {
  it("canonicalJson sorts keys (RFC 8785), as the Hab Core log writes them", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe('{"a":[2,{"c":3,"d":4}],"b":1}');
    const ev = event("SITE_SELECTED", { candidate_id: "hab-first" });
    expect(logLine(ev)).toBe(`${canonicalJson(ev)}\n`);
  });

  it("logHashOf gives the hash the Hab Core log keeps (SHA-256 of the file bytes), checked against a real log file", () => {
    const dir = mkdtempSync(join(tmpdir(), "marswalk-loghash-"));
    try {
      const log = openLog(dir);
      log.append({ sim_time: "2024-05-20T13:00:00Z", kind: "SITE_SELECTED", actor: "ops", data: { candidate_id: "hab-first" }, provenance: {} });
      log.append({ sim_time: "2024-05-20T13:00:01Z", kind: "MISSION_SETUP_SET", actor: "ops", data: { crew_count: 1 }, provenance: {} });
      const events = log.after(0);
      const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
      expect(logHashOf(events, sha)).toBe(log.hash());
      expect(logHashOf(events, sha)).toBe(sha(readFileSync(join(dir, "session.jsonl"), "utf8")));
      expect(logHashOf([], sha)).toBe(sha("")); // an empty log hashes the empty string
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
