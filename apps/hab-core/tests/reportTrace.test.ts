/**
 * Backend package 20 (T27.01): the 30-s crew trace of the post-EVA report (05 U-24, BD-76) and the report's server side
 * (`GET /api/report`, `GET /api/log`, N-10).
 *
 * The trace is sampled by the session after each tick: one point per crew member whenever the sim clock is a multiple of 30 s
 * (a UTC second count, so two sessions of one scenario sample the same instants), at the position the snapshot shows at that
 * instant. The log holds no per-tick positions, so the points live in the engine state, are saved in snapshots, and a
 * resume re-derives the rest by re-running the ticks; the trace is `simulated`.
 * Runs on the fake scenario (F8): crew walk the straight 1000 m leg to stop 1 at the fixture's suited speed.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { backgroundDoseUgy } from "@marswalk/compute";
import type { Command, Role, Snapshot } from "@marswalk/protocol";
import { SNAPSHOT_EVERY } from "../src/log";
import { readScenario } from "../src/scenario";
import { startServer } from "../src/server";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const leg0 = fake.scenario.plan!.result.legs[0]!;
if (leg0.status !== "OK") throw new Error("the fixture's first leg is OK");
const ARRIVAL_TICKS = Math.ceil(leg0.walk_time_min * 60);
const STEP_S = 30;

const dirs: string[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const varDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-report-trace-"));
  dirs.push(d);
  return d;
};

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `t-${++n}`, role, kind, args });
const snap = (s: SessionHandle): Snapshot => s.snapshot([]);
const started = (dir: string): SessionHandle => {
  const s = loadSession(fake, dir);
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  return s;
};
const secondsOf = (iso: string): number => Date.parse(iso) / 1000;

describe("the 30 s trace (U-24, BD-76)", () => {
  it("has no points before the EVA runs and an entry per crew member after the first 30 s", () => {
    const s = loadSession(fake, varDir());
    expect(s.reportInputs().trace).toEqual([]);
    expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
    s.advance(STEP_S - 1);
    expect(s.reportInputs().trace.flatMap((t) => t.points)).toEqual([]);
    s.advance(1);
    const trace = s.reportInputs().trace;
    expect(trace.map((t) => t.crew_id)).toEqual(snap(s).crew.map((c) => c.crew_id));
    for (const t of trace) expect(t.points).toHaveLength(1);
  });

  it("has one point per 30 sim-s per crew member at multiples of 30 s, each equal to the position the snapshot showed then", () => {
    const s = started(varDir());
    const seen: { sim_time: string; pos: Record<string, [number, number]> }[] = [];
    const t0 = secondsOf(snap(s).sim_time);
    for (let tick = 1; tick <= 100; tick++) {
      s.advance(1);
      const now = snap(s);
      if (secondsOf(now.sim_time) % STEP_S === 0) seen.push({ sim_time: now.sim_time, pos: Object.fromEntries(now.crew.map((c) => [c.crew_id, [c.x_m, c.y_m]])) });
    }
    expect(seen.length).toBe(Math.floor((t0 + 100) / STEP_S) - Math.floor(t0 / STEP_S));
    const trace = s.reportInputs().trace;
    for (const t of trace) {
      expect(t.points.map((p) => p.sim_time)).toEqual(seen.map((x) => x.sim_time));
      expect(t.points.map((p) => [p.x_m, p.y_m])).toEqual(seen.map((x) => x.pos[t.crew_id]));
      // 30 sim-s apart, exactly.
      t.points.slice(1).forEach((p, i) => expect(secondsOf(p.sim_time) - secondsOf(t.points[i]!.sim_time)).toBe(STEP_S));
    }
    // The crew are walking: the last point is not the first (the trace shows movement, not a copy of the start).
    expect(trace[0]!.points.at(-1)).not.toEqual(trace[0]!.points[0]);
  });

  it("is the same after a kill and resume with no snapshot (every tick re-run), and after one that saved a snapshot", () => {
    for (const withSnapshot of [false, true]) {
      n = 0;
      const dir = varDir();
      const live = started(dir);
      if (withSnapshot) while (snap(live).session.last_seq < SNAPSHOT_EVERY - 2) expect(live.apply(cmd("ops", "SET_CLOCK", { speed: snap(live).session.last_seq % 2 ? 10 : 60 }), "c-ops").result.ok).toBe(true);
      // A resume re-runs ticks only up to the last logged event, so the live run stops at one: the arrival at stop 1.
      live.advance(ARRIVAL_TICKS);
      expect(live.eventsAfter(0).at(-1)!.kind).toBe("ARRIVED_STOP");
      const resumed = resumeSession(join(dir, "sessions", snap(live).session.session_id), fake);
      const liveTrace = live.reportInputs().trace;
      expect(liveTrace[0]!.points.length).toBeGreaterThan(30);
      expect(JSON.stringify(resumed.reportInputs().trace)).toBe(JSON.stringify(liveTrace));
    }
  });

  it("two sessions of the same scenario sample the same instants and positions (deterministic)", () => {
    const a = started(varDir());
    const b = started(varDir());
    a.advance(200);
    b.advance(200);
    expect(JSON.stringify(a.reportInputs().trace)).toBe(JSON.stringify(b.reportInputs().trace));
  });

  it("a reset session starts with no trace", () => {
    const s = started(varDir());
    s.advance(65);
    expect(s.reportInputs().trace[0]!.points.length).toBeGreaterThan(0);
    expect(s.apply(cmd("presenter", "RESET_SESSION"), "c-pres").result.ok).toBe(true);
    expect(s.reportInputs().trace).toEqual([]);
  });

  it("reportInputs gives the scenario's own dose series", () => {
    expect(loadSession(fake, varDir()).reportInputs().dose).toBe(fake.dose);
  });
});

describe("GET /api/report and GET /api/log on a real session (N-10)", () => {
  async function serve(): Promise<{ url: string; session: SessionHandle }> {
    const session = started(varDir());
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1", session });
    closers.push(() => server.close());
    return { url: server.url, session };
  }

  it("the report carries the planned background dose from compute, with the series' source id, and the 30 s trace", async () => {
    const { url, session } = await serve();
    session.advance(100);
    const body = (await (await fetch(`${url}/api/report`)).json()) as {
      dose: { planned_background_ugy: number | null; planned_background_reason: string | null; planned_background_source_id: string | null; provenance: Record<string, string> };
      trace: { crew_id: string; points: unknown[] }[];
    };
    const minutes = (fake.scenario.plan!.result.totals as { eva_total_min: number }).eva_total_min;
    expect(body.dose.planned_background_ugy).toBe(backgroundDoseUgy(fake.dose, minutes * 60));
    expect(body.dose.planned_background_reason).toBeNull();
    expect(body.dose.planned_background_source_id).toBe(fake.dose.source_id);
    expect(body.dose.provenance.planned_background_ugy).toBe("modelled");
    expect(body.trace.map((t) => t.crew_id)).toEqual(["EV1", "EV2"]);
    expect(body.trace[0]!.points.length).toBe(Math.floor((secondsOf(snap(session).sim_time)) / STEP_S) - Math.floor(secondsOf(fake.scenario.start_utc) / STEP_S));
  });

  it("the same log and state give the same report JSON twice", async () => {
    const { url, session } = await serve();
    session.advance(100);
    const a = await (await fetch(`${url}/api/report`)).text();
    const b = await (await fetch(`${url}/api/report`)).text();
    expect(b).toBe(a);
  });

  it("GET /api/log without `after` is the whole log as one JSON object per line; ?download=1 adds the attachment header", async () => {
    const { url, session } = await serve();
    session.advance(5);
    const whole = await fetch(`${url}/api/log`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-disposition")).toBeNull();
    const lines = (await whole.text()).split("\n").filter((l) => l !== "");
    expect(lines.length).toBe(session.eventsAfter(0).length);
    expect(lines.map((l) => (JSON.parse(l) as { seq: number }).seq)).toEqual(session.eventsAfter(0).map((e) => e.seq));
    expect(JSON.parse(lines[0]!)).toMatchObject({ seq: 1, kind: "SESSION_LOADED" });

    const download = await fetch(`${url}/api/log?download=1`);
    expect(download.headers.get("content-disposition")).toBe(`attachment; filename="${snap(session).session.session_id}.jsonl"`);
    expect(download.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await download.text()).toBe(lines.join("\n"));
    // After a seq still returns the tail; a download of the tail is still an attachment.
    const tail = await fetch(`${url}/api/log?after=1&download=1`);
    expect((await tail.text()).split("\n").length).toBe(lines.length - 1);
    expect((await fetch(`${url}/api/log?download=0`)).headers.get("content-disposition")).toBeNull();
  });
});
