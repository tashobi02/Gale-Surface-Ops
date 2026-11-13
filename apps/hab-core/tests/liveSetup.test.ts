/**
 * T32.13: `RESET_SESSION`, `SELECT_HAB_SITE`, `SET_MISSION_SETUP` and the role matrix (docs/specs/02 §D.17, §E.4;
 * 01 FR-51, FR-53, FR-31; 05 Session, HabCandidate; NFR-06). One named test per rule. Every case runs on the fake
 * scenario's plan-less variant (F8, T32.04) with the two-candidate site (T32.05), or on the reference scenario with no
 * site where a plan or a running EVA is needed; the committed fixtures are never edited.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-115 .. BD-118):
 * - `RESET_SESSION` (presenter, any status) appends `SESSION_RESET {session_id, next_session_id}` to the old log, then
 *   starts `s-<n+1>` of the same scenario and seed in `LOADED`; the old `session.jsonl` gains that one line and nothing
 *   after it; the accepted-command memory starts empty; the command is answered with the id of that last old-log event.
 * - `SELECT_HAB_SITE` (ops): `INVALID` for a missing or unknown candidate, `BUSY` unless `LOADED` with no plan.
 *   It logs `SITE_SELECTED`, puts the crew in the hab at the candidate's `default_start`, swaps the session's comm grid
 *   and mast, and recomputes the haven field (compute `habTimeField`, suit ParamSet speeds and slope limits).
 * - `SET_MISSION_SETUP` (ops): `INVALID` for an empty or unknown-key argument set, a wrong type or a value outside
 *   02 §E.3, a `crew_count` that is not the number of crew, an unknown or non-rover `vehicle_param_set`, and
 *   `vehicle_available: true` with no ParamSet given or set; `BUSY` unless `LOADED`. It logs the keys set. A published
 *   plan keeps its own MissionScenario.
 * - Role matrix: every command kind from every role; a pair outside `PERMISSIONS` is `FORBIDDEN_ROLE`, logged as
 *   `COMMAND_REJECTED`.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PERMISSIONS, type Command, type CommandResult, type LogEvent, type PlanExport, type Role, type Scenario, type Site } from "@marswalk/protocol";
import { canonicalJson } from "../src/log";
import { readScenario, type LoadedScenario, type SiteRef } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const REPO_ROOT = join(here, "../../..");
const MOCK_SITE_DIR = join(REPO_ROOT, "data/sites/mock_site");
const SITE_VERSION = "mock_site-2026.11.05";
const NO_SITE: SiteRef = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), `marswalk-${prefix}-`));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** A copy of the fixture folder whose `scenario.json` is the plan-less variant (or the reference), edited by `edit`. */
function scenarioDir(edit: (s: Scenario) => void = () => {}, opts: { planless?: boolean; version?: string } = {}): string {
  const dir = tmp("scenario");
  cpSync(fixtureDir, dir, { recursive: true });
  const scenario = readJson<Scenario>(join(dir, opts.planless === false ? "scenario.json" : "scenario.planless.json"));
  if (opts.version) scenario.data_version = opts.version;
  edit(scenario);
  writeFileSync(join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`);
  return dir;
}

/** The fixture's two-candidate site manifest and grid with the POIs of the mock site: a complete site folder. */
function candidateSite(): SiteRef {
  const dir = tmp("site");
  cpSync(join(fixtureDir, "two-candidate-site"), dir, { recursive: true });
  cpSync(join(MOCK_SITE_DIR, "vectors"), join(dir, "vectors"), { recursive: true });
  return { site_id: "mock_site", data_version: SITE_VERSION, dir };
}

const manifestOf = (site: SiteRef): Site => readJson<Site>(join(site.dir!, "site-manifest.json"));

/** The plan-less scenario on the two-candidate site (the live session before PUBLISH_PLAN). */
function liveScenario(edit: (s: Scenario) => void = () => {}): LoadedScenario {
  return readScenario(scenarioDir(edit, { version: SITE_VERSION }), candidateSite());
}
/** The plan-less scenario with no site (no candidates, no grid): fast, for rules that need neither. */
const bareScenario = (edit: (s: Scenario) => void = () => {}): LoadedScenario => readScenario(scenarioDir(edit), NO_SITE);
/** The reference scenario (it has a plan) with no site. */
const referenceScenario = (): LoadedScenario => readScenario(fixtureDir, NO_SITE);

function planFor(version: string): PlanExport {
  const plan = structuredClone(readJson<Scenario>(join(fixtureDir, "scenario.json")).plan!);
  plan.data_version = version;
  plan.plan_hash = sha256(canonicalJson({ data_version: plan.data_version, scenario: plan.scenario, waypoints: plan.waypoints })).slice(0, 12);
  return plan;
}

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const snap = (s: SessionHandle) => s.snapshot([]);
const code = (r: CommandResult): string => (r.ok ? "ok" : r.code);
const live = (scenario: LoadedScenario = liveScenario(), varDir = tmp("var")): { session: SessionHandle; varDir: string; scenario: LoadedScenario } => ({
  session: loadSession(scenario, varDir),
  varDir,
  scenario,
});
const sessionFile = (varDir: string, id: string): string => join(varDir, "sessions", id, "session.jsonl");
const lines = (path: string): LogEvent[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as LogEvent);

/** The 20 command kinds, each with an argument object that is plausible for it (the matrix only needs the role check to run). */
const KINDS = [
  "LOAD_SCENARIO", "SET_CLOCK", "JUMP_NEXT_EVENT", "START_EVA", "PUBLISH_PLAN", "SUMMON_VEHICLE", "ABORT", "ACK_ALERT", "APPROVE_OPTION", "TASK_ROVER",
  "SEND_MESSAGE", "INJECT_EVENT", "UPDATE_STOP_TASK", "ADD_STOP_TASK", "JUMP_NEXT_STOP", "START_EVENT", "RESET_SESSION", "SELECT_HAB_SITE", "SET_MISSION_SETUP", "RIDE_VEHICLE",
] as const satisfies readonly Command["kind"][];
const ROLES: Role[] = ["presenter", "planner", "eva:EV1", "eva:EV2", "hud:EV1", "hud:EV2", "ops", "earth"];

// ---------------------------------------------------------------------------------------------------------------------
describe("RESET_SESSION (02 §D.17; 01 FR-51)", () => {
  it("appends SESSION_RESET {session_id, next_session_id} as the last line of the old log", () => {
    const { session, varDir } = live(bareScenario());
    session.apply(cmd("ops", "SET_CLOCK", { speed: 10 }), "c-ops");
    const r = session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    expect(r.result.ok).toBe(true);
    const old = lines(sessionFile(varDir, "s-0001"));
    const last = old[old.length - 1];
    expect(last.kind).toBe("SESSION_RESET");
    expect(last.actor).toBe("presenter");
    expect(last.data).toEqual({ session_id: "s-0001", next_session_id: "s-0002" });
    expect(old.filter((e) => e.kind === "SESSION_RESET")).toHaveLength(1);
    expect(r.events.map((e) => e.seq)).toEqual([last.seq]);
    expect(r.result).toMatchObject({ ok: true, event_seq: last.seq });
  });

  it("is reported to the server as a replaced session whose events are the old session's closing events", () => {
    const { session } = live(bareScenario());
    const r = session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    expect(r.replaced).toBe(true);
    expect(r.events.map((e) => e.kind)).toEqual(["SESSION_RESET"]);
    expect(r.events[0].command_ref).toMatchObject({ client_id: "c-pres" });
  });

  it("starts s-<n+1> of the same scenario and seed in LOADED at the scenario start, with the scenario's setup defaults", () => {
    const scenario = liveScenario();
    const { session } = live(scenario);
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 45, solar_phase: "min" }), "c-ops");
    session.apply(cmd("ops", "SET_CLOCK", { speed: 60 }), "c-ops");
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    const s = snap(session);
    expect(s.session).toMatchObject({
      session_id: "s-0002",
      scenario_id: scenario.scenario.scenario_id,
      seed: scenario.scenario.seed,
      status: "LOADED",
      hab_candidate_id: "hab-first",
      mission_setup: { crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "max", max_haven_min: 30 },
      started_events: [],
      last_seq: 1,
    });
    expect(s.session.clock).toEqual({ sim_time: scenario.scenario.start_utc, speed: 1, paused: false });
    expect(session.eventsAfter(0)[0]).toMatchObject({ kind: "SESSION_LOADED", data: { session_id: "s-0002", seed: scenario.scenario.seed } });
    // The chosen hab is the scenario's again: the crew are at its default_start and the comm grid is the rank-1 candidate's.
    expect(s.crew.map((c) => [c.x_m, c.y_m])).toEqual([
      [-1800, -1500],
      [-1800, -1500],
    ]);
    expect(session.habSite()!.candidate_id).toBe("hab-first");
    expect(Buffer.from(session.habSite()!.comm_hab).equals(Buffer.from(scenario.comm!.comm_hab))).toBe(true);
  });

  it("makes the library events available again", () => {
    const { session } = live(bareScenario());
    expect(session.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-pres").result.ok).toBe(true);
    expect(code(session.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-pres").result)).toBe("BUSY");
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    expect(snap(session).session.started_events).toEqual([]);
    expect(session.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-pres").result.ok).toBe(true);
  });

  it("works from a running EVA and returns to LOADED with the crew back in the hab", () => {
    const { session } = live(referenceScenario());
    session.apply(cmd("ops", "START_EVA"), "c-ops");
    session.advance(120);
    expect(snap(session).session.status).toBe("RUNNING");
    expect(session.apply(cmd("presenter", "RESET_SESSION"), "c-pres").result.ok).toBe(true);
    const s = snap(session);
    expect(s.session).toMatchObject({ session_id: "s-0002", status: "LOADED" });
    expect(s.crew.every((c) => c.activity === "IN_HAB")).toBe(true);
    expect(s.alerts).toEqual([]);
  });

  it("leaves the old session.jsonl as it was plus the one SESSION_RESET line, and never touches it again", () => {
    const { session, varDir } = live(bareScenario());
    session.apply(cmd("ops", "SET_CLOCK", { speed: 10 }), "c-ops");
    const path = sessionFile(varDir, "s-0001");
    const before = readFileSync(path);
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    const after = readFileSync(path);
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    const appended = after.subarray(before.length).toString("utf8");
    expect(appended.endsWith("\n")).toBe(true);
    expect(appended.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(appended).kind).toBe("SESSION_RESET");
    // Whatever happens in the new session, the old file's bytes stay identical (SHA-256).
    const hash = sha256(after);
    session.apply(cmd("ops", "SET_CLOCK", { speed: 60 }), "c-ops");
    session.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-pres");
    session.advance(5);
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    expect(sha256(readFileSync(path))).toBe(hash);
    expect(readdirSync(join(varDir, "sessions")).sort()).toEqual(["s-0001", "s-0002", "s-0003"]);
  });

  it("clears the accepted-command memory: the same client and command id runs again in the new session", () => {
    const { session } = live(bareScenario());
    const clock = cmd("ops", "SET_CLOCK", { speed: 10 });
    const first = session.apply(clock, "c-ops");
    expect(first.events).toHaveLength(1);
    expect(session.apply(clock, "c-ops").events).toHaveLength(0); // deduplicated inside the session
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    const again = session.apply(clock, "c-ops");
    expect(again.events.map((e) => e.kind)).toEqual(["CLOCK_CHANGED"]);
    expect(snap(session).session.clock.speed).toBe(10);
  });

  it("a second reset starts s-0003; the new session resumes from disk after a restart (NFR-10)", () => {
    const scenario = bareScenario();
    const { session, varDir } = live(scenario);
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    session.apply(cmd("presenter", "RESET_SESSION"), "c-pres");
    session.apply(cmd("ops", "SET_CLOCK", { speed: 10 }), "c-ops");
    expect(snap(session).session.session_id).toBe("s-0003");
    const resumed = resumeSession(join(varDir, "sessions", "s-0003"), scenario);
    expect(snap(resumed).session.log_hash).toBe(snap(session).session.log_hash);
    expect(snap(resumed).session.clock.speed).toBe(10);
  });

  it("is not a stand-in for LOAD_SCENARIO: a reset needs no scenario id and is allowed in every status", () => {
    const { session } = live(referenceScenario());
    expect(session.apply(cmd("presenter", "RESET_SESSION", {}), "c-pres").result.ok).toBe(true);
    session.apply(cmd("ops", "START_EVA"), "c-ops");
    expect(session.apply(cmd("presenter", "RESET_SESSION"), "c-pres").result.ok).toBe(true);
    expect(snap(session).session.session_id).toBe("s-0003");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("SELECT_HAB_SITE (02 §D.17; 01 FR-53; 05 HabCandidate)", () => {
  it("logs SITE_SELECTED and records the candidate in the session", () => {
    const { session } = live();
    const r = session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    expect(r.result.ok).toBe(true);
    expect(r.events.map((e) => [e.kind, e.actor, e.data])).toEqual([["SITE_SELECTED", "ops", { candidate_id: "hab-alternative" }]]);
    expect(snap(session).session.hab_candidate_id).toBe("hab-alternative");
  });

  it("is INVALID for a missing, empty, non-string or unknown candidate, and logs COMMAND_REJECTED", () => {
    const { session } = live();
    for (const args of [{}, { candidate_id: "" }, { candidate_id: 7 }, { candidate_id: "hab-nowhere" }]) {
      const r = session.apply(cmd("ops", "SELECT_HAB_SITE", args), "c-ops");
      expect(code(r.result)).toBe("INVALID");
      expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    }
    expect(snap(session).session.hab_candidate_id).toBe("hab-first");
  });

  it("is INVALID when the Site has no candidates", () => {
    const { session } = live(bareScenario());
    expect(code(session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-first" }), "c-ops").result)).toBe("INVALID");
  });

  it("is BUSY once a plan is published, while running and after the EVA ended", () => {
    const { session } = live();
    expect(session.apply(cmd("planner", "PUBLISH_PLAN", { plan: planFor(SITE_VERSION) }), "c-plan").result.ok).toBe(true);
    expect(code(session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops").result)).toBe("BUSY");
    session.apply(cmd("ops", "START_EVA"), "c-ops");
    expect(code(session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops").result)).toBe("BUSY");
    session.advance(7 * 3600);
    expect(snap(session).session.status).toBe("ENDED");
    expect(code(session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops").result)).toBe("BUSY");
    expect(snap(session).session.hab_candidate_id).toBe("hab-first");
  });

  it("puts the crew in the hab at the chosen candidate's default_start", () => {
    const { session } = live();
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    expect(snap(session).crew.map((c) => [c.x_m, c.y_m, c.activity])).toEqual([
      [1800, -1500, "IN_HAB"],
      [1800, -1500, "IN_HAB"],
    ]);
    expect(snap(session).crew.map((c) => [c.haven.target_x_m, c.haven.target_y_m])).toEqual([
      [1800, -1500],
      [1800, -1500],
    ]);
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-first" }), "c-ops");
    expect(snap(session).crew.map((c) => [c.x_m, c.y_m])).toEqual([
      [-1800, -1500],
      [-1800, -1500],
    ]);
  });

  it("puts the chosen candidate's comm grid and mast in use", () => {
    const site = candidateSite();
    const scenario = readScenario(scenarioDir(() => {}, { version: SITE_VERSION }), site);
    const { session } = live(scenario);
    const manifest = manifestOf(site);
    const first = session.habSite()!;
    expect(first.candidate_id).toBe("hab-first");
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    const alt = session.habSite()!;
    expect(alt.candidate_id).toBe("hab-alternative");
    expect(alt.hab_mast).toEqual(manifest.hab_candidates!.find((c) => c.candidate_id === "hab-alternative")!.hab_mast);
    expect(first.hab_mast).toEqual(manifest.hab_candidates![0].hab_mast);
    expect(Buffer.from(alt.comm_hab).equals(Buffer.from(first.comm_hab))).toBe(false);
  });

  it("recomputes the haven field: it differs between the two candidates and has seconds 0 at each hab", () => {
    const { session } = live();
    const first = session.habSite()!.haven;
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    const alt = session.habSite()!.haven;
    expect(first.seconds.length).toBe(alt.seconds.length);
    expect(Buffer.from(first.seconds.buffer).equals(Buffer.from(alt.seconds.buffer))).toBe(false);
    const at = (f: typeof first, x: number, y: number): number => f.seconds[Math.floor((f.origin_m[1] - y) / f.cell_m) * f.width + Math.floor((x - f.origin_m[0]) / f.cell_m)];
    expect(at(first, -1800, -1500)).toBe(0);
    expect(at(alt, 1800, -1500)).toBe(0);
    expect(at(first, 1800, -1500)).toBeGreaterThan(0);
    expect(at(alt, -1800, -1500)).toBeGreaterThan(0);
  });

  it("selecting back gives the first field again (the swap keeps no stale state)", () => {
    const { session } = live();
    const first = Float64Array.from(session.habSite()!.haven.seconds);
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-first" }), "c-ops");
    expect(Buffer.from(session.habSite()!.haven.seconds.buffer).equals(Buffer.from(first.buffer))).toBe(true);
  });

  it("a headless run of each candidate is deterministic: two runs give one log hash, the candidates differ", () => {
    // Fixed command ids: they are part of each logged command_ref, so they must repeat for the hashes to.
    const fixed = (command_id: string, role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id, role, kind, args });
    const run = (candidate: string): string => {
      const { session } = live();
      session.apply(fixed("h-1", "ops", "SELECT_HAB_SITE", { candidate_id: candidate }), "c-ops");
      session.apply(fixed("h-2", "planner", "PUBLISH_PLAN", { plan: planFor(SITE_VERSION) }), "c-plan");
      session.apply(fixed("h-3", "ops", "START_EVA"), "c-ops");
      session.advance(900);
      return snap(session).session.log_hash;
    };
    expect(run("hab-first")).toBe(run("hab-first"));
    expect(run("hab-alternative")).toBe(run("hab-alternative"));
    expect(run("hab-first")).not.toBe(run("hab-alternative"));
  });

  it("resumes from disk with the chosen candidate's comm grid, haven field and crew position", () => {
    const scenario = liveScenario();
    const { session, varDir } = live(scenario);
    session.apply(cmd("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" }), "c-ops");
    const resumed = resumeSession(join(varDir, "sessions", "s-0001"), scenario);
    expect(snap(resumed).session.hab_candidate_id).toBe("hab-alternative");
    expect(snap(resumed).crew.map((c) => c.x_m)).toEqual([1800, 1800]);
    expect(resumed.habSite()!.candidate_id).toBe("hab-alternative");
    expect(Buffer.from(resumed.habSite()!.haven.seconds.buffer).equals(Buffer.from(session.habSite()!.haven.seconds.buffer))).toBe(true);
    expect(Buffer.from(resumed.habSite()!.comm_hab).equals(Buffer.from(session.habSite()!.comm_hab))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("SET_MISSION_SETUP (02 §D.17, §E.3; 01 FR-53)", () => {
  it("logs MISSION_SETUP_SET with the keys set and merges them into the session's settings", () => {
    const { session } = live(bareScenario());
    const r = session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 45, solar_phase: "min" }), "c-ops");
    expect(r.result.ok).toBe(true);
    expect(r.events.map((e) => [e.kind, e.actor, e.data])).toEqual([["MISSION_SETUP_SET", "ops", { max_haven_min: 45, solar_phase: "min" }]]);
    expect(snap(session).session.mission_setup).toEqual({ crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "min", max_haven_min: 45 });
  });

  it("accepts every setting at the ends of its range and a rover ParamSet", () => {
    const { session } = live(bareScenario());
    for (const args of [{ max_haven_min: 5 }, { max_haven_min: 120 }, { crew_count: 2 }, { solar_phase: "max" }, { vehicle_available: false }, { vehicle_param_set: "pr1-assumed" }]) {
      expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", args), "c-ops").result)).toBe("ok");
    }
  });

  it("is INVALID for an empty argument set and for unknown keys", () => {
    const { session } = live(bareScenario());
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", {}), "c-ops").result)).toBe("INVALID");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 40, hab_candidate_id: "hab-first" }), "c-ops").result)).toBe("INVALID");
    expect(snap(session).session.mission_setup.max_haven_min).toBe(30);
  });

  it("is INVALID when crew_count differs from the number of crew[] entries", () => {
    const { session } = live(bareScenario());
    for (const crew_count of [1, 3, 0]) {
      const r = session.apply(cmd("ops", "SET_MISSION_SETUP", { crew_count }), "c-ops");
      expect(code(r.result)).toBe("INVALID");
      expect(r.result.ok ? "" : r.result.message).toMatch(/crew_count/);
    }
  });

  it("is INVALID for a value outside 02 §E.3 or of the wrong type", () => {
    const { session } = live(bareScenario());
    const bad: Record<string, unknown>[] = [
      { max_haven_min: 4 },
      { max_haven_min: 121 },
      { max_haven_min: "30" },
      { max_haven_min: Number.NaN },
      { solar_phase: "mid" },
      { vehicle_available: "yes" },
      { crew_count: "2" },
      { vehicle_param_set: 5 },
    ];
    for (const args of bad) expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", args), "c-ops").result)).toBe("INVALID");
    expect(snap(session).session.mission_setup).toEqual({ crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "max", max_haven_min: 30 });
  });

  it("is INVALID for a vehicle_param_set that is not a pressurized-rover ParamSet of the scenario", () => {
    const { session } = live(bareScenario());
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_param_set: "suit-assumed" }), "c-ops").result)).toBe("INVALID");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_param_set: "no-such-set" }), "c-ops").result)).toBe("INVALID");
  });

  it("is INVALID when vehicle_available is true and no vehicle_param_set is given or already set", () => {
    const noRover = bareScenario((s) => {
      s.vehicles = [];
      s.mission_setup.vehicle_available = false;
      delete s.mission_setup.vehicle_param_set;
    });
    const { session } = live(noRover);
    expect(snap(session).session.mission_setup.vehicle_param_set).toBeNull();
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_available: true }), "c-ops").result)).toBe("INVALID");
    // Given in the same call, it is accepted; already set (from the call before), a bare vehicle_available is accepted too.
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_available: true, vehicle_param_set: "pr1-assumed" }), "c-ops").result)).toBe("ok");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_available: false }), "c-ops").result)).toBe("ok");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { vehicle_available: true }), "c-ops").result)).toBe("ok");
  });

  it("is BUSY unless the session is LOADED", () => {
    const { session } = live(referenceScenario());
    session.apply(cmd("ops", "START_EVA"), "c-ops");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 40 }), "c-ops").result)).toBe("BUSY");
    session.advance(7 * 3600);
    expect(snap(session).session.status).toBe("ENDED");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 40 }), "c-ops").result)).toBe("BUSY");
    expect(snap(session).session.mission_setup.max_haven_min).toBe(30);
  });

  it("checks the arguments before the state (INVALID wins over BUSY)", () => {
    const { session } = live(referenceScenario());
    session.apply(cmd("ops", "START_EVA"), "c-ops");
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 4 }), "c-ops").result)).toBe("INVALID");
  });

  it("after a plan is published the plan's values win: a later call changes the defaults, not the plan", () => {
    const { session } = live();
    const plan = planFor(SITE_VERSION);
    expect(session.apply(cmd("planner", "PUBLISH_PLAN", { plan }), "c-plan").result.ok).toBe(true);
    const before = canonicalJson(snap(session).plan!.scenario);
    expect(code(session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 45, solar_phase: "min" }), "c-ops").result)).toBe("ok");
    expect(canonicalJson(snap(session).plan!.scenario)).toBe(before);
    expect(snap(session).plan!.scenario).toMatchObject({ max_haven_min: 30, solar_phase: "max" });
    expect(snap(session).session.mission_setup).toMatchObject({ max_haven_min: 45, solar_phase: "min" });
  });

  it("resumes from disk with the settings in force", () => {
    const scenario = bareScenario();
    const { session, varDir } = live(scenario);
    session.apply(cmd("ops", "SET_MISSION_SETUP", { max_haven_min: 45 }), "c-ops");
    const resumed = resumeSession(join(varDir, "sessions", "s-0001"), scenario);
    expect(snap(resumed).session.mission_setup.max_haven_min).toBe(45);
    expect(snap(resumed).session.log_hash).toBe(snap(session).session.log_hash);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("role matrix: 20 command kinds x 8 roles (02 §E.4; 01 FR-31)", () => {
  it("covers every command kind and every role", () => {
    expect(KINDS).toHaveLength(20);
    expect(new Set(KINDS).size).toBe(20);
    expect(new Set(Object.values(PERMISSIONS).flat())).toEqual(new Set(KINDS));
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it("matches the rows of 02 §E.4 for the live-session commands", () => {
    const who = (kind: Command["kind"]): string[] => ROLES.filter((r) => PERMISSIONS[r].includes(kind)).sort();
    expect(who("JUMP_NEXT_STOP")).toEqual(["presenter"]);
    expect(who("START_EVENT")).toEqual(["presenter"]);
    expect(who("RESET_SESSION")).toEqual(["presenter"]);
    expect(who("SELECT_HAB_SITE")).toEqual(["ops"]);
    expect(who("SET_MISSION_SETUP")).toEqual(["ops"]);
    expect(PERMISSIONS.presenter).not.toEqual(expect.arrayContaining(["APPROVE_OPTION"]));
    for (const kind of ["APPROVE_OPTION", "ABORT", "SUMMON_VEHICLE", "START_EVA"] as const) expect(PERMISSIONS.presenter).not.toContain(kind);
    expect(PERMISSIONS["hud:EV1"]).toEqual([]);
    expect(PERMISSIONS["hud:EV2"]).toEqual([]);
  });

  for (const role of ROLES) {
    describe(role, () => {
      const forbidden = KINDS.filter((k) => !PERMISSIONS[role].includes(k));
      const allowed = KINDS.filter((k) => PERMISSIONS[role].includes(k));

      it(`${forbidden.length} forbidden kinds are FORBIDDEN_ROLE, logged as COMMAND_REJECTED, and change nothing`, () => {
        for (const kind of forbidden) {
          const { session } = live(bareScenario());
          const before = snap(session);
          const r = session.apply(cmd(role, kind, {}), `c-${role}`);
          expect(code(r.result), `${role} ${kind}`).toBe("FORBIDDEN_ROLE");
          expect(r.events.map((e) => [e.kind, e.actor, (e.data as { code: string }).code])).toEqual([["COMMAND_REJECTED", role, "FORBIDDEN_ROLE"]]);
          const log = session.eventsAfter(before.seq);
          expect(log.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
          const after = snap(session);
          expect({ ...after.session, last_seq: 0, log_hash: "" }).toEqual({ ...before.session, last_seq: 0, log_hash: "" });
        }
      });

      it(`${allowed.length} allowed kinds are never refused as FORBIDDEN_ROLE`, () => {
        for (const kind of allowed) {
          const { session } = live(bareScenario());
          // A handler that is still a stub (earth.ts, package 18) throws after the role check passed: that is not a refusal.
          let refused = false;
          try {
            refused = code(session.apply(cmd(role, kind, {}), `c-${role}`).result) === "FORBIDDEN_ROLE";
          } catch (err) {
            expect((err as Error).message, `${role} ${kind}`).toMatch(/not implemented/);
          }
          expect(refused, `${role} ${kind}`).toBe(false);
        }
      });
    });
  }
});
