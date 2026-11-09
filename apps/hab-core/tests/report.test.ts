/**
 * T27.02 — Tests: report values equal the counts reduced from the log (01 FR-46, FR-50, 05 PostEvaReport).
 *
 * Verifies that:
 * 1. Stops completed/dropped match ARRIVED_STOP and PLAN_REVISED events in the log.
 * 2. Alert response times match the interval between ALERT_RAISED and ALERT_ACKED events.
 * 3. Stop task summary counts (done, skipped, dropped, total) match TASK_* events.
 * 4. Dose received, unsheltered dose, and background dose match logged values.
 * 5. Plan revisions, provenance summary, log_hash and mandatory disclaimer are present.
 * 6. GET /api/report serves the built report over HTTP.
 */

import { describe, expect, it } from "vitest";
import type { LogEvent, LogEventData, Role } from "@marswalk/protocol";
import { buildReport, type PostEvaReport } from "../src/report";
import { startServer } from "../src/server";
import type { SessionHandle } from "../src/session";
function makeEvent<K extends LogEvent["kind"]>(
  seq: number,
  sim_time: string,
  kind: K,
  data: LogEventData[K],
  actor: Role | "system" = "system"
): LogEvent {
  return {
    seq,
    sim_time,
    kind,
    actor,
    data,
    provenance: {},
  };
}
describe("PostEvaReport builder (01 FR-46, 05 PostEvaReport)", () => {
  const sampleEvents: LogEvent[] = [
    makeEvent(1, "2024-05-20T13:00:00Z", "SESSION_LOADED", {
      session_id: "s-demo-4190",
      scenario_id: "storm-sol4190",
      data_version: "gale-v2026.11",
      seed: 42,
      plan_hash: "abcd1234ef5678",
    }),
    makeEvent(2, "2024-05-20T13:01:00Z", "EVA_STARTED", {
      crew_ids: ["EV1", "EV2"],
      plan_revision: 0,
    makeEvent(3, "2024-05-20T13:01:10Z", "TASK_ADDED", {
      task_id: "t-01",
      stop_id: "wp-1",
      crew_id: "EV1",
      kind: "image",
      text: "Photograph entry waypoint",
      origin: "plan",
    makeEvent(4, "2024-05-20T13:01:10Z", "TASK_ADDED", {
      task_id: "t-02",
      stop_id: "wp-2",
      kind: "sample",
      text: "Sample outcrop ridge",
    makeEvent(5, "2024-05-20T13:04:00Z", "ARRIVED_STOP", {
      stop_index: 1,
    makeEvent(6, "2024-05-20T13:04:30Z", "TASK_UPDATED", {
      state: "DONE",
      reason: null,
    }, "eva:EV1"),
    makeEvent(7, "2024-05-20T13:05:00Z", "ALERT_RAISED", {
      alert_id: "alt-01",
      code: "RADIATION_ALERT",
      level: "warning",
      subjects: ["EV1", "EV2"],
      message: "SOLAR PARTICLE EVENT DETECTED",
      rate_ugy_h: 450.0,
    makeEvent(8, "2024-05-20T13:05:45Z", "ALERT_ACKED", {
      acked_by: "ops",
    }, "ops"),
    makeEvent(9, "2024-05-20T13:06:00Z", "PLAN_REVISED", {
      plan_revision: 1,
      option_id: "opt-1",
      stops_dropped: [2],
    makeEvent(10, "2024-05-20T13:06:01Z", "TASK_DROPPED", {
    makeEvent(11, "2024-05-20T13:18:00Z", "CREW_SHELTERED", {
      haven_kind: "vehicle",
      dose_event_ugy: 120.5,
      dose_event_unsheltered_ugy: 8100.0,
    makeEvent(12, "2024-05-20T13:20:00Z", "EVA_ENDED", {
  ];
  it("reduces stops completed and dropped matching log events", () => {
    const report = buildReport(sampleEvents, "hash1234567890abcdef");
    expect(report.stops.completed).toBe(1);
    expect(report.stops.dropped).toBe(1);
    expect(report.stops.details).toHaveLength(2);
    expect(report.stops.details.find((s) => s.stop_id === "wp-1")?.status).toBe("completed");
    expect(report.stops.details.find((s) => s.stop_id === "wp-2")?.status).toBe("dropped");
  });
  it("reduces alert response times (raised -> acked) matching log events", () => {
    expect(report.alerts.total).toBe(1);
    expect(report.alerts.details).toHaveLength(1);
    const alt = report.alerts.details[0];
    expect(alt.code).toBe("RADIATION_ALERT");
    expect(alt.level).toBe("warning");
    // 13:05:00 to 13:05:45 = 45 seconds response time
    expect(alt.response_time_s).toBe(45);
  it("reduces stop task counts (done, skipped, dropped, total) per stop and overall (FR-50)", () => {
    expect(report.tasks.total).toBe(2);
    expect(report.tasks.done).toBe(1);
    expect(report.tasks.dropped).toBe(1);
    expect(report.tasks.skipped).toBe(0);
    const wp1Tasks = report.tasks.per_stop["wp-1"];
    expect(wp1Tasks.done).toBe(1);
    expect(wp1Tasks.total).toBe(1);
    const wp2Tasks = report.tasks.per_stop["wp-2"];
    expect(wp2Tasks.dropped).toBe(1);
    expect(wp2Tasks.total).toBe(1);
  it("reduces dose received vs unsheltered vs planned background", () => {
    expect(report.dose.dose_event_ugy).toBe(120.5);
    expect(report.dose.dose_event_unsheltered_ugy).toBe(8100.0);
    expect(report.dose.background_dose_ugy).toBeGreaterThanOrEqual(0);
  it("includes plan revisions count, provenance summary, log_hash and disclaimer (01 §F.1)", () => {
    expect(report.plan_revisions).toBe(1);
    expect(report.log_hash).toBe("hash1234567890abcdef");
    expect(report.disclaimer).toMatch(/NASA Space Apps/i);
    expect(report.provenance_summary).toBeDefined();
 * T27.02 — Tests: report values equal the counts reduced from the log (docs/specs/05 §C.2 PostEvaReport; 01 FR-46, FR-50).
 * Implemented by TASK-27 (T27.02, Ridita Alam).
 * Rules (05 §C.2, 01 FR-46, FR-50):
 * - Every report value is reduced from the append-only event log; nothing is recomputed or invented.
 * - Planned vs. actual per stop: arrive/depart timestamps, completed vs. dropped.
 * - Alerts with response times: raised → acked → sheltered time deltas.
 * - Stop tasks (FR-50): done, skipped, dropped totals and per-stop breakdown.
 * - Plan revisions count: equals count of PLAN_REVISED events.
 * - Cumulative dose summary: received vs. unsheltered vs. planned background.
 * - Contains log_hash (SHA-256 of canonical session log) and mandatory disclaimer.
 * Acceptance:
 * - Each count is one named test.
 * - Fails before T27.01 (report builder implementation) and passes after.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LogEvent, Scenario } from "@marswalk/protocol";
// @ts-expect-error report module is implemented by T27.01
import { buildPostEvaReport, type PostEvaReport } from "../src/report";
const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const fakeScenario = JSON.parse(readFileSync(join(fixtureDir, "scenario.json"), "utf8")) as Scenario;
const T0 = fakeScenario.start_utc; // 2024-05-20T00:00:00Z
const at = (seconds: number): string => new Date(Date.parse(T0) + seconds * 1000).toISOString().replace(".000Z", "Z");
const TEST_LOG_HASH = "8f48e3a24b1799292c30ab9b8e9b89182390a19e536e1b72e9a562ef1a8a8123";
/** Synthetic realistic session log exercising stops, alerts, stop tasks (FR-50) and plan revisions. */
function createFixtureEvents(): LogEvent[] {
  let seq = 1;
  const ev = (kind: LogEvent["kind"], sim_time: string, data: Record<string, unknown>, actor: LogEvent["actor"] = "system"): LogEvent => ({
    seq: seq++,
    data: data as LogEvent["data"],
  return [
    ev("SESSION_LOADED", at(0), {
      session_id: "s-test-01",
      scenario_id: fakeScenario.scenario_id,
      data_version: fakeScenario.data_version,
      seed: fakeScenario.seed,
      plan_hash: fakeScenario.plan.plan_hash,
    ev("CLOCK_CHANGED", at(0), { speed: 60, paused: false }, "ops"),
    ev("EVA_STARTED", at(0), { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops"),
    // Seeded stop tasks (FR-50)
    ev("TASK_ADDED", at(0), { task_id: "t-s1-01", stop_id: "wp-1", crew_id: "EV1", kind: "observe", text: "Inspect boxwork outcrop", origin: "plan" }),
    ev("TASK_ADDED", at(0), { task_id: "t-s1-02", stop_id: "wp-1", crew_id: "EV2", kind: "sample", text: "Collect mineral sample", origin: "plan" }),
    ev("TASK_ADDED", at(0), { task_id: "t-s2-01", stop_id: "wp-2", crew_id: "EV1", kind: "measure", text: "Measure magnetic gradient", origin: "plan" }),
    ev("TASK_ADDED", at(0), { task_id: "t-s2-02", stop_id: "wp-2", crew_id: "EV2", kind: "image", text: "Panorama of ridge", origin: "plan" }),
    // Stop 1: arrival, task execution, departure
    ev("ARRIVED_STOP", at(1090), { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
    ev("ARRIVED_STOP", at(1090), { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 }),
    ev("TASK_UPDATED", at(1200), { task_id: "t-s1-01", stop_id: "wp-1", state: "DONE", reason: null }, "eva:EV1"),
    ev("TASK_UPDATED", at(1300), { task_id: "t-s1-02", stop_id: "wp-1", state: "SKIPPED", reason: "time" }, "eva:EV2"),
    ev("LEFT_STOP", at(2290), { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
    ev("LEFT_STOP", at(2290), { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 }),
    // Radiation alert and contingency flow
    ev("ALERT_RAISED", at(3600), {
      alert_id: "a-rad-1",
      message: "Radiation surge — shelter now",
      rate_ugy_h: 0.5,
      threshold_ugy_h: 0.25,
      source: "replayed:curiosity-rad",
    ev("OPTIONS_PROPOSED", at(3600), {
      options: [
        {
          option_id: "opt-1",
          alert_id: "a-rad-1",
          kind: "VEHICLE_RENDEZVOUS",
          crew_ids: ["EV1", "EV2"],
          eta_shelter_min: 14,
          expected_dose_ugy: 0.1,
          stops_dropped: [2],
          violations: [],
          rank: 1,
        },
      ],
    ev("ALERT_ACKED", at(3612), { alert_id: "a-rad-1", acked_by: "eva:EV1" }, "eva:EV1"),
    ev("VEHICLE_DISPATCHED", at(3618), { vehicle_id: "PR1", option_id: "opt-1" }, "eva:EV1"),
    ev("PLAN_REVISED", at(3620), { plan_revision: 2, option_id: "opt-1", stops_dropped: [2] }, "eva:EV1"),
    // Dropped stop tasks (FR-50: open tasks at dropped stop become DROPPED by actor system)
    ev("TASK_DROPPED", at(3621), { task_id: "t-s2-01", stop_id: "wp-2", reason: "plan_revision" }, "system"),
    ev("TASK_DROPPED", at(3621), { task_id: "t-s2-02", stop_id: "wp-2", reason: "plan_revision" }, "system"),
    ev("VEHICLE_ARRIVED", at(4160), { vehicle_id: "PR1" }),
    ev("CREW_SHELTERED", at(4220), { crew_id: "EV1", haven_kind: "vehicle", dose_event_ugy: 0.08, dose_event_unsheltered_ugy: 0.5 }),
    ev("CREW_SHELTERED", at(4220), { crew_id: "EV2", haven_kind: "vehicle", dose_event_ugy: 0.09, dose_event_unsheltered_ugy: 0.5 }),
    ev("ALERT_CLEARED", at(7100), { alert_id: "a-rad-1" }),
    ev("EVA_ENDED", at(7200), { crew_ids: ["EV1", "EV2"] }, "ops"),
describe("T27.02: Post-EVA Report values reduced from the log (05 §C.2, FR-46, FR-50)", () => {
  const events = createFixtureEvents();
  // Helper counting log events directly and independently of the builder
  const countKind = (kind: LogEvent["kind"]) => events.filter((e) => e.kind === kind).length;
  it("stops completed count equals ARRIVED_STOP events from the log", () => {
    const report: PostEvaReport = buildPostEvaReport(events, fakeScenario, TEST_LOG_HASH);
    // Independent count of distinct stops visited
    const arrivedStops = new Set(
      events.filter((e) => e.kind === "ARRIVED_STOP").map((e) => (e.data as { stop_id: string }).stop_id),
    );
    expect(report.stops_completed).toBe(arrivedStops.size);
    expect(report.stops_completed).toBe(1);
  it("stops dropped count equals stops cut by PLAN_REVISED events", () => {
    const droppedFromLog = events
      .filter((e) => e.kind === "PLAN_REVISED")
      .flatMap((e) => ((e.data as { stops_dropped?: number[] }).stops_dropped ?? []));
    expect(report.stops_dropped).toBe(droppedFromLog.length);
    expect(report.stops_dropped).toBe(1);
  it("planned vs actual stop timings match ARRIVED_STOP and LEFT_STOP timestamps", () => {
    const stop1 = report.stops.find((s: { stop_id: string }) => s.stop_id === "wp-1");
    expect(stop1).toBeDefined();
    expect(stop1?.actual_arrive_utc).toBe(at(1090));
    expect(stop1?.actual_depart_utc).toBe(at(2290));
    expect(stop1?.completed).toBe(true);
    expect(stop1?.dropped).toBe(false);
    const stop2 = report.stops.find((s: { stop_id: string }) => s.stop_id === "wp-2");
    expect(stop2).toBeDefined();
    expect(stop2?.completed).toBe(false);
    expect(stop2?.dropped).toBe(true);
  it("alerts count and response times (raised -> acked -> sheltered) match time deltas between events", () => {
    const raised = events.find((e) => e.kind === "ALERT_RAISED");
    const acked = events.find((e) => e.kind === "ALERT_ACKED");
    const sheltered = events.find((e) => e.kind === "CREW_SHELTERED");
    expect(raised).toBeDefined();
    expect(acked).toBeDefined();
    expect(sheltered).toBeDefined();
    const expectedAckSec = (Date.parse(acked!.sim_time) - Date.parse(raised!.sim_time)) / 1000;
    const expectedShelterSec = (Date.parse(sheltered!.sim_time) - Date.parse(raised!.sim_time)) / 1000;
    expect(report.alerts.length).toBe(countKind("ALERT_RAISED"));
    expect(report.alerts[0].response_time_ack_s).toBe(expectedAckSec);
    expect(report.alerts[0].response_time_shelter_s).toBe(expectedShelterSec);
  it("stop tasks done count equals TASK_UPDATED with state DONE", () => {
    const doneCount = events.filter(
      (e) => e.kind === "TASK_UPDATED" && (e.data as { state?: string }).state === "DONE",
    ).length;
    expect(report.tasks_done).toBe(doneCount);
    expect(report.tasks_done).toBe(1);
  it("stop tasks skipped count equals TASK_UPDATED with state SKIPPED", () => {
    const skippedCount = events.filter(
      (e) => e.kind === "TASK_UPDATED" && (e.data as { state?: string }).state === "SKIPPED",
    expect(report.tasks_skipped).toBe(skippedCount);
    expect(report.tasks_skipped).toBe(1);
  it("stop tasks dropped count equals TASK_DROPPED in the log", () => {
    const droppedCount = countKind("TASK_DROPPED");
    expect(report.tasks_dropped).toBe(droppedCount);
    expect(report.tasks_dropped).toBe(2);
  it("per-stop task breakdown matches reduced counts per stop_id", () => {
    expect(stop1?.tasks_done).toBe(1);
    expect(stop1?.tasks_skipped).toBe(1);
    expect(stop1?.tasks_dropped).toBe(0);
    expect(stop2?.tasks_done).toBe(0);
    expect(stop2?.tasks_skipped).toBe(0);
    expect(stop2?.tasks_dropped).toBe(2);
  it("plan revisions count equals the count of PLAN_REVISED log events", () => {
    expect(report.plan_revisions).toBe(countKind("PLAN_REVISED"));
  it("report includes log_hash matching canonical JSON session log and mandatory disclaimer", () => {
    expect(report.log_hash).toBe(TEST_LOG_HASH);
    expect(report.disclaimer).toMatch(/replayed|simulated/i);
    expect(report.session_id).toBe("s-test-01");
  });
});
