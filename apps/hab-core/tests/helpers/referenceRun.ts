/**
 * Shared set-up of the tests that run the real storm-sol4190 scenario on the real gale_boxwork bundle (backend packages 26, 27).
 * The bundle's binaries are git-ignored (a release asset), so these tests skip with a printed reason when it is absent; the
 * run that finishes the project has the bundle, and there nothing may be skipped.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
