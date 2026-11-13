/**
 * Headless replay (NFR-14; 02 §F, §D.17 "Headless run"): run a scenario at full speed with no clients, write the log, and
 * return `log_hash`. Used by CI (determinism, NFR-06), as the video fallback and to write the Pages recording. T22.13, T32.17.
 *
 * A run: load the scenario into a fresh session folder, apply the command list (`commands`) in list order, each command
 * when the clock reads its `sim_time` (after the tick that reached it, before the tick that leaves it; a command whose time has
 * passed is applied at once), then 1-s steps until the session ENDS, the plan's maximum EVA duration has passed, or the
 * list's `until_sim_time`. Without a list the run is the scenario's own course: START_EVA as ops, then the first library
 * event pressed at its `series_start_utc` (U-62, BD-97), which is the list of those two commands. A list covers one
 * session: it may end with RESET_SESSION, and the hash is then the old session's. The hash does not depend on the folder.
 *
 * `exportCommandList` rebuilds the list of a live session from its `commands.jsonl` (BD-93, BD-121).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS, canonicalJson, type CommandJournalLine, type CommandList, type LogEvent, type LogEventData, type RecordedCommand, type Scenario } from "@marswalk/protocol";
import { JOURNAL_FILE } from "./log";
import type { RecordingCollector } from "./recording";
import { readScenario, ScenarioCheckError, type LoadedScenario, type SiteRef } from "./scenario";
import { loadSession } from "./session";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_VAR = join(REPO_ROOT, "apps/hab-core/var");
/** Steps per advance call; any size gives the same log (fixed 1-s steps). */
const CHUNK = 600;

export interface ReplayOptions {
  /** The site the scenario must match; default from `data/sites/<site_id>/site-manifest.json`. */
  site?: SiteRef;
  /** Where the replay's session folder goes; default `apps/hab-core/var/replay` (git-ignored). */
  varDir?: string;
  /** The recorded commands to apply (BD-93). Without them the scenario's own course runs (see the file header). */
  commands?: CommandList;
  /** Collects the message stream of the run for the Pages recording (BD-105); it does not change the run. */
  record?: RecordingCollector;
}

/** The loaded site for `site_id`, from its manifest (05 Site `data_version`). */
export function siteRefFor(site_id: string, sitesDir = join(REPO_ROOT, "data/sites")): SiteRef {
  const dir = join(sitesDir, site_id);
  let manifest: { site_id?: string; data_version?: string };
  try {
    manifest = JSON.parse(readFileSync(join(dir, "site-manifest.json"), "utf8")) as typeof manifest;
  } catch {
    throw new ScenarioCheckError("site", `no site bundle at ${dir} (site-manifest.json); run the pipeline or fetch the release asset`);
  }
  if (manifest.site_id !== site_id || typeof manifest.data_version !== "string") {
    throw new ScenarioCheckError("site", `${dir}/site-manifest.json does not describe site ${site_id}`);
  }
  return { site_id, data_version: manifest.data_version, dir };
}

function scenarioSiteId(scenarioDir: string): string {
  try {
    return (JSON.parse(readFileSync(join(scenarioDir, "scenario.json"), "utf8")) as Scenario).site_id;
  } catch {
    throw new ScenarioCheckError("read", `cannot read ${join(scenarioDir, "scenario.json")} (scenario files come from TASK-21)`);
  }
}

/** Read the scenario, with `seed` replacing the scenario's seed when given. */
export function loadForReplay(scenarioDir: string, options: ReplayOptions = {}, seed?: number): LoadedScenario {
  const site = options.site ?? siteRefFor(scenarioSiteId(scenarioDir));
  const loaded = readScenario(scenarioDir, site);
  return seed === undefined ? loaded : { ...loaded, scenario: { ...loaded.scenario, seed } };
}

/** The run cannot start from what was given (a caller error, not a scenario fault); the CLI exits with code 2. */
export class ReplayInputError extends Error {}

const KNOWN_KINDS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS).flat());
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const isUtc = (t: unknown): t is string => typeof t === "string" && UTC_SECONDS.test(t) && Number.isFinite(Date.parse(t));

