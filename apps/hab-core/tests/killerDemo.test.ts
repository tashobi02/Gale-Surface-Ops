/**
 * T22.14 and T23.08 on the real scenario (backend package 27; NFR-02, NFR-06, NFR-10, NFR-14; 01 §E.1; BD-02, BD-77, BD-97).
 * The killer demo, headless: the reference list of 01 §E.1 on the real storm-sol4190 scenario and the real gale_boxwork bundle.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-149):
 * - Determinism: the scenario's own course twice and the reference list twice, each in its own process through the CLI (what
 *   `make replay` runs), give equal hashes within each pair; the reference hash is the one the verification log commits.
 * - The 60x run: a live server at 60x with one connected ops client, from the crew's arrival at stop 2 (just before the radiation
 *   alert, so the options and the storm are in it) for 20 sim minutes, the first five commands of the reference list being the bring-up. It completes (the clock reaches the end of
 *   the window within the wall time that 60x allows, plus 50 %), and the CPU the process used over the run, from
 *   `process.cpuUsage()`, is at most 30 % of one core (NFR-02, "engine CPU share"). The measure includes the in-process
 *   server and client, so it is an upper bound for the engine alone. The bring-up to stop 2 is not in the window.
 * - T23.08: the beats of 01 §E.1 0:30 to 1:10 come in order in the log: alert, options, rover dispatched (the approval), rover
 *   arrived, crew sheltered, EVA ended.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Command } from "@marswalk/protocol";
import { loadForReplay } from "../src/replay";
import { startServer } from "../src/server";
import { loadSession } from "../src/session";
import { connectWs } from "./helpers/wsClient";
import { REFERENCE_LIST, ROOT, SCENARIO_DIR, SKIP_REASON, cliReplay, firstOf, hasRealBundle, readReferenceList, runReference, type ReferenceRun } from "./helpers/referenceRun";

if (!hasRealBundle) console.warn(`killerDemo.test.ts skipped: ${SKIP_REASON}`);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-killer-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!hasRealBundle)("the killer demo, headless on the real scenario", () => {
  describe("T22.14: determinism", () => {
    it("the scenario's own course twice and the reference list twice, in four processes, give equal hashes in each pair", async () => {
      const [courseA, courseB, listA, listB] = await Promise.all([
        cliReplay([], tmp()),
        cliReplay([], tmp()),
        cliReplay(["--commands", REFERENCE_LIST], tmp()),
        cliReplay(["--commands", REFERENCE_LIST], tmp()),
      ]);
      expect(courseB).toBe(courseA);
      expect(listB).toBe(listA);
      expect(courseA).toMatch(/^[0-9a-f]{64}$/);
      expect(listA).not.toBe(courseA); // the list changes the course (jumps, the approval, the relay)
      const log = readFileSync(join(ROOT, "docs/ops/verification-log.md"), "utf8");
      expect(log, "the reference list's hash is committed in the verification log").toContain(listA);
      expect(log, "the scenario's own course hash is committed in the verification log").toContain(courseA);
    }, 300_000);
  });

  describe("T23.08: the order of the beats", () => {
    let run: ReferenceRun;
    beforeAll(async () => {
      run = await runReference();
    }, 240_000);

    it("alert, options, rover dispatched, rover arrived, crew sheltered, EVA ended, each once in this order (01 §E.1 0:30 to 1:10)", () => {
      const seq = (kind: string, where: (d: Record<string, unknown>) => boolean = () => true): number =>
        run.events.find((e) => e.kind === kind && where(e.data as Record<string, unknown>))?.seq ?? -1;
      const order = [
        seq("ALERT_RAISED", (d) => d.code === "RADIATION_ALERT"),
        seq("OPTIONS_PROPOSED"),
        seq("VEHICLE_DISPATCHED", (d) => d.vehicle_id === "PR1"),
        seq("VEHICLE_ARRIVED", (d) => d.vehicle_id === "PR1"),
        seq("CREW_SHELTERED"),
        seq("EVA_ENDED"),
      ];
      expect(order.every((s) => s > 0), `seqs ${order.join(", ")}`).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(run.events.filter((e) => e.kind === "CREW_SHELTERED").map((e) => (e.data as Record<string, unknown>).haven_kind)).toEqual(["vehicle", "vehicle"]);
    });

    it("the dose the crew received is below what the alert-time estimate said for walking to the hab (the decision pays off)", () => {
      const options = (firstOf(run.events, "OPTIONS_PROPOSED")!.data as { options: { kind: string; expected_dose_ugy: number }[] }).options;
      const abort = options.find((o) => o.kind === "ABORT_TO_HAB")!;
      const received = (firstOf(run.events, "CREW_SHELTERED")!.data as { dose_event_ugy: number }).dose_event_ugy;
      expect(received).toBeLessThan(abort.expected_dose_ugy);
    });
  });

  describe("T22.14: a 60x run with one connected ops client", () => {
    it("completes the window within the wall time 60x allows, using at most 30 % of one core", async () => {
      const WINDOW_SIM_S = 20 * 60;
      const list = readReferenceList();
      const loaded = loadForReplay(SCENARIO_DIR);
      const session = loadSession(loaded, tmp());
      let n = 0;
      const apply = (role: Command["role"], kind: Command["kind"], args: Record<string, unknown> = {}): void => {
        const out = session.apply({ command_id: `k-${++n}`, role, kind, args });
        expect(out.result.ok, `${kind}: ${JSON.stringify(out.result)}`).toBe(true);
      };
      const advanceTo = (iso: string): void => {
        while (Date.parse(session.snapshot([]).sim_time) < Date.parse(iso)) session.advance(Math.min(600, Math.round((Date.parse(iso) - Date.parse(session.snapshot([]).sim_time)) / 1000)));
      };
      // Bring-up, outside the measured window: the reference list up to the crew's arrival at stop 2 (the first five commands).
      for (const c of list.commands.slice(0, 5)) {
        advanceTo(c.sim_time);
        apply(c.role, c.kind, c.args ?? {});
      }
      const server = await startServer({ site: "gale_boxwork", port: 0, host: "127.0.0.1", session });
      const ops = await connectWs(server.url, "ops", "c-ops");
      try {
        expect((await ops.command("SET_CLOCK", { speed: 60 })).result.ok).toBe(true);
        const target = Date.parse(session.snapshot([]).sim_time) + WINDOW_SIM_S * 1000;
        const cpu0 = process.cpuUsage();
        const wall0 = performance.now();
        const budget_ms = (WINDOW_SIM_S / 60) * 1000 * 1.5;
        while (Date.parse(session.snapshot([]).sim_time) < target) {
          if (performance.now() - wall0 > budget_ms) throw new Error(`the 60x run did not reach the end of its window in ${budget_ms} ms; sim time ${session.snapshot([]).sim_time}`);
          await new Promise((r) => setTimeout(r, 50));
        }
        const wall_ms = performance.now() - wall0;
        const cpu = process.cpuUsage(cpu0);
        const share = (cpu.user + cpu.system) / 1000 / wall_ms;
        const types = new Set(ops.received.map((t) => t.message.type));
        expect(share, `CPU ${(cpu.user + cpu.system) / 1000} ms over ${wall_ms} ms`).toBeLessThanOrEqual(0.3);
        expect(types.has("STATE_DELTA"), "the ops client received deltas").toBe(true);
        expect(types.has("EVENT"), "the ops client received events (the alert and its options)").toBe(true);
        process.stderr.write(`T22.14 60x: window ${WINDOW_SIM_S} sim s in ${(wall_ms / 1000).toFixed(1)} s wall, CPU share ${(share * 100).toFixed(1)} % of one core, ${ops.received.length} messages\n`);
      } finally {
        ops.close();
        await server.close();
      }
    }, 300_000);
  });
});
