/**
 * T28.05 at server level on the real scenario (backend package 27; NFR-10; 02 §A.6, §F; BD-02, BD-03, BD-77): kill the Hab Core
 * process and start it again with `--resume latest`. The browser half (a client that reconnects through the real UI) is package 28.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-149):
 * - A real kill: the server runs as its own process (`cli.ts start`), is brought to the storm alert over websockets, and gets
 *   SIGKILL, so nothing is flushed that the append-only log had not already written.
 * - The restarted process serves the same session: the SNAPSHOT a reconnecting client gets within 2 s of connecting has the same
 *   `last_seq` and `log_hash`, and the same crew, vehicles, alerts, options and tasks as the one the client had before the kill.
 * - The resume time (start of the process until it is listening, which includes loading the grid and re-running the ticks since the last
 *   snapshot) is measured and printed with the machine (BD-03, BD-77). The 500-event snapshot cadence is BD-77's ratified figure.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Snapshot } from "@marswalk/protocol";
import { ROOT, SKIP_REASON, hasRealBundle } from "./helpers/referenceRun";
import { connectWs } from "./helpers/wsClient";

if (!hasRealBundle) console.warn(`resume.test.ts skipped: ${SKIP_REASON}`);

const TSX = join(ROOT, "node_modules/.bin/tsx");
const CLI = join(ROOT, "apps/hab-core/src/cli.ts");

interface Running {
  child: ChildProcess;
  port: number;
  /** Milliseconds from the spawn to the "Hab Core on" line. */
  ready_ms: number;
  line: string;
}

function startProcess(varDir: string, extra: string[]): Promise<Running> {
  const t0 = performance.now();
  const child = spawn(TSX, [CLI, "start", "--site", "gale_boxwork", "--scenario", "storm-sol4190", "--port", "0", "--var-dir", varDir, ...extra], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  let errors = "";
  child.stderr!.on("data", (d: Buffer) => (errors += d.toString()));
  return new Promise((resolve, reject) => {
    child.stdout!.on("data", (d: Buffer) => {
      text += d.toString();
      const m = /Hab Core on http:\/\/[^:\s]+:(\d+)/.exec(text);
      if (m) resolve({ child, port: Number(m[1]), ready_ms: performance.now() - t0, line: text.split("\n").find((l) => l.startsWith("Hab Core on"))! });
    });
    child.once("exit", (code) => reject(new Error(`the Hab Core exited with ${String(code)} before it was listening: ${errors}`)));
    setTimeout(() => reject(new Error(`the Hab Core was not listening after 120 s: ${errors}`)), 120_000);
  });
}

const alive: ChildProcess[] = [];
const dirs: string[] = [];
afterAll(() => {
  for (const c of alive) if (c.exitCode === null) c.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!hasRealBundle)("kill and restart the Hab Core on the real scenario (T28.05, server level)", () => {
  it("resumes the session from disk: same last_seq and hash, same state, a SNAPSHOT within 2 s of a reconnect", async () => {
    const varDir = mkdtempSync(join(tmpdir(), "marswalk-resume-"));
    dirs.push(varDir);
    const first = await startProcess(varDir, []);
    alive.push(first.child);

    // Bring the session to the storm alert over websockets.
    const ops = await connectWs(`http://127.0.0.1:${first.port}`, "ops", "c-ops");
    const presenter = await connectWs(`http://127.0.0.1:${first.port}`, "presenter", "c-presenter");
    const slow = 180_000;
    expect((await ops.command("START_EVA", {}, slow)).result.ok).toBe(true);
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true);
    expect((await presenter.command("START_EVENT", { event_id: "storm" }, slow)).result.ok).toBe(true);
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true);
    expect((await presenter.command("JUMP_NEXT_STOP", {}, slow)).result.ok).toBe(true);
    const alert = await ops.waitFor((m) => m.type === "EVENT" && m.event.kind === "ALERT_RAISED" && (m.event.data as { code?: string }).code === "RADIATION_ALERT", 10_000);
    expect(alert).toBeDefined();
    ops.close();
    presenter.close();

    // What a client would see just before the kill (a fresh HELLO gets the SNAPSHOT).
    const watcher = await connectWs(`http://127.0.0.1:${first.port}`, "ops", "c-watch");
    const before = watcher.received.find((t) => t.message.type === "SNAPSHOT")!.message as Snapshot;
    watcher.close();
    expect(before.session.last_seq).toBeGreaterThan(10);
    expect(before.options.length, "the alert's options are in the state").toBeGreaterThan(0);

    // SIGKILL: no handler, no flush.
    const exited = new Promise<void>((resolve) => first.child.once("exit", () => resolve()));
    first.child.kill("SIGKILL");
    await exited;

    // Restart with --resume latest.
    const second = await startProcess(varDir, ["--resume", "latest"]);
    alive.push(second.child);
    const t0 = performance.now();
    const client = await connectWs(`http://127.0.0.1:${second.port}`, "ops", "c-after");
    const snapshot_ms = performance.now() - t0;
    const after = client.received.find((t) => t.message.type === "SNAPSHOT")!.message as Snapshot;
    client.close();
    const machine = `${cpus()[0]?.model ?? "cpu"}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GiB RAM, ${platform()} ${release()}, Node ${process.version}`;
    process.stderr.write(`T28.05 server level: resume ${(second.ready_ms / 1000).toFixed(1)} s to listening (${second.line}), reconnect to SNAPSHOT ${snapshot_ms.toFixed(0)} ms; last_seq ${before.session.last_seq}; machine ${machine}\n`);

    expect(after.session.session_id).toBe(before.session.session_id);
    expect(after.session.last_seq).toBe(before.session.last_seq);
    expect(after.session.log_hash).toBe(before.session.log_hash);
    expect(after.sim_time).toBe(before.sim_time);
    for (const key of ["crew", "vehicles", "alerts", "options", "tasks", "plan", "conditions"] as const) {
      expect(after[key], `the resumed ${key}`).toEqual(before[key]);
    }
    expect(snapshot_ms).toBeLessThan(2000);
  }, 600_000);
});