/** Check a list before anything runs; the messages name the command by its 1-based place in the list. */
export function checkCommandList(list: CommandList, scenario_id: string): void {
  if (typeof list !== "object" || list === null || !Array.isArray(list.commands)) throw new ReplayInputError("command list: `commands` must be an array");
  if (list.scenario_id !== scenario_id) throw new ReplayInputError(`command list is for scenario ${String(list.scenario_id)}, not ${scenario_id}`);
  if (list.until_sim_time !== undefined && !isUtc(list.until_sim_time)) throw new ReplayInputError(`command list: until_sim_time ${String(list.until_sim_time)} is not a UTC time (YYYY-MM-DDTHH:MM:SSZ)`);
  if (list.initial_load !== undefined) {
    const c = list.initial_load;
    if (!c || c.kind !== "LOAD_SCENARIO" || !isUtc(c.sim_time) || (c.role !== "ops" && c.role !== "presenter") || c.args?.scenario_id !== scenario_id || typeof c.command_id !== "string" || typeof c.client_id !== "string") {
      throw new ReplayInputError("command list: initial_load must identify the LOAD_SCENARIO that created this session");
    }
  }
  list.commands.forEach((c, i) => {
    const at = `command ${i + 1}`;
    if (typeof c !== "object" || c === null) throw new ReplayInputError(`${at} is not an object`);
    if (!isUtc(c.sim_time)) throw new ReplayInputError(`${at}: sim_time ${String(c.sim_time)} is not a UTC time (YYYY-MM-DDTHH:MM:SSZ)`);
    if (!Object.prototype.hasOwnProperty.call(PERMISSIONS, c.role)) throw new ReplayInputError(`${at}: unknown role ${String(c.role)}`);
    if (!KNOWN_KINDS.has(c.kind)) throw new ReplayInputError(`${at}: unknown command kind ${String(c.kind)}`);
    if (c.args !== undefined && (typeof c.args !== "object" || c.args === null || Array.isArray(c.args))) throw new ReplayInputError(`${at}: args must be an object`);
    if (i > 0 && list.commands[i - 1].kind === "RESET_SESSION") throw new ReplayInputError(`${at} follows RESET_SESSION: a list covers one session (export one list per session)`);
  });
}

/** The scenario's own course as a list: START_EVA, then the first library event at its series start (U-62, BD-97). */
function defaultList(loaded: LoadedScenario): CommandList {
  const commands: RecordedCommand[] = [{ sim_time: loaded.scenario.start_utc, role: "ops", kind: "START_EVA", args: {}, command_id: "replay-start", client_id: "replay" }];
  const storm = (loaded.scenario.event_library ?? [])[0];
  if (storm !== undefined) commands.push({ sim_time: storm.series_start_utc, role: "presenter", kind: "START_EVENT", args: { event_id: storm.event_id }, command_id: "replay-storm", client_id: "replay" });
  return { $comment: "the scenario's own course", scenario_id: loaded.scenario.scenario_id, seed: loaded.scenario.seed, commands };
}

const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

export async function replayHeadless(scenarioDir: string, seed?: number, options: ReplayOptions = {}): Promise<string> {
  const given = options.commands;
  const loaded = loadForReplay(scenarioDir, options, seed ?? given?.seed);
  const reference = loaded.scenario.plan;
  // A live-session scenario has no plan until PUBLISH_PLAN: only a list can supply one.
  if (given === undefined && reference === undefined) throw new ReplayInputError("scenario has no plan; pass --commands with a PUBLISH_PLAN");
  if (given !== undefined) checkCommandList(given, loaded.scenario.scenario_id);
  const list = given ?? defaultList(loaded);
  const strict = given === undefined; // the scenario's own course must be accepted, as before

  const base = join(options.varDir ?? DEFAULT_VAR, "replay");
  mkdirSync(base, { recursive: true });
  const folder = mkdtempSync(join(base, `${loaded.scenario.scenario_id}-`));
  const initial = list.initial_load;
  const session = loadSession(loaded, folder, {
    ...(list.session_id === undefined ? {} : { firstSessionId: list.session_id }),
    ...(initial === undefined ? {} : { initialLoad: { command: { command_id: initial.command_id!, role: initial.role, kind: initial.kind, args: initial.args }, client_id: initial.client_id!, sim_time: initial.sim_time } }),
  });
  const rec = options.record;
  const snap = () => session.snapshot([]);
  rec?.begin(snap(), session.eventsAfter(0));

  /** Run 1-s steps while the EVA runs, until the clock reads `until_ms`; a recorder sees every step. */
  const runTo = (until_ms: number): void => {
    for (;;) {
      const now = snap();
      const left = Math.round((until_ms - Date.parse(now.sim_time)) / 1000);
      if (left <= 0 || now.session.status !== "RUNNING") return;
      if (rec === undefined) {
        session.advance(Math.min(CHUNK, left));
      } else {
        const r = session.advance(1);
        rec.record(now, snap(), r.events, r.deltas);
      }
      if (snap().sim_time === now.sim_time) return; // the clock did not move (never expected while RUNNING): do not loop
    }
  };

  let closedSessionId: string | null = null;
  for (const [i, c] of list.commands.entries()) {
    const at = `command ${i + 1} (${c.kind} at ${c.sim_time})`;
    const target = Date.parse(c.sim_time);
    runTo(target);
    const now = snap();
    if (Date.parse(now.sim_time) < target) {
      throw new ReplayInputError(`${at} cannot be reached: the session is ${now.session.status} at ${now.sim_time}`);
    }
    const before = now;
    const out = session.apply({ command_id: c.command_id ?? `replay-${i + 1}`, role: c.role, kind: c.kind, args: c.args ?? {} }, c.client_id ?? "replay");
    if (strict && !out.result.ok) throw new Error(`replay: ${c.kind} rejected: ${out.result.code} ${out.result.message}`);
    if (out.replaced === true) {
      closedSessionId = before.session.session_id;
      rec?.recordClosing(out.events);
    } else {
      rec?.record(before, snap(), out.events);
    }
  }

  let hash: string;
  if (closedSessionId !== null) {
    // The command replaced the session: the run is the old session's, whose log ends with SESSION_RESET.
    hash = sha256File(join(folder, "sessions", closedSessionId, "session.jsonl"));
  } else {
    const end = snap();
    if (list.until_sim_time !== undefined) runTo(Date.parse(list.until_sim_time));
    else if (end.plan !== null) runTo(Date.parse(loaded.scenario.start_utc) + end.plan.scenario.max_eva_duration_h * 3600 * 1000);
    hash = snap().session.log_hash;
  }
  rec?.end(hash);
  return hash;
}

