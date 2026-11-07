/**
 * T22.12: session manager — load, commands, persistence, resume (docs/specs/05 Session, §B; 02 §A.6;
 * FR-30, FR-34, NFR-10). Acceptance: killing and restarting the Hab Core mid-scenario resumes with
 * the same `last_seq` and `log_hash`.
 *
 * tick (T22.09) and seedTasks (T31.04) are still stubs, so this file replaces them with small
 * deterministic stand-ins that follow the tick.ts state rule: EV1 moves +1 m per step while WALKING
 * (a STATE_DELTA, not logged) and arrives at stop 1 at t = 30 s (a logged ARRIVED_STOP, already
 * reduced into the returned state).
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command, Role, Snapshot } from "@marswalk/protocol";
import type { EngineState } from "../src/engine/reducer";
import type { TickResult } from "../src/engine/tick";
import { readScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

vi.mock("../src/engine/tick", async () => {
  const { reduce } = await vi.importActual<typeof import("../src/engine/reducer")>("../src/engine/reducer");
  return {
    tick(state: EngineState, scenario: unknown, dt_s: number, next_seq: number): TickResult {
      const t_s = (Date.parse(state.session.clock.sim_time) - Date.parse("2024-05-20T00:00:00Z")) / 1000;
      const ev1 = state.crew.find((c) => c.crew_id === "EV1")!;
      let next = state;
      const deltas = [];
      if (ev1.activity === "WALKING") {
        next = { ...next, crew: next.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: c.x_m + dt_s } : c)) };
        deltas.push({ path: "crew/EV1/x_m", value: ev1.x_m + dt_s });
      }
      const events = [];
      if (t_s === 30 && ev1.activity === "WALKING") {
        const pending = { sim_time: state.session.clock.sim_time, kind: "ARRIVED_STOP" as const, actor: "system" as const, data: { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }, provenance: {} };
        next = reduce(next, { ...pending, seq: next_seq });
        events.push(pending);
      }
      return { state: next, events, deltas };
    },
  };
});

vi.mock("../src/engine/tasks", async () => {
  const actual = await vi.importActual<typeof import("../src/engine/tasks")>("../src/engine/tasks");
  return { ...actual, seedTasks: () => [] };
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const dirs: string[] = [];
function varDir(): string {
  const d = mkdtempSync(join(tmpdir(), "marswalk-session-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const state = (s: SessionHandle): Snapshot => s.snapshot([]);
const sessionDir = (dir: string, id = "s-0001"): string => join(dir, "sessions", id);

/** Load, start the EVA, walk 40 s (arrive at 30 s), change speed at 40 s. */
function scripted(dir: string): SessionHandle {
  const s = loadSession(fake, dir);
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  s.advance(40);
  expect(s.apply(cmd("ops", "SET_CLOCK", { speed: 10 }), "c-ops").result.ok).toBe(true);
  return s;
}

