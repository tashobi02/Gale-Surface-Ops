/**
 * Shared set-up of the tests that run the real storm-sol4190 scenario on the real gale_boxwork bundle (backend packages 26, 27).
 * The bundle's binaries are git-ignored (a release asset), so these tests skip with a printed reason when it is absent; the
 * run that finishes the project has the bundle, and there nothing may be skipped.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandList, EventMessage, LogEvent, Recording } from "@marswalk/protocol";
import { RecordingCollector, recordingJson } from "../../src/recording";
import { REPO_ROOT, replayHeadless } from "../../src/replay";

export const ROOT = REPO_ROOT;
export const SCENARIO_DIR = join(ROOT, "scenarios/storm-sol4190");
export const REFERENCE_LIST = join(SCENARIO_DIR, "reference_commands.json");
export const RECORDING_FILE = join(SCENARIO_DIR, "recording.json");
/** The Pages recording's delta period (the Makefile's `record` target, BD-148). */
export const RECORD_PERIOD_S = 5;

/** True when the real bundle's grid is on disk. */
export const hasRealBundle = existsSync(join(ROOT, "data/sites/gale_boxwork/grid/elevation.f32"));
export const SKIP_REASON = "the real gale_boxwork bundle is absent (git-ignored; see docs/plan/README.md section 6)";

export const readReferenceList = (): CommandList => JSON.parse(readFileSync(REFERENCE_LIST, "utf8")) as CommandList;

export interface ReferenceRun {
  hash: string;
  recording: Recording;
  /** The whole log, from the recording's EVENTs (N-81). */
  events: LogEvent[];
}

/** One headless run of `list` (the reference list by default) with a recorder; the session folder is removed afterwards. */
export async function runReference(list: CommandList = readReferenceList(), period_s: number = RECORD_PERIOD_S): Promise<ReferenceRun> {
  const varDir = mkdtempSync(join(tmpdir(), "marswalk-reference-"));
  try {
    const collector = new RecordingCollector(period_s);
    const hash = await replayHeadless(SCENARIO_DIR, undefined, { varDir, commands: list, record: collector });
    const recording = collector.finish();
    const events = recording.messages.filter((m): m is EventMessage => m.type === "EVENT").map((m) => m.event);
    return { hash, recording, events };
  } finally {
    rmSync(varDir, { recursive: true, force: true });
  }
}

export { recordingJson };

/** The first event of `kind` (optionally also matching `where`), or undefined. */
export function firstOf(events: readonly LogEvent[], kind: LogEvent["kind"], where: (e: LogEvent) => boolean = () => true): LogEvent | undefined {
  return events.find((e) => e.kind === kind && where(e));
}

/** A headless replay through the CLI (`tsx src/cli.ts replay`, what `make replay` runs), so several can run in parallel processes. */
export async function cliReplay(args: string[], varDir: string, scenarioDir: string = SCENARIO_DIR): Promise<string> {
  const { execFile } = await import("node:child_process");
  const tsx = join(ROOT, "node_modules/.bin/tsx");
  const cli = join(ROOT, "apps/hab-core/src/cli.ts");
  return new Promise((resolve, reject) => {
    execFile(tsx, [cli, "replay", scenarioDir, ...args, "--var-dir", varDir], { cwd: ROOT, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`replay ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout.trim().split("\n").at(-1)!);
    });
  });
}

/**
 * The real scenario as a live session starts: a copy of the folder whose scenario.json has no plan and no stop tasks (05 Scenario v2
 * makes both optional; `stop_tasks` needs `plan`), so SELECT_HAB_SITE is allowed until a plan is published. Returns the copy's path.
 */
export function planlessCopy(into: string): string {
  cpSync(SCENARIO_DIR, into, { recursive: true });
  const file = join(into, "scenario.json");
  const scenario = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  delete scenario.plan;
  delete scenario.stop_tasks;
  writeFileSync(file, `${JSON.stringify(scenario, null, 2)}\n`);
  return into;
}

/**
 * A list applied through the session API instead of the replay driver, so a test can drop a command and still approve the option
 * (the option id carries the alert id, which carries a seq, so it moves when a command is dropped): an APPROVE_OPTION whose id
 * names no proposed option is given the id of the VEHICLE_RENDEZVOUS option the session proposed. Runs until the EVA ends.
 */
export async function runListLive(list: CommandList, keep: (c: CommandList["commands"][number]) => boolean = () => true): Promise<LogEvent[]> {
  const { loadSession } = await import("../../src/session");
  const { loadForReplay } = await import("../../src/replay");
  const varDir = mkdtempSync(join(tmpdir(), "marswalk-live-list-"));
  try {
    const session = loadSession(loadForReplay(SCENARIO_DIR), varDir);
    const clock = (): number => Date.parse(session.snapshot([]).sim_time);
    let n = 0;
    for (const c of list.commands.filter(keep)) {
      while (clock() < Date.parse(c.sim_time)) session.advance(Math.min(600, Math.round((Date.parse(c.sim_time) - clock()) / 1000)));
      let args = c.args ?? {};
      if (c.kind === "APPROVE_OPTION") {
        const option = session.snapshot([]).options.find((o) => o.kind === "VEHICLE_RENDEZVOUS");
        if (option !== undefined) args = { option_id: option.option_id };
      }
      const out = session.apply({ command_id: `live-list-${++n}`, role: c.role, kind: c.kind, args }, "c-live");
      if (!out.result.ok) throw new Error(`${c.kind} at ${c.sim_time} was refused: ${JSON.stringify(out.result)}`);
    }
    while (session.snapshot([]).session.status === "RUNNING") session.advance(600);
    return session.eventsAfter(0);
  } finally {
    rmSync(varDir, { recursive: true, force: true });
  }
}