/**
 * The command list of one session, from its `commands.jsonl` and `session.jsonl` (BD-93, BD-121): every journaled command with the
 * ids it was sent with, the scenario and seed and the session id from SESSION_LOADED, and `until_sim_time`, the sim time of the
 * session's last event. Replaying it gives the session's own `log_hash` (a ROLE_TAKEN_OVER event, which no command makes, is
 * the one thing it cannot reproduce). A creating load is represented by `initial_load` so it reproduces the first event.
 */
export function exportCommandList(sessionDir: string): CommandList {
  const journal = join(sessionDir, JOURNAL_FILE);
  const logFile = join(sessionDir, "session.jsonl");
  if (!existsSync(journal)) throw new Error(`no ${JOURNAL_FILE} in ${sessionDir}: it holds the commands the session evaluated (BD-93)`);
  if (!existsSync(logFile)) throw new Error(`no session.jsonl in ${sessionDir}`);
  const lines = (path: string): string[] => readFileSync(path, "utf8").split("\n").filter((l) => l.length > 0);
  const events = lines(logFile).map((l) => JSON.parse(l) as LogEvent);
  const first = events[0];
  if (!first || first.kind !== "SESSION_LOADED") throw new Error(`${logFile} does not start with SESSION_LOADED`);
  const loaded = first.data as unknown as LogEventData["SESSION_LOADED"];
  const entries = lines(journal).map((l) => JSON.parse(l) as CommandJournalLine);
  // A load creates the first event in this session, so replay it as initialization, not as another replacement (BD-121).
  const creating = entries[0]?.after_seq === 0 && first.command_ref !== null ? entries.shift() : undefined;
  const recorded = ({ sim_time, role, kind, args, command_id, client_id }: CommandJournalLine): RecordedCommand => ({ sim_time, role, kind, args, command_id, client_id });
  const commands: RecordedCommand[] = entries.map(recorded);
  return {
    $comment: `exported from the command journal of session ${loaded.session_id}; a replay applies the commands in list order (02 §D.17)`,
    scenario_id: loaded.scenario_id,
    seed: loaded.seed,
    commands,
    ...(creating === undefined ? {} : { initial_load: recorded(creating) }),
    session_id: loaded.session_id,
    until_sim_time: events[events.length - 1].sim_time,
  };
}

/**
 * Export every session under `path` into `outDir` as `<session_id>.commands.json`; `path` is one session folder or the
 * `sessions` folder that holds them. Returns the files written, in session order.
 */
export function exportCommandLists(path: string, outDir: string): string[] {
  const single = existsSync(join(path, JOURNAL_FILE)) || existsSync(join(path, "session.jsonl"));
  const sessions = single ? [path] : existsSync(path) ? readdirSync(path).filter((d) => /^s-\d+$/.test(d)).sort().map((d) => join(path, d)) : [];
  if (sessions.length === 0) throw new Error(`no ${JOURNAL_FILE} found in or under ${path}`);
  mkdirSync(outDir, { recursive: true });
  return sessions.map((dir) => {
    const list = exportCommandList(dir);
    const file = join(outDir, `${list.session_id}.commands.json`);
    writeFileSync(file, `${JSON.stringify(JSON.parse(canonicalJson(list)), null, 2)}\n`);
    return file;
  });
}
