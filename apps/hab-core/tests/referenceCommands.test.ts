/**
 * T32.18, T21.09, T21.10 and the recording of T27.05 (backend package 26; FR-34, FR-38, FR-43, NFR-06, NFR-14; 01 §E.1; 02 §D.13,
 * §D.17; BD-97, BD-105, BD-147, BD-148): the reference run of 01 §E.1 on the real storm-sol4190 scenario and the real
 * gale_boxwork bundle. One headless run of `scenarios/storm-sol4190/reference_commands.json` feeds every check.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-147):
 * - Every `sim_time` of the list is the sim time of a log line of the same run, and the list's `$comment` cites those lines
 *   as `seq <n> <KIND>`; this test reads the cited seq from the log and checks the kind and the time.
 * - 01 §E.1 states only values of this run (or of the committed tables, the other test); each number below is formatted from
 *   the log and must appear in the section, and the section has no placeholder, open-choice marker or "illustrative" left.
 * - The committed recording is this run's: same bytes, and its EVENTs alone hash to the log hash (N-81).
 * - T21.10: each 02 §D.13 timeline row has its source time, its scenario time and a match; a row whose source time is not in
 *   the scenario is shown as such, never matched and never adjusted.
 * Skipped with a printed reason without the real bundle; the finishing run has it, and 0 may be skipped there.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { deliveryTime, linkAt, roundTo, SUN_ELEVATION_DECIMALS, triggerState } from "@marswalk/compute";
import { logHashOf, type EarthLinkTable, type DoseSeries, type LogEvent, type ParamSet, type Recording } from "@marswalk/protocol";
import { checkCommandList } from "../src/replay";
import { RECORD_PERIOD_S, RECORDING_FILE, ROOT, SCENARIO_DIR, SKIP_REASON, firstOf, hasRealBundle, readReferenceList, recordingJson, runReference, type ReferenceRun } from "./helpers/referenceRun";

if (!hasRealBundle) console.warn(`referenceCommands.test.ts skipped: ${SKIP_REASON}`);

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const text = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const json = <T>(rel: string): T => JSON.parse(text(rel)) as T;
const data = (e: LogEvent): Record<string, unknown> => e.data as Record<string, unknown>;

/** The section of 01 from "### E.1" to the next heading. */
function e1Section(): string {
  const md = text("docs/specs/01_Product_Requirements_Document.md");
  const start = md.search(/^### E\.1\b/m);
  const rest = md.slice(start).replace(/^[^\n]*\n/, "");
  const next = rest.search(/^#{1,3} /m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe.skipIf(!hasRealBundle)("the reference run of 01 §E.1 (real scenario, real bundle)", () => {
  let run: ReferenceRun;
  beforeAll(async () => {
    run = await runReference();
  }, 240_000);

  const alert = (): LogEvent => firstOf(run.events, "ALERT_RAISED", (e) => data(e).code === "RADIATION_ALERT")!;
  const options = (): LogEvent => firstOf(run.events, "OPTIONS_PROPOSED")!;
  const option = (kind: string): Record<string, unknown> => ((data(options()).options as Record<string, unknown>[]).find((o) => o.kind === kind))!;
  const shelterEvents = (): LogEvent[] => run.events.filter((e) => e.kind === "CREW_SHELTERED");

  describe("T32.18: the reference list", () => {
    it("is a valid command list for the scenario, in time order, with the session id the log starts under", () => {
      const list = readReferenceList();
      expect(() => checkCommandList(list, "storm-sol4190")).not.toThrow();
      const times = list.commands.map((c) => Date.parse(c.sim_time));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(list.session_id).toBe(((run.events[0]!.data as Record<string, unknown>).session_id as string));
      expect(list.seed).toBe(((run.events[0]!.data as Record<string, unknown>).seed as number));
    });

    it("every `seq <n> <KIND>` its $comment cites is that line of the log, and every command time is a cited or derived log time", () => {
      const list = readReferenceList();
      const cited = [...list.$comment.matchAll(/seq (\d+) ([A-Z_]+)/g)];
      expect(cited.length).toBeGreaterThanOrEqual(6);
      for (const [, seq, kind] of cited) expect(run.events[Number(seq) - 1]?.kind, `seq ${seq}`).toBe(kind);

      const startEva = firstOf(run.events, "EVA_STARTED")!;
      const firstShadow = firstOf(run.events, "ALERT_RAISED", (e) => data(e).code === "COMM_SHADOW")!;
      const storm = firstOf(run.events, "EVENT_STARTED")!;
      const jumps = run.events.filter((e) => e.kind === "CLOCK_JUMPED");
      const [, second, third] = jumps;
      const expected: [string, string][] = [
        ["START_EVA", startEva.sim_time],
        ["TASK_ROVER", firstShadow.sim_time],
        ["JUMP_NEXT_STOP", firstShadow.sim_time],
        ["START_EVENT", data(storm).series_start_utc as string],
        ["JUMP_NEXT_STOP", data(storm).t0_sim_time as string],
        ["JUMP_NEXT_STOP", data(second!).to_sim_time as string],
        ["APPROVE_OPTION", options().sim_time],
      ];
      expect(list.commands.map((c) => [c.kind, c.sim_time])).toEqual(expected);
      expect(data(third!).ended_by).toBe("alert");
      expect(list.commands.at(-1)!.args).toEqual({ option_id: `${data(alert()).alert_id as string}:VEHICLE_RENDEZVOUS` });
    });

    it("the relay and the rest of the list are accepted: no COMMAND_REJECTED in the run", () => {
      expect(run.events.filter((e) => e.kind === "COMMAND_REJECTED")).toEqual([]);
    });

    it("ops, not eva:EV1, approves because both suits are unlinked at the alert (the NO_LINK rule), as the decision says", () => {
      for (const crew of ["EV1", "EV2"]) {
        const last = run.events.filter((e) => (e.kind === "LINK_LOST" || e.kind === "LINK_RESTORED") && data(e).node_id === crew && e.seq < options().seq).at(-1);
        expect(last?.kind, `${crew} link before the options`).toBe("LINK_LOST");
      }
    });

    it("01 §E.1 order holds: alert, options, rover dispatched, rover arrived, crew sheltered, EVA ended", () => {
      const order = ["RADIATION_ALERT", "OPTIONS_PROPOSED", "VEHICLE_DISPATCHED:PR1", "VEHICLE_ARRIVED:PR1", "CREW_SHELTERED", "EVA_ENDED"];
      const at = (key: string): number => {
        const [kind, who] = key.split(":");
        const e = run.events.find((x) => (kind === "RADIATION_ALERT" ? x.kind === "ALERT_RAISED" && data(x).code === kind : x.kind === kind) && (who === undefined || data(x).vehicle_id === who));
        return e?.seq ?? -1;
      };
      const seqs = order.map(at);
      expect(seqs.every((s) => s > 0)).toBe(true);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    });
  });

  describe("determinism and the recording (T22.14, T27.05)", () => {
    it("delivers the storm forecast after EVA end at the relay time computed from the real table (N-213)", () => {
      const queued = run.events.find((e) => e.kind === "EARTH_MSG_QUEUED" && e.actor === "system")!;
      const end = firstOf(run.events, "EVA_ENDED")!;
      const delivered = run.events.filter((e) => e.kind === "EARTH_MSG_DELIVERED" && data(e).message_id === data(queued).message_id);
      const table = json<EarthLinkTable>("scenarios/storm-sol4190/earth_link.json");
      const params = json<ParamSet>("scenarios/storm-sol4190/param_sets/link-assumed.json");
      const expected = deliveryTime(table, "to_mars", data(queued).sent_utc as string, params)!;
      expect(delivered).toHaveLength(1);
      expect(Date.parse(delivered[0].sim_time)).toBe(Date.parse(expected.deliver_utc));
      expect(Date.parse(delivered[0].sim_time)).toBeGreaterThan(Date.parse(end.sim_time));
    });

    it("the committed recording is this run's: same log hash, same bytes", () => {
      expect(run.recording.log_hash).toBe(run.hash);
      const committed = readFileSync(RECORDING_FILE, "utf8");
      expect(recordingJson(run.recording)).toBe(committed);
      expect((JSON.parse(committed) as Recording).log_hash).toBe(run.hash);
    });

    it("its EVENTs are the whole log: seq 1..n, hashing to the log hash, and the file is under 5 MB", () => {
      expect(run.events.map((e) => e.seq)).toEqual(run.events.map((_, i) => i + 1));
      expect(logHashOf(run.events, sha256)).toBe(run.hash);
      expect(Buffer.byteLength(readFileSync(RECORDING_FILE, "utf8"))).toBeLessThan(5 * 1024 * 1024);
      expect(RECORD_PERIOD_S).toBe(5);
    });

    it("the sun elevation it carries is at the documented precision, so the bytes are the same on every platform (NFR-06)", () => {
      // A one-ULP difference in the platform's libm used to move these values by one unit in the last place, so the
      // committed bytes could not be reproduced on another machine (NFR-06, T27.05).
      const elevations: number[] = [];
      for (const message of run.recording.messages) {
        if (message.type !== "STATE_DELTA") continue;
        for (const change of message.changes) {
          if (change.path === "conditions/sun_elevation_deg") elevations.push(change.value as number);
        }
      }
      expect(elevations.length).toBeGreaterThan(100);
      for (const value of elevations) expect(value).toBe(roundTo(value, SUN_ELEVATION_DECIMALS));
    });

    it("two runs of the reference list give byte-identical recordings", async () => {
      const again = await runReference();
      expect(recordingJson(again.recording)).toBe(recordingJson(run.recording));
      expect(again.hash).toBe(run.hash);
      // This is a second complete real replay, just like beforeAll above; it is
      // a reproducibility check, so it uses the same budget. CPU/60x limits are
      // independently enforced by killerDemo.test.ts.
    }, 240_000);
  });

  describe("T21.09: 01 §E.1 holds only sourced numbers", () => {
    const section = (): string => e1Section();
    const min1 = (x: number): string => (x / 60).toFixed(1);
    const ugy1 = (x: number): string => x.toFixed(1);

    it("has no placeholder, open-choice marker or 'illustrative' left", () => {
      const s = section();
      expect(s).not.toMatch(/TODO\((verify|decision)\)/);
      expect(s).not.toMatch(/illustrative/i);
      expect(s).not.toMatch(/\bX min\b|\bY min\b/);
    });

    it("states the EVA start of the plan and the stop-2 arrival and alert times of the log", () => {
      const s = section();
      const plan = json<{ scenario: { eva_start_utc: string } }>("scenarios/storm-sol4190/plan.json");
      expect(s).toContain(plan.scenario.eva_start_utc);
      expect(s).toContain(alert().sim_time);
    });

    it("states each option's time to shelter and expected dose", () => {
      const s = section();
      for (const kind of ["VEHICLE_RENDEZVOUS", "ABORT_TO_HAB", "CONTINUE_SKIP"]) {
        const o = option(kind);
        expect(s, `${kind} ETA`).toContain(`${(o.eta_shelter_min as number).toFixed(1)} min`);
        expect(s, `${kind} dose`).toContain(`${ugy1(o.expected_dose_ugy as number)} µGy`);
      }
    });

    it("states the rendezvous walk, the rover's drive and the steepest cell against the plan's hard limit", () => {
      const s = section();
      const r = option("VEHICLE_RENDEZVOUS").rendezvous as { eta_crew_s: number; eta_vehicle_s: number };
      expect(s).toContain(`${min1(r.eta_crew_s)} min`);
      expect(s).toContain(`${min1(r.eta_vehicle_s)} min`);
      const revised = firstOf(run.events, "PLAN_REVISED")!;
      const legs = data(revised).legs as { max_slope_deg: number }[];
      expect(s).toContain(`${legs.at(-1)!.max_slope_deg}°`);
      const plan = json<{ scenario: { hard_slope_limit_deg: number } }>("scenarios/storm-sol4190/plan.json");
      expect(s).toContain(`${plan.scenario.hard_slope_limit_deg}° hard limit`);
    });

    it("states the comm shadow, the relay and the shelter times and the dose of the crew", () => {
      const s = section();
      const time = (iso: string): string => iso.slice(11, 19);
      const shadows = run.events.filter((e) => e.kind === "ALERT_RAISED" && data(e).code === "COMM_SHADOW");
      const cleared = run.events.find((e) => e.kind === "ALERT_CLEARED" && data(e).alert_id === data(shadows[0]!).alert_id)!;
      const relayArrived = firstOf(run.events, "VEHICLE_ARRIVED", (e) => data(e).vehicle_id === "UR1")!;
      const relayTask = firstOf(run.events, "VEHICLE_DISPATCHED", (e) => data(e).vehicle_id === "UR1")!;
      const target = data(relayTask).target as { x_m: number; y_m: number };
      for (const t of [shadows[0]!.sim_time, cleared.sim_time, relayArrived.sim_time, shelterEvents()[0]!.sim_time]) expect(s, t).toContain(time(t));
      expect(s).toContain(`(${target.x_m}, ${target.y_m})`.replace(/-/g, "−"));
      const sheltered = data(shelterEvents()[0]!);
      expect(s).toContain(`${ugy1(sheltered.dose_event_ugy as number)} µGy`);
    });

    it("states the light time and the next relay pass of the committed tables at the alert (01 §E.1 0:20 row)", () => {
      const link = json<EarthLinkTable>("scenarios/storm-sol4190/earth_link.json");
      const row = linkAt(link, alert().sim_time)!;
      expect(section()).toContain(`${(row.light_time_s / 60).toFixed(1)} min`);
    });
  });

  describe("T21.10: the 02 §D.13 timeline, source time against scenario time", () => {
    const series = (): DoseSeries => json<DoseSeries>("scenarios/storm-sol4190/dose_series.json");
    const link = (): EarthLinkTable => json<EarthLinkTable>("scenarios/storm-sol4190/earth_link.json");
    const linkParams = (): ParamSet => json<ParamSet>("scenarios/storm-sol4190/param_sets/link-assumed.json");
    const alertParams = (): ParamSet => json<ParamSet>("scenarios/storm-sol4190/param_sets/alert-assumed.json");
    const scenario = (): { event_library: { series_start_utc: string; inputs: { kind: string; t_offset_s: number; payload: Record<string, unknown> }[] }[] } => json("scenarios/storm-sol4190/scenario.json");
    const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

    it("Earth forecast reaches Mars: the issue time is the scenario's EARTH_MESSAGE input; the delivery time is compute's rule at that time and the engine's queued delivery", () => {
      const lib = scenario().event_library[0]!;
      const input = lib.inputs.find((i) => i.kind === "EARTH_MESSAGE")!;
      const issue = iso(Date.parse(lib.series_start_utc) + input.t_offset_s * 1000);
      const source = deliveryTime(link(), "to_mars", issue, linkParams())!.deliver_utc;
      const queued = firstOf(run.events, "EARTH_MSG_QUEUED")!;
      expect(data(queued).sent_utc).toBe(issue);
      expect(new Date(data(queued).deliver_utc as string).toISOString()).toBe(new Date(source).toISOString());
    });

    it("SEP onset at Gale: the first RAD sample above the alert threshold, and the engine's alert on the second consecutive one", () => {
      const s = series();
      const threshold = data(alert()).threshold_ugy_h as number;
      const onset = s.samples.findIndex(([, rate]) => rate !== null && rate > threshold);
      expect(onset).toBeGreaterThan(0);
      expect(triggerState(s, s.samples[onset]![0], alertParams())).toBe("nominal"); // one sample is not an alert
      expect(s.samples[onset + 1]![0]).toBe(alert().sim_time); // the engine's alert is the second consecutive sample, to the second
      expect(triggerState(s, alert().sim_time, alertParams())).toBe("alert");
    });
  });
});
