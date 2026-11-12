/**
 * T20.08 (loopback and LAN address) and T31.08 (server level) on the real scenario (backend package 27; NFR-12, FR-30, FR-31,
 * FR-50; 02 §E.6; BD-02, BD-03): real `ws` clients against a started Hab Core with the real storm-sol4190 session.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-149):
 * - The virtual event has one laptop (BD-02), so the router check is replaced by a loopback run and, when the machine has a
 *   non-internal IPv4 address, a run through that address (the server listens on 0.0.0.0). A machine without one skips the
 *   second run with a printed reason; the rest still runs.
 * - Latency is the monotonic time from sending a command to the arrival of its EVENT at a client, measured in the clients.
 *   T20.08: three clients (two eva, one ops), 300 events (task toggles, sent in turn by each client, one at a time), the worst
 *   arrival over every receiving client is at most 500 ms (NFR-12; "GO" when so). T31.08: 50 taps (`UPDATE_STOP_TASK` from
 *   `eva:EV1`), the 95th percentile at the ops client under 500 ms.
 * - T31.08 abort: with the storm alert up, `ABORT` drops the open tasks of the dropped stops, and each of the three clients
 *   receives a TASK_DROPPED for each of them; the report's task counts equal the counts reduced from the session's `session.jsonl`.
 * - Task updates need a running EVA, so the first test starts it; the abort test then jumps on with the presenter's Next stop and
 *   Start storm, which pressed at that sim time shifts the series (U-62), so its alert is not the reference run's.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LogEvent, PostEvaReport, ServerMessage, StopTask } from "@marswalk/protocol";
import { loadForReplay } from "../src/replay";
import { startServer, type HabServer } from "../src/server";
import { loadSession } from "../src/session";
import { SCENARIO_DIR, SKIP_REASON, hasRealBundle } from "./helpers/referenceRun";
import { connectWs, type WsClient } from "./helpers/wsClient";

if (!hasRealBundle) console.warn(`latency.test.ts skipped: ${SKIP_REASON}`);

const lan = ((): string | null => {
  for (const list of Object.values(networkInterfaces())) for (const nic of list ?? []) if (nic.family === "IPv4" && !nic.internal) return nic.address;
  return null;
})();

const percentile = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)]!;
const eventOf = (m: ServerMessage): LogEvent | null => (m.type === "EVENT" ? m.event : null);

describe.skipIf(!hasRealBundle)("latency and the task flow over real websockets (T20.08, T31.08)", () => {
  let varDir: string;
  let server: HabServer;
  let port: number;
  let clients: WsClient[] = [];

  beforeAll(async () => {
    varDir = mkdtempSync(join(tmpdir(), "marswalk-latency-"));
    const session = loadSession(loadForReplay(SCENARIO_DIR), varDir);
    server = await startServer({ site: "gale_boxwork", port: 0, host: "0.0.0.0", session });
    port = Number(new URL(server.url).port);
  }, 120_000);
  afterAll(async () => {
    for (const c of clients) c.close();
    await server?.close();
    rmSync(varDir, { recursive: true, force: true });
  });

  async function trio(host: string): Promise<{ ops: WsClient; ev1: WsClient; ev2: WsClient }> {
    const url = `http://${host}:${port}`;
    const made = { ops: await connectWs(url, "ops", `c-ops-${host}`), ev1: await connectWs(url, "eva:EV1", `c-ev1-${host}`), ev2: await connectWs(url, "eva:EV2", `c-ev2-${host}`) };
    clients.push(made.ops, made.ev1, made.ev2);
    return made;
  }

  /** The tasks `role` may update before the EVA (crew EV1, EV2 or shared), by id. */
  const tasksOf = (c: WsClient): StopTask[] => (c.received.filter((t) => t.message.type === "SNAPSHOT").at(-1)!.message as { tasks: StopTask[] }).tasks;

  /**
   * Toggle tasks `count` times in turn by the three clients, one at a time; returns each receiver's latency per event, in ms.
   * Only the role that made a change may undo it (FR-50), so each client toggles a task of its own (ops the shared one, each
   * EVA its own crew member's) and a whole number of toggles per client leaves every task as it was.
   */
  async function toggleRound(c: { ops: WsClient; ev1: WsClient; ev2: WsClient }, count: number): Promise<number[]> {
    expect(count % 6).toBe(0);
    const tasks = tasksOf(c.ops);
    const own = [tasks.find((t) => t.crew_id === null), tasks.find((t) => t.crew_id === "EV1"), tasks.find((t) => t.crew_id === "EV2")];
    expect(own.every((t) => t !== undefined), "the plan has a shared task and one task per crew member").toBe(true);
    const senders = [c.ops, c.ev1, c.ev2] as const;
    const done = [false, false, false];
    const latencies: number[] = [];
    for (let i = 0; i < count; i++) {
      const k = i % 3;
      const sender = senders[k]!;
      const task = own[k]!;
      const marks = senders.map((s) => s.received.length);
      const args = done[k] ? { task_id: task.task_id, state: "TODO", undo: true } : { task_id: task.task_id, state: "DONE" };
      const { result, sent_ms } = await sender.command("UPDATE_STOP_TASK", args);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      done[k] = !done[k];
      const seq = (result as { event_seq: number }).event_seq;
      for (const [j, s] of senders.entries()) {
        const hit = await s.waitFor((m) => eventOf(m)?.seq === seq, 5000, marks[j]);
        latencies.push(hit.at_ms - sent_ms);
      }
    }
    return latencies;
  }

  it("T20.08 on loopback: 3 clients, 300 events, the worst fan-out is at most 500 ms (GO)", async () => {
    const c = await trio("127.0.0.1");
    // Task updates need a running EVA (BUSY while LOADED); the EVA starts here and the clock stays at its default speed.
    expect((await c.ops.command("START_EVA", {})).result.ok).toBe(true);
    const taps: number[] = [];
    // T31.08 first, on the same clients: 50 taps from eva:EV1, the ops client's arrival time.
    const tap = c.ev1;
    const tapTasks = tasksOf(c.ops).filter((t) => t.crew_id === "EV1");
    expect(tapTasks.length).toBeGreaterThan(0);
    let done = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const task = tapTasks[i % tapTasks.length]!;
      const undo = done.has(task.task_id);
      const mark = c.ops.received.length;
      const { result, sent_ms } = await tap.command("UPDATE_STOP_TASK", undo ? { task_id: task.task_id, state: "TODO", undo: true } : { task_id: task.task_id, state: "DONE" });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (undo) done.delete(task.task_id);
      else done.add(task.task_id);
      const hit = await c.ops.waitFor((m) => eventOf(m)?.seq === (result as { event_seq: number }).event_seq, 5000, mark);
      taps.push(hit.at_ms - sent_ms);
    }
    for (const id of done) await tap.command("UPDATE_STOP_TASK", { task_id: id, state: "TODO", undo: true });
    done = new Set();
    const p95 = percentile(taps, 0.95);
    process.stderr.write(`T31.08 taps: ${taps.length} taps, tap to ops EVENT p95 ${p95.toFixed(1)} ms, worst ${Math.max(...taps).toFixed(1)} ms\n`);
    expect(taps).toHaveLength(50);
    expect(p95).toBeLessThan(500);

    const latencies = await toggleRound(c, 300);
    const worst = Math.max(...latencies);
    process.stderr.write(`T20.08 loopback: 300 events, ${latencies.length} arrivals, worst ${worst.toFixed(1)} ms, p95 ${percentile(latencies, 0.95).toFixed(1)} ms${worst <= 500 ? " GO" : " NO-GO"}\n`);
    expect(latencies).toHaveLength(900);
    expect(worst).toBeLessThanOrEqual(500);
  }, 300_000);

  it.skipIf(lan === null)("T20.08 on the machine's LAN address: the same, through the first non-internal IPv4 (GO)", async () => {
    const c = await trio(lan!);
    const latencies = await toggleRound(c, 300);
    const worst = Math.max(...latencies);
    process.stderr.write(`T20.08 LAN ${lan}: 300 events, worst ${worst.toFixed(1)} ms${worst <= 500 ? " GO" : " NO-GO"}\n`);
    expect(worst).toBeLessThanOrEqual(500);
  }, 300_000);

  it("T31.08 abort: with the storm alert up, ABORT drops the open tasks of the dropped stops on every client, and the report's task counts equal the log's", async () => {
    const c = clients.slice(-3).length === 3 && lan !== null ? { ops: clients.at(-3)!, ev1: clients.at(-2)!, ev2: clients.at(-1)! } : await trio("127.0.0.1");
    const presenter = await connectWs(`http://127.0.0.1:${port}`, "presenter", "c-presenter");
    clients.push(presenter);
    const slow = 180_000;
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true); // to stop 1
    expect((await presenter.command("START_EVENT", { event_id: "storm" }, slow)).result.ok).toBe(true);
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true); // to stop 2
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true); // on to the alert
    const alert = await c.ops.waitFor((m) => eventOf(m)?.kind === "ALERT_RAISED" && (eventOf(m)!.data as { code?: string }).code === "RADIATION_ALERT", 10_000);
    expect(alert).toBeDefined();
    const marks = [c.ops, c.ev1, c.ev2].map((x) => x.received.length);
    const abort = await c.ops.command("ABORT", { crew: ["EV1", "EV2"] }, slow);
    expect(abort.result.ok, JSON.stringify(abort.result)).toBe(true);
    const revised = await c.ops.waitFor((m) => eventOf(m)?.kind === "PLAN_REVISED", 10_000, marks[0]);
    const dropped = (eventOf(revised.message)!.data as { stops_dropped: number[] }).stops_dropped;
    expect(dropped.length).toBeGreaterThan(0);
    const dropsAt = (x: WsClient, from: number): string[] => x.received.slice(from).flatMap((t) => (eventOf(t.message)?.kind === "TASK_DROPPED" ? [(eventOf(t.message)!.data as { task_id: string }).task_id] : [])).sort();
    await new Promise((r) => setTimeout(r, 300)); // the fan-out of the abort's events has arrived
    const seenBy = [c.ops, c.ev1, c.ev2].map((x, i) => dropsAt(x, marks[i]!));
    process.stderr.write(`T31.08 abort: stops dropped ${dropped.join(", ")}, TASK_DROPPED to ops, EV1 and EV2: ${seenBy.map((x) => x.length).join(", ")} (${seenBy[0]!.join(", ")})\n`);
    expect(seenBy[0]!.length, "the dropped stops had open tasks").toBeGreaterThan(0);
    expect(seenBy[1]).toEqual(seenBy[0]);
    expect(seenBy[2]).toEqual(seenBy[0]);

    // The report's counts equal the counts reduced from the session's own log file.
    const report = (await (await fetch(`http://127.0.0.1:${port}/api/report`)).json()) as PostEvaReport;
    const lines = readFileSync(join(varDir, "sessions", "s-0001", "session.jsonl"), "utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as LogEvent);
    const stateOf = new Map<string, { stop: string; state: string }>();
    for (const e of lines) {
      const d = e.data as Record<string, unknown>;
      if (e.kind === "TASK_ADDED") stateOf.set(d.task_id as string, { stop: d.stop_id as string, state: "TODO" });
      else if (e.kind === "TASK_UPDATED") stateOf.get(d.task_id as string)!.state = d.state as string;
      else if (e.kind === "TASK_DROPPED") stateOf.get(d.task_id as string)!.state = "DROPPED";
    }
    const count = (pred: (s: { stop: string; state: string }) => boolean): number => [...stateOf.values()].filter(pred).length;
    expect(report.tasks).toMatchObject({ total: stateOf.size, done: count((s) => s.state === "DONE"), skipped: count((s) => s.state === "SKIPPED"), dropped: count((s) => s.state === "DROPPED") });
    expect(report.tasks.dropped).toBe(seenBy[0]!.length);
    for (const [stop, counts] of Object.entries(report.tasks.per_stop)) {
      expect(counts).toEqual({ total: count((s) => s.stop === stop), done: count((s) => s.stop === stop && s.state === "DONE"), skipped: count((s) => s.stop === stop && s.state === "SKIPPED"), dropped: count((s) => s.stop === stop && s.state === "DROPPED") });
    }
  }, 600_000);
});
