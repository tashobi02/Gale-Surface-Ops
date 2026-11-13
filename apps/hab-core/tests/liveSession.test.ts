/**
 * T32.29 on the real scenario (backend package 27; FR-51, FR-52, FR-53, FR-54, NFR-06, NFR-14; 02 §D.17; BD-03, BD-108):
 * a whole live session, scripted, then a second one after RESET_SESSION. The commands are the live ones: SELECT_HAB_SITE
 * (both candidates), SET_MISSION_SETUP, PUBLISH_PLAN with a task, START_EVA, the relay, Next stop, START_EVENT, the alert, the
 * approval of the rover rendezvous, CREW_SHELTERED, RESET_SESSION; then SELECT_HAB_SITE, PUBLISH_PLAN, START_EVA and Next stop
 * in the second session.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-149):
 * - The session goes through `hab-alternative` first (its time is the BD-03 line: at most 2 s) and back to `hab-first` before the
 *   plan is published: the demo plan starts at the first candidate's mast, and a plan that starts elsewhere than the hab would
 *   have the crew walk from a point that is not the hab.
 * - Both sessions are exported (`export-commands`); each exported list, replayed twice in its own process, gives the hash the
 *   live session had: the closed session's is the SHA-256 of its `session.jsonl`, the open one's its `log_hash`.
 * - `earth_link.json` covers the session: its first row is at or before the scenario start and its last at or after the last
 *   sim time and after the end of the dose series (BD-108); a table that did not would have to be rebuilt, never extrapolated.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Command, DoseSeries, EarthLinkTable, PlanExport, StopTaskSeed } from "@marswalk/protocol";
import { exportCommandLists, loadForReplay } from "../src/replay";
import { loadSession, type SessionHandle } from "../src/session";
import { SCENARIO_DIR, SKIP_REASON, cliReplay, hasRealBundle, planlessCopy } from "./helpers/referenceRun";

if (!hasRealBundle) console.warn(`liveSession.test.ts skipped: ${SKIP_REASON}`);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-live-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

describe.skipIf(!hasRealBundle)("a whole live session on the real scenario (T32.29)", () => {
  it("runs the live script, exports both sessions, and each exported list replays twice to its live hash", async () => {
    // The plan and its tasks come from the demo scenario; the session starts from a copy without them, as a live session does.
    const full = loadForReplay(SCENARIO_DIR).scenario;
    const plan = full.plan as PlanExport;
    const planless = planlessCopy(join(tmp(), "scenario"));
    const loaded = loadForReplay(planless);
    expect(loaded.scenario.plan).toBeUndefined();
    const varDir = tmp();
    const session: SessionHandle = loadSession(loaded, varDir);
    let n = 0;
    const clock = (): string => session.snapshot([]).sim_time;
    const apply = (role: Command["role"], kind: Command["kind"], args: Record<string, unknown> = {}): { ok: boolean; ms: number } => {
      const t0 = performance.now();
      const out = session.apply({ command_id: `live-${++n}`, role, kind, args }, "c-live");
      const ms = performance.now() - t0;
      expect(out.result.ok, `${kind}: ${JSON.stringify(out.result)}`).toBe(true);
      return { ok: out.result.ok, ms };
    };
    const advanceTo = (iso: string): void => {
      while (Date.parse(clock()) < Date.parse(iso)) session.advance(Math.min(600, Math.round((Date.parse(iso) - Date.parse(clock())) / 1000)));
    };
    const status = (): string => session.snapshot([]).session.status;
    const events = (): { kind: string; data: Record<string, unknown> }[] => session.eventsAfter(0).map((e) => ({ kind: e.kind, data: e.data as Record<string, unknown> }));

    // ---- Session 1: setup, plan with a task, the EVA, the storm, the decision --------------------------------------------
    const start = clock();
    const toAlternative = apply("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" });
    expect(toAlternative.ms, `SELECT_HAB_SITE hab-alternative took ${toAlternative.ms.toFixed(0)} ms`).toBeLessThanOrEqual(2000);
    expect(session.snapshot([]).session.hab_candidate_id).toBe("hab-alternative");
    const toFirst = apply("ops", "SELECT_HAB_SITE", { candidate_id: "hab-first" });
    expect(toFirst.ms, `SELECT_HAB_SITE hab-first took ${toFirst.ms.toFixed(0)} ms`).toBeLessThanOrEqual(2000);
    apply("ops", "SET_MISSION_SETUP", { max_haven_min: plan.scenario.max_haven_min });
    const tasks = full.stop_tasks as StopTaskSeed[];
    expect(tasks.length).toBeGreaterThan(0);
    apply("planner", "PUBLISH_PLAN", { plan, stop_tasks: tasks });
    expect(session.snapshot([]).tasks.map((t) => t.task_id).sort(), "the published tasks are in the session").toEqual(tasks.map((t) => t.task_id).sort());
    apply("ops", "START_EVA");
    expect(status()).toBe("RUNNING");
    advanceTo(plan.scenario.eva_start_utc);
    // The relay at the cell the reference run uses (its list names it), then the presses of the reference run.
    const ref = JSON.parse(readFileSync(join(SCENARIO_DIR, "reference_commands.json"), "utf8")) as { commands: { role: Command["role"]; kind: Command["kind"]; args: Record<string, unknown> }[] };
    const relay = ref.commands.find((c) => c.kind === "TASK_ROVER")!;
    advanceTo(new Date(Date.parse(clock()) + 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    apply(relay.role, relay.kind, relay.args);
    apply("presenter", "JUMP_NEXT_STOP"); // to stop 1
    const library = loaded.scenario.event_library;
    advanceTo(library[0]!.series_start_utc);
    apply("presenter", "START_EVENT", { event_id: library[0]!.event_id });
    apply("presenter", "JUMP_NEXT_STOP"); // to stop 2
    apply("presenter", "JUMP_NEXT_STOP"); // on to the alert
    const alert = events().find((e) => e.kind === "ALERT_RAISED" && e.data.code === "RADIATION_ALERT");
    expect(alert, "the radiation alert came").toBeDefined();
    const option = session.snapshot([]).options.find((o) => o.kind === "VEHICLE_RENDEZVOUS");
    expect(option, "the rover rendezvous is among the options").toBeDefined();
    apply("ops", "APPROVE_OPTION", { option_id: option!.option_id });
    while (status() === "RUNNING") session.advance(600);
    expect(status()).toBe("ENDED");
    expect(events().filter((e) => e.kind === "CREW_SHELTERED").length).toBe(2);
    const lastSimTime = clock();
    const sessionsDir = join(varDir, "sessions");
    const closedHash = ((): string => {
      apply("presenter", "RESET_SESSION");
      return sha256(readFileSync(join(sessionsDir, "s-0001", "session.jsonl"), "utf8"));
    })();

    // ---- Session 2: after the reset ------------------------------------------------------------------------------------
    expect(session.snapshot([]).session.session_id).toBe("s-0002");
    expect(session.snapshot([]).session.status).toBe("LOADED");
    apply("ops", "SELECT_HAB_SITE", { candidate_id: "hab-alternative" });
    apply("ops", "SELECT_HAB_SITE", { candidate_id: "hab-first" });
    apply("planner", "PUBLISH_PLAN", { plan, stop_tasks: tasks });
    apply("ops", "START_EVA");
    advanceTo(plan.scenario.eva_start_utc);
    apply("presenter", "JUMP_NEXT_STOP");
    const openHash = session.snapshot([]).session.log_hash;
    expect(openHash).toMatch(/^[0-9a-f]{64}$/);
    expect(openHash).not.toBe(closedHash);

    // ---- BD-108: the Earth-link table covers the sessions ------------------------------------------------------------
    const link = JSON.parse(readFileSync(join(SCENARIO_DIR, "earth_link.json"), "utf8")) as EarthLinkTable;
    const dose = JSON.parse(readFileSync(join(SCENARIO_DIR, "dose_series.json"), "utf8")) as DoseSeries;
    const span = [start, lastSimTime, dose.samples.at(-1)![0]].map(Date.parse);
    expect(Date.parse(link.rows[0]!.t_utc)).toBeLessThanOrEqual(Math.min(...span));
    expect(Date.parse(link.rows.at(-1)!.t_utc)).toBeGreaterThanOrEqual(Math.max(...span));

    // ---- Export both lists, replay each twice in its own process ---------------------------------------------------
    const out = tmp();
    const files = exportCommandLists(sessionsDir, out);
    expect(files.map((f) => f.split("/").at(-1))).toEqual(["s-0001.commands.json", "s-0002.commands.json"]);
    const [a1, a2, b1, b2] = await Promise.all([
      cliReplay(["--commands", files[0]!], tmp(), planless),
      cliReplay(["--commands", files[0]!], tmp(), planless),
      cliReplay(["--commands", files[1]!], tmp(), planless),
      cliReplay(["--commands", files[1]!], tmp(), planless),
    ]);
    expect([a1, a2], "session 1: both replays equal the live hash").toEqual([closedHash, closedHash]);
    expect([b1, b2], "session 2: both replays equal the live hash").toEqual([openHash, openHash]);
    process.stderr.write(`T32.29: SELECT_HAB_SITE ${toAlternative.ms.toFixed(0)} ms (alternative), ${toFirst.ms.toFixed(0)} ms (first); session 1 ${closedHash}; session 2 ${openHash}\n`);
  }, 900_000);
});
