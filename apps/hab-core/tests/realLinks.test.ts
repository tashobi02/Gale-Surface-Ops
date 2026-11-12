/**
 * T26.07 and T29.06 on the real scenario (backend package 27; FR-41, FR-42, FR-43, NFR-06; 02 §D.9, §D.11, §D.12; BD-102, BD-147):
 * the comm shadow, the Earth forecast and the relay rover against the real grid, the real Earth-link table and the real plan.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-149):
 * - T26.07: the demo shadow appears and clears at the sim times the committed recording holds (the recording is the
 *   recorded run), and the forecast the crew's Earth message waits for is delivered at compute's `deliveryTime` for its issue time.
 * - T29.06: the plan's ridge stop is out of the utility rover's reach (TASK_ROVER answers INVALID, BD-147), so the relay goes
 *   to the cell the reference list names (the one `relay-target.ts` returns). With it the shadow cautions clear earlier than
 *   in the same run without it, the rover parks as a relay, and the SNAPSHOT shows the rover's ETA and battery and a queued
 *   task's ETA and battery after it. The without-relay run is the reference list minus its TASK_ROVER command.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { deliveryTime } from "@marswalk/compute";
import { type EarthLinkTable, type EventMessage, type LogEvent, type ParamSet, type Recording } from "@marswalk/protocol";
import { loadForReplay } from "../src/replay";
import { loadSession } from "../src/session";
import { RECORDING_FILE, SCENARIO_DIR, SKIP_REASON, firstOf, hasRealBundle, readReferenceList, runListLive } from "./helpers/referenceRun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

if (!hasRealBundle) console.warn(`realLinks.test.ts skipped: ${SKIP_REASON}`);

const data = (e: LogEvent): Record<string, unknown> => e.data as Record<string, unknown>;
const shadows = (events: readonly LogEvent[]): LogEvent[] => events.filter((e) => e.kind === "ALERT_RAISED" && data(e).code === "COMM_SHADOW");
const clearedAt = (events: readonly LogEvent[], alert: LogEvent): string | undefined => events.find((e) => e.kind === "ALERT_CLEARED" && data(e).alert_id === data(alert).alert_id)?.sim_time;

describe.skipIf(!hasRealBundle)("the comm shadow, the forecast and the relay rover on the real scenario", () => {
  let recorded: LogEvent[];
  let withRelay: LogEvent[];
  let withoutRelay: LogEvent[];
  beforeAll(async () => {
    const recording = JSON.parse(readFileSync(RECORDING_FILE, "utf8")) as Recording;
    recorded = recording.messages.filter((m): m is EventMessage => m.type === "EVENT").map((m) => m.event);
    const list = readReferenceList();
    [withRelay, withoutRelay] = [await runListLive(list), await runListLive(list, (c) => c.kind !== "TASK_ROVER")];
  }, 400_000);

  describe("T26.07", () => {
    it("the demo shadow appears and clears at the sim times of the recorded run", () => {
      const live = shadows(withRelay);
      const rec = shadows(recorded);
      expect(live.length).toBeGreaterThanOrEqual(2); // one caution per crew member
      expect(live.map((e) => e.sim_time)).toEqual(rec.map((e) => e.sim_time));
      expect(live.map((e) => clearedAt(withRelay, e))).toEqual(rec.map((e) => clearedAt(recorded, e)));
      for (const e of live) expect(clearedAt(withRelay, e), `the caution of ${String(data(e).subjects)} clears`).toBeDefined();
    });

    it("the shadow appears when the EVA starts and clears before the crew are sheltered", () => {
      const started = firstOf(withRelay, "EVA_STARTED")!;
      const first = shadows(withRelay)[0]!;
      expect(Date.parse(first.sim_time) - Date.parse(started.sim_time)).toBeLessThanOrEqual(2000);
      const cleared = Date.parse(clearedAt(withRelay, first)!);
      expect(cleared).toBeLessThan(Date.parse(firstOf(withRelay, "CREW_SHELTERED")!.sim_time));
    });

    it("the forecast is delivered at compute's deliveryTime for its issue time", () => {
      const link = JSON.parse(readFileSync(join(SCENARIO_DIR, "earth_link.json"), "utf8")) as EarthLinkTable;
      const params = JSON.parse(readFileSync(join(SCENARIO_DIR, "param_sets/link-assumed.json"), "utf8")) as ParamSet;
      const queued = firstOf(withRelay, "EARTH_MSG_QUEUED")!;
      const rule = deliveryTime(link, "to_mars", data(queued).sent_utc as string, params)!;
      expect(new Date(data(queued).deliver_utc as string).toISOString()).toBe(new Date(rule.deliver_utc).toISOString());
      expect(data(queued).via).toBe(rule.via);
      // And the forecast is still in transit at the alert (01 §E.1 0:20): delivery is after the alert.
      const alert = firstOf(withRelay, "ALERT_RAISED", (e) => data(e).code === "RADIATION_ALERT")!;
      expect(Date.parse(data(queued).deliver_utc as string)).toBeGreaterThan(Date.parse(alert.sim_time));
    });
  });

  describe("T29.06", () => {
    it("the plan's ridge stop is out of the utility rover's reach: TASK_ROVER answers INVALID", () => {
      const varDir = mkdtempSync(join(tmpdir(), "marswalk-ridge-"));
      try {
        const session = loadSession(loadForReplay(SCENARIO_DIR), varDir);
        expect(session.apply({ command_id: "r-1", role: "ops", kind: "START_EVA", args: {} }).result.ok).toBe(true);
        session.advance(1);
        const plan = session.snapshot([]).plan!;
        const ridge = plan.waypoints.find((w) => w.role === "stop")!;
        const out = session.apply({ command_id: "r-2", role: "ops", kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RELAY", target: { x_m: ridge.x_m, y_m: ridge.y_m } } });
        expect(out.result.ok).toBe(false);
        expect(out.result).toMatchObject({ code: "INVALID" });
      } finally {
        rmSync(varDir, { recursive: true, force: true });
      }
    });

    it("with the relay the shadow cautions clear earlier than without it, and the rover parks as a relay", () => {
      const a = shadows(withRelay);
      const b = shadows(withoutRelay);
      expect(a.length).toBe(b.length);
      process.stderr.write(`T29.06: shadow cautions clear ${a.map((e) => clearedAt(withRelay, e)).join(", ")} with the relay, ${b.map((e) => clearedAt(withoutRelay, e)).join(", ")} without\n`);
      for (const [i, e] of a.entries()) {
        const withT = Date.parse(clearedAt(withRelay, e)!);
        const withoutT = Date.parse(clearedAt(withoutRelay, b[i]!)!);
        expect(withT, `caution ${i}: with ${clearedAt(withRelay, e)}, without ${clearedAt(withoutRelay, b[i]!)}`).toBeLessThan(withoutT);
      }
      const parked = firstOf(withRelay, "VEHICLE_ARRIVED", (e) => data(e).vehicle_id === "UR1")!;
      const task = firstOf(withRelay, "VEHICLE_DISPATCHED", (e) => data(e).vehicle_id === "UR1")!;
      expect(data(task).task).toBe("RELAY");
      expect(data(parked)).toMatchObject({ x_m: (data(task).target as { x_m: number }).x_m, y_m: (data(task).target as { y_m: number }).y_m });
      expect(withoutRelay.some((e) => e.kind === "VEHICLE_ARRIVED" && data(e).vehicle_id === "UR1")).toBe(false);
    });

    it("the SNAPSHOT shows the rover's ETA and battery, and a queued task's ETA and battery after it", () => {
      const varDir = mkdtempSync(join(tmpdir(), "marswalk-queue-"));
      try {
        const session = loadSession(loadForReplay(SCENARIO_DIR), varDir);
        const ref = readReferenceList();
        const relay = ref.commands.find((c) => c.kind === "TASK_ROVER")!;
        expect(session.apply({ command_id: "q-1", role: "ops", kind: "START_EVA", args: {} }).result.ok).toBe(true);
        session.advance(1);
        expect(session.apply({ command_id: "q-2", role: relay.role, kind: relay.kind, args: relay.args }).result.ok).toBe(true);
        expect(session.apply({ command_id: "q-3", role: "ops", kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RETURN" } }).result.ok).toBe(true);
        session.advance(60);
        const ur1 = session.snapshot([]).vehicles.find((v) => v.vehicle_id === "UR1")!;
        expect(ur1.task?.kind).toBe("RELAY");
        expect(ur1.eta_s).toBeGreaterThan(0);
        expect(ur1.battery_wh).toBeGreaterThan(0);
        expect(ur1.queue).toHaveLength(1);
        const queued = ur1.queue![0]!;
        expect(queued.kind).toBe("RETURN");
        expect(queued.eta_s!).toBeGreaterThan(ur1.eta_s!);
        expect(queued.battery_wh_after!).toBeGreaterThanOrEqual(0);
        expect(queued.battery_wh_after!).toBeLessThan(ur1.battery_wh!);
      } finally {
        rmSync(varDir, { recursive: true, force: true });
      }
    });
  });
});