describe("session manager (T22.12)", () => {
  it("LOAD: a new session s-0001 logs SESSION_LOADED and builds the initial state", () => {
    const dir = varDir();
    const s = loadSession(fake, dir);
    const snap = state(s);
    expect(snap.seq).toBe(1);
    expect(snap.session).toMatchObject({ session_id: "s-0001", scenario_id: "fake-straight-line", status: "LOADED", last_seq: 1 });
    expect(s.eventsAfter(0).map((e) => [e.kind, e.data, e.command_ref])).toEqual([
      ["SESSION_LOADED", { session_id: "s-0001", scenario_id: "fake-straight-line", data_version: "mock_site-fixture", seed: 4190, plan_hash: fake.scenario.plan.plan_hash }, null],
    ]);
    expect(snap.session.log_hash).toBe(sha256(readFileSync(join(sessionDir(dir), "session.jsonl"), "utf8")));
  });

  it("sim time holds until the EVA starts", () => {
    const s = loadSession(fake, varDir());
    expect(s.advance(10)).toEqual({ events: [], deltas: [] });
    expect(state(s).sim_time).toBe(fake.scenario.start_utc);
  });

  it("each step: clock → tick → append → reduce; deltas and events go back to the server", () => {
    const s = loadSession(fake, varDir());
    const start = s.apply(cmd("ops", "START_EVA"), "c-ops");
    expect(start.result).toMatchObject({ ok: true, event_seq: 2 });
    const out = s.advance(40);
    expect(out.events.map((e) => [e.seq, e.kind, e.sim_time])).toEqual([[3, "ARRIVED_STOP", "2024-05-20T00:00:30Z"]]);
    expect(out.deltas.at(-1)).toEqual({ path: "crew/EV1/x_m", value: 30 });
    const snap = state(s);
    expect(snap.sim_time).toBe("2024-05-20T00:00:40Z");
    expect(snap.crew.find((c) => c.crew_id === "EV1")).toMatchObject({ activity: "AT_STOP", x_m: 30 });
    expect(snap.session.last_seq).toBe(3);
  });

  it("commands go through commands.ts: rejections are logged, repeats are answered from memory", () => {
    const s = loadSession(fake, varDir());
    const bad = s.apply(cmd("eva:EV1", "START_EVA"), "c-ev1");
    expect(bad.result).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
    expect(bad.events.map((e) => [e.kind, e.command_ref])).toEqual([["COMMAND_REJECTED", { client_id: "c-ev1", command_id: bad.result.command_id }]]);
    const c = cmd("ops", "START_EVA");
    const first = s.apply(c, "c-ops");
    const again = s.apply({ ...c, queued_offline: true }, "c-ops");
    expect(again).toEqual({ result: first.result, events: [] });
  });

  it("JUMP_NEXT_EVENT runs ticks until the next event", () => {
    const s = loadSession(fake, varDir());
    s.apply(cmd("ops", "START_EVA"), "c-ops");
    const jump = s.apply(cmd("ops", "JUMP_NEXT_EVENT"), "c-ops");
    expect(jump.events.map((e) => e.kind)).toEqual(["ARRIVED_STOP"]);
    expect(jump.result).toMatchObject({ ok: true, event_seq: jump.events[0].seq });
    expect(state(s).sim_time).toBe("2024-05-20T00:00:30Z");
  });

  it("LOAD_SCENARIO reloads into a new session folder", () => {
    const dir = varDir();
    const s = loadSession(fake, dir);
    const reload = s.apply(cmd("ops", "LOAD_SCENARIO", { scenario_id: "fake-straight-line" }), "c-ops");
    expect(reload.result).toMatchObject({ ok: true, event_seq: 1 });
    expect(state(s).session.session_id).toBe("s-0002");
    expect(readdirSync(join(dir, "sessions")).sort()).toEqual(["s-0001", "s-0002"]);
  });

  it("killing and restarting mid-scenario resumes with the same last_seq, log_hash and state (NFR-10)", () => {
    const dir = varDir();
    const live = state(scripted(dir));
    const resumed = state(resumeSession(sessionDir(dir), fake));
    expect(resumed.session.last_seq).toBe(live.session.last_seq);
    expect(resumed.session.log_hash).toBe(live.session.log_hash);
    expect(resumed).toEqual(live);
  });

  it("a resumed session keeps the accepted command ids and keeps logging where it stopped", () => {
    const dir = varDir();
    const s = loadSession(fake, dir);
    const c = cmd("ops", "START_EVA");
    const first = s.apply(c, "c-ops");
    const r = resumeSession(sessionDir(dir), fake);
    expect(r.apply(c, "c-ops")).toEqual({ result: first.result, events: [] });
    expect(r.advance(30).events.map((e) => e.seq)).toEqual([3]);
  });

  it("writes a snapshot when a batch crosses 500 events, and resumes from it", () => {
    const dir = varDir();
    const s = loadSession(fake, dir);
    s.apply(cmd("ops", "START_EVA"), "c-ops");
    for (let i = 0; i < 510; i++) s.apply(cmd("ops", "SET_CLOCK", { speed: i % 2 ? 10 : 60 }), "c-ops");
    expect(readdirSync(sessionDir(dir)).filter((f) => f.startsWith("snapshot-"))).toEqual(["snapshot-500.json"]);
    s.advance(5);
    const live = state(s);
    // The last event is at t = 0, so the resumed session restarts there; compare everything else.
    const resumed = state(resumeSession(sessionDir(dir), fake));
    expect(resumed.session.last_seq).toBe(live.session.last_seq);
    expect(resumed.session.log_hash).toBe(live.session.log_hash);
    expect(resumed.session.clock.speed).toBe(live.session.clock.speed);
  });
});
