/**
 * T22.12 with the real tick (T22.09): the snapshot written inside a tick batch, `log_hash`, and
 * kill and resume (docs/specs/05 §B; 02 §A.6; NFR-10, NFR-14).
 *
 * session.test.ts runs on a stand-in tick; this file runs the real one on the fake scenario
 * (F8, T22.02). `seedTasks` is still a stub (T31.04), so it is replaced by an empty seed.
 *
 * Bug fixed with this file: `runTicks` appended the tick's events (and so wrote the snapshot when
 * they crossed a multiple of SNAPSHOT_EVERY) before it stored the state tick returned. The snapshot
 * file then held the state from before the tick under the tick's last seq, and storing `r.state`
 * afterwards threw away the `log_hash` that the append had just set. The state is stored first now.
 *
 * Setup: commands bring `last_seq` to SNAPSHOT_EVERY − 2, so the two ARRIVED_STOP events of the
 * first stop (tick ceil(leg 0 time), from the fixture) are seqs SNAPSHOT_EVERY − 1 and
 * SNAPSHOT_EVERY: one tick batch that crosses the boundary exactly.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command, Role, Snapshot } from "@marswalk/protocol";
import { SNAPSHOT_EVERY } from "../src/log";
import { readScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

vi.mock("../src/engine/tasks", async () => {
  const actual = await vi.importActual<typeof import("../src/engine/tasks")>("../src/engine/tasks");
  return { ...actual, seedTasks: () => [] };
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const firstLeg = fake.scenario.plan.result.legs[0];
if (firstLeg.status !== "OK") throw new Error("the fixture's first leg is OK");
/** Ticks until the crew reach stop 1 (the end of the first leg). */
const ARRIVAL_TICKS = Math.ceil(firstLeg.walk_time_min * 60);

const dirs: string[] = [];
function varDir(): string {
  const d = mkdtempSync(join(tmpdir(), "marswalk-session-tick-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** Command ids restart for every run, so two runs of the same script write byte-identical logs. */
let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const snap = (s: SessionHandle): Snapshot => s.snapshot([]);
const sessionDir = (dir: string): string => join(dir, "sessions", "s-0001");

/** Load, START_EVA, then commands up to last_seq = SNAPSHOT_EVERY − 2, then every tick up to the arrival at stop 1. */
function runToBoundary(dir: string): { session: SessionHandle; events: ReturnType<SessionHandle["advance"]>["events"] } {
  n = 0;
  const s = loadSession(fake, dir);
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  while (snap(s).session.last_seq < SNAPSHOT_EVERY - 2) expect(s.apply(cmd("ops", "SET_CLOCK", { speed: snap(s).session.last_seq % 2 ? 10 : 60 }), "c-ops").result.ok).toBe(true);
  expect(snap(s).session.last_seq).toBe(SNAPSHOT_EVERY - 2);
  const { events } = s.advance(ARRIVAL_TICKS);
  return { session: s, events };
}

describe("session with the real tick (T22.12, T22.09)", () => {
  it("the tick batch that crosses SNAPSHOT_EVERY has the seqs the log gives, and no snapshot splits it", () => {
    const dir = varDir();
    const { events } = runToBoundary(dir);
    expect(events.map((e) => [e.seq, e.kind])).toEqual([
      [SNAPSHOT_EVERY - 1, "ARRIVED_STOP"],
      [SNAPSHOT_EVERY, "ARRIVED_STOP"],
    ]);
    expect(readdirSync(sessionDir(dir)).filter((f) => f.startsWith("snapshot-"))).toEqual([`snapshot-${SNAPSHOT_EVERY}.json`]);
  });

  it("the snapshot file written inside a tick batch holds the state after the tick, with the log_hash of the log so far", () => {
    const dir = varDir();
    const { session } = runToBoundary(dir);
    const live = snap(session);
    const file = JSON.parse(readFileSync(join(sessionDir(dir), `snapshot-${SNAPSHOT_EVERY}.json`), "utf8")) as { session: Snapshot["session"]; crew: Snapshot["crew"] };
    const lines = readFileSync(join(sessionDir(dir), "session.jsonl"), "utf8").split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(SNAPSHOT_EVERY);
    expect(file.session.last_seq).toBe(SNAPSHOT_EVERY);
    expect(file.session.clock.sim_time).toBe(live.sim_time);
    expect(file.crew).toEqual(live.crew);
    expect(file.session.log_hash).toBe(sha256(lines.map((l) => `${l}\n`).join("")));
    expect(live.session.log_hash).toBe(file.session.log_hash);
  });

  it("killing and restarting right after that batch resumes with the same last_seq, log_hash and state (NFR-10)", () => {
    const dir = varDir();
    const live = snap(runToBoundary(dir).session);
    const resumed = snap(resumeSession(sessionDir(dir), fake));
    expect(resumed.session.last_seq).toBe(live.session.last_seq);
    expect(resumed.session.log_hash).toBe(live.session.log_hash);
    expect(resumed).toEqual(live);
  });

  it("a session resumed from that snapshot goes on exactly like one that never stopped (the walk is not lost)", () => {
    const more = 2 * ARRIVAL_TICKS; // through the dwell and into the next leg
    const reference = runToBoundary(varDir()).session;
    const dir = varDir();
    runToBoundary(dir);
    const resumed = resumeSession(sessionDir(dir), fake);
    const a = reference.advance(more);
    const b = resumed.advance(more);
    expect(b.events.map((e) => [e.seq, e.kind, e.sim_time, e.data])).toEqual(a.events.map((e) => [e.seq, e.kind, e.sim_time, e.data]));
    expect(b.deltas).toEqual(a.deltas);
    expect(snap(resumed)).toEqual(snap(reference));
    expect(a.events.length).toBeGreaterThan(0);
  });
});
