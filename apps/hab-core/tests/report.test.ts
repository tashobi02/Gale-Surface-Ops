/**
 * T27.02 — Tests: report values equal the counts reduced from the log (01 FR-46, FR-50, 05 PostEvaReport).
 *
 * Verifies that:
 * 1. Stops completed/dropped match ARRIVED_STOP and PLAN_REVISED events in the log.
 * 2. Alert response times match the interval between ALERT_RAISED and ALERT_ACKED events.
 * 3. Stop task summary counts (done, skipped, dropped, total) match TASK_* events.
 * 4. Dose received, unsheltered dose, and background dose match logged values.
 * 5. Plan revisions, provenance summary, log_hash and mandatory disclaimer are present.
 * 6. The builder is deterministic: identical input gives identical output whatever the host clock says (NFR-06).
 * 7. Background dose is unavailable (null) until a sourced planned-background result is supplied.
 *
 * GET /api/report is covered in server.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogEvent, LogEventData, Role } from "@marswalk/protocol";
import { buildReport } from "../src/report";

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
    // System events carry no originating command; the tests below do not need one either.
    command_ref: null,
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
    }),
    makeEvent(3, "2024-05-20T13:01:10Z", "TASK_ADDED", {
      task_id: "t-01",
      stop_id: "wp-1",
      crew_id: "EV1",
      kind: "image",
      text: "Photograph entry waypoint",
      origin: "plan",
    }),
    makeEvent(4, "2024-05-20T13:01:10Z", "TASK_ADDED", {
      task_id: "t-02",
      stop_id: "wp-2",
      crew_id: "EV1",
      kind: "sample",
      text: "Sample outcrop ridge",
      origin: "plan",
    }),
    makeEvent(5, "2024-05-20T13:04:00Z", "ARRIVED_STOP", {
      crew_id: "EV1",
      stop_id: "wp-1",
      stop_index: 1,
    }),
    makeEvent(6, "2024-05-20T13:04:30Z", "TASK_UPDATED", {
      task_id: "t-01",
      stop_id: "wp-1",
      crew_id: "EV1",
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
    }),
    makeEvent(8, "2024-05-20T13:05:45Z", "ALERT_ACKED", {
      alert_id: "alt-01",
      acked_by: "ops",
    }, "ops"),
    makeEvent(9, "2024-05-20T13:06:00Z", "PLAN_REVISED", {
      plan_revision: 1,
      option_id: "opt-1",
      stops_dropped: [2],
      waypoints: [],
      legs: [],
    }, "ops"),
    makeEvent(10, "2024-05-20T13:06:01Z", "TASK_DROPPED", {
      task_id: "t-02",
      stop_id: "wp-2",
      plan_revision: 1,
    }),
    makeEvent(11, "2024-05-20T13:18:00Z", "CREW_SHELTERED", {
      crew_id: "EV1",
      haven_kind: "vehicle",
      dose_event_ugy: 120.5,
      dose_event_unsheltered_ugy: 8100.0,
    }),
    makeEvent(12, "2024-05-20T13:20:00Z", "EVA_ENDED", {
      crew_ids: ["EV1", "EV2"],
    }),
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
    const report = buildReport(sampleEvents, "hash1234567890abcdef");

    expect(report.alerts.total).toBe(1);
    expect(report.alerts.details).toHaveLength(1);
    const alt = report.alerts.details[0];
    expect(alt.code).toBe("RADIATION_ALERT");
    expect(alt.level).toBe("warning");
    // 13:05:00 to 13:05:45 = 45 seconds response time
    expect(alt.response_time_s).toBe(45);
  });

  it("reduces stop task counts (done, skipped, dropped, total) per stop and overall (FR-50)", () => {
    const report = buildReport(sampleEvents, "hash1234567890abcdef");

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
  });

  it("reduces dose received vs unsheltered; planned background is unavailable, not a constant", () => {
    const report = buildReport(sampleEvents, "hash1234567890abcdef");

    expect(report.dose.dose_event_ugy).toBe(120.5);
    expect(report.dose.dose_event_unsheltered_ugy).toBe(8100.0);
    // TODO(decision): a sourced planned-background result comes through the report/session contract; until
    // then the background dose is null. A rate hard-coded in the builder would be an invented number.
    expect(report.dose.background_dose_ugy).toBeNull();
  });

  it("counts match counts taken straight from the log, independent of the builder", () => {
    const report = buildReport(sampleEvents, "h");
    const arrivedStops = new Set(
      sampleEvents.filter((e) => e.kind === "ARRIVED_STOP").map((e) => (e.data as { stop_id: string }).stop_id),
    );
    const alertsRaised = sampleEvents.filter((e) => e.kind === "ALERT_RAISED").length;
    const planRevised = sampleEvents.filter((e) => e.kind === "PLAN_REVISED").length;

    expect(report.stops.completed).toBe(arrivedStops.size);
    expect(report.alerts.total).toBe(alertsRaised);
    expect(report.plan_revisions).toBe(planRevised);
  });

  it("a task's final state wins after several updates and it is counted once", () => {
    const events: LogEvent[] = [
      makeEvent(1, "2024-05-20T13:00:00Z", "TASK_ADDED", { task_id: "t-1", stop_id: "wp-1", crew_id: "EV1", kind: "image", text: "x", origin: "plan" }),
      makeEvent(2, "2024-05-20T13:01:00Z", "TASK_UPDATED", { task_id: "t-1", stop_id: "wp-1", crew_id: "EV1", state: "SKIPPED", reason: "time" }, "eva:EV1"),
      makeEvent(3, "2024-05-20T13:02:00Z", "TASK_UPDATED", { task_id: "t-1", stop_id: "wp-1", crew_id: "EV1", state: "DONE", reason: null }, "eva:EV1"),
    ];
    const report = buildReport(events, "h");

    expect(report.tasks.total).toBe(1);
    expect(report.tasks.done).toBe(1);
    expect(report.tasks.skipped).toBe(0);
    expect(report.tasks.per_stop["wp-1"]).toEqual({ done: 1, skipped: 0, dropped: 0, total: 1 });
  });

  it.todo("planned vs actual stop timing, departure and per-stop dwell (TODO(decision): C24 report contract)");
  it.todo("shelter response time is associated with CREW_SHELTERED (TODO(decision): C24 shelter-response association)");
  it.todo("dropped-stop identity comes from the plan rather than the wp-<index> naming (TODO(decision): C24 dropped-stop mapping)");

  it("includes plan revisions count, provenance summary, log_hash and disclaimer (01 §F.1)", () => {
    const report = buildReport(sampleEvents, "hash1234567890abcdef");

    expect(report.plan_revisions).toBe(1);
    expect(report.log_hash).toBe("hash1234567890abcdef");
    expect(report.disclaimer).toMatch(/NASA Space Apps/i);
    expect(report.provenance_summary).toBeDefined();
  });
});

describe("PostEvaReport determinism (NFR-06)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const log: LogEvent[] = [
    makeEvent(1, "2024-05-20T13:00:00Z", "SESSION_LOADED", {
      session_id: "s-1", scenario_id: "storm-sol4190", data_version: "gale-v2026.11", seed: 42, plan_hash: "abcd1234ef5678",
    }),
    makeEvent(2, "2024-05-20T13:20:00Z", "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }),
  ];

  it("identical input gives identical output under different host clocks; generated_at is the log's last sim_time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const first = buildReport(log, "h");
    vi.setSystemTime(new Date("2042-06-06T12:00:00Z"));
    const second = buildReport(log, "h");

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.generated_at).toBe("2024-05-20T13:20:00Z");
  });

  it("an empty log has an empty generated_at, never the wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const report = buildReport([], "");

    expect(report.generated_at).toBe("");
    expect(report.dose.background_dose_ugy).toBeNull();
  });
});
