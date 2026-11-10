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
 * 8. T27.01-T27.03 product definitions (approved 11 Nov): per-crew stop timing (arrival, dwell, planned vs actual),
 *    shelter response only while an alert is open, dropped stops by stop_id from the plan diff, dose per crew with
 *    the highest individual as headline, null durations without EVA_ENDED, and scope = the current session.
 *
 * GET /api/report is covered in server.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogEvent, LogEventData, PlanExport, Role, Waypoint } from "@marswalk/protocol";
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

const SESSION = { session_id: "s-demo-4190", scenario_id: "storm-sol4190", data_version: "gale-v2026.11", seed: 42, plan_hash: "abcd1234ef5678" };

const wp = (n: number, role: Waypoint["role"]): Waypoint => ({ id: `wp-${n}`, role, x_m: n * 100, y_m: 0 });
const WP_START = wp(0, "start");
const INITIAL_WAYPOINTS: Waypoint[] = [WP_START, wp(1, "stop"), wp(2, "stop"), wp(3, "stop"), wp(4, "stop")];

/** Planned EVA start 13:01:00; wp-1 arrive +240 s, depart +840 s (dwell 600 s). */
const slot = (arrive: string, depart: string) => ({ arrive_utc: arrive, depart_utc: depart, arrive_ltst: "", sun_elevation_deg: 0 });
const PLAN = {
  scenario: { eva_start_utc: "2024-05-20T13:01:00Z" },
  waypoints: INITIAL_WAYPOINTS,
  result: {
    stops_timeline: [
      slot("2024-05-20T13:01:00Z", "2024-05-20T13:01:00Z"),
      slot("2024-05-20T13:05:00Z", "2024-05-20T13:15:00Z"),
      slot("2024-05-20T13:20:00Z", "2024-05-20T13:30:00Z"),
      slot("2024-05-20T13:35:00Z", "2024-05-20T13:45:00Z"),
      slot("2024-05-20T13:50:00Z", "2024-05-20T14:00:00Z"),
    ],
  },
} as unknown as PlanExport;

function seqd(events: LogEvent[]): LogEvent[] {
  return events.map((e, i) => ({ ...e, seq: i + 1 }));
}

const task = (id: string, stop_id: string, crew_id: "EV1" | "EV2" = "EV1") =>
  makeEvent(0, "2024-05-20T13:01:10Z", "TASK_ADDED", { task_id: id, stop_id, crew_id, kind: "image", text: id, origin: "plan" });

/**
 * Two crew, real wp-n ids. wp-1: both arrive and leave at different times. wp-2: only EV1 arrives. A revision at 13:21:30
 * drops wp-3 (its stops_dropped ordinal [1] would point at wp-1 under the old wp-<index> mapping); wp-4 is never reached.
 * Alert alt-01 (EV1, EV2): acked twice, EV2 shelters while it is open, it is cleared, EV1 shelters afterwards.
 */
const stormLog: LogEvent[] = seqd([
  makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
  makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 0 }),
  task("t-01", "wp-1"),
  task("t-02", "wp-2"),
  task("t-03", "wp-3"),
  makeEvent(0, "2024-05-20T13:04:00Z", "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
  makeEvent(0, "2024-05-20T13:04:30Z", "TASK_UPDATED", { task_id: "t-01", stop_id: "wp-1", crew_id: "EV1", state: "DONE", reason: null }, "eva:EV1"),
  makeEvent(0, "2024-05-20T13:06:30Z", "ARRIVED_STOP", { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 }),
  makeEvent(0, "2024-05-20T13:14:00Z", "LEFT_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
  makeEvent(0, "2024-05-20T13:17:30Z", "LEFT_STOP", { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 }),
  makeEvent(0, "2024-05-20T13:20:00Z", "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-2", stop_index: 2 }),
  makeEvent(0, "2024-05-20T13:21:00Z", "ALERT_RAISED", { alert_id: "alt-01", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "SPE", rate_ugy_h: 450 }),
  makeEvent(0, "2024-05-20T13:21:30Z", "PLAN_REVISED", {
    plan_revision: 1,
    option_id: "opt-1",
    stops_dropped: [1],
    waypoints: [WP_START, wp(1, "stop"), wp(2, "stop"), wp(4, "stop")],
    legs: [],
  }, "ops"),
  makeEvent(0, "2024-05-20T13:21:45Z", "ALERT_ACKED", { alert_id: "alt-01", acked_by: "ops" }, "ops"),
  makeEvent(0, "2024-05-20T13:22:30Z", "CREW_SHELTERED", { crew_id: "EV2", haven_kind: "vehicle", dose_event_ugy: 120.5, dose_event_unsheltered_ugy: 8100 }),
  makeEvent(0, "2024-05-20T13:23:00Z", "ALERT_CLEARED", { alert_id: "alt-01" }),
  makeEvent(0, "2024-05-20T13:24:00Z", "ALERT_ACKED", { alert_id: "alt-01", acked_by: "ops" }, "ops"),
  makeEvent(0, "2024-05-20T13:25:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 300, dose_event_unsheltered_ugy: 9000 }),
  makeEvent(0, "2024-05-20T13:31:00Z", "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }),
]);

const rowFor = (report: ReturnType<typeof buildReport>, stop: string, crew: string) =>
  report.stops.details.find((s) => s.stop_id === stop)?.crew.find((c) => c.crew_id === crew);

describe("PostEvaReport builder (01 FR-46, 05 PostEvaReport)", () => {
  it("report: two crew at the same stop keep separate rows", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const wp1 = report.stops.details.find((s) => s.stop_id === "wp-1");

    expect(wp1?.crew.map((c) => c.crew_id)).toEqual(["EV1", "EV2"]);
    expect(rowFor(report, "wp-1", "EV1")?.arrived_sim_time).toBe("2024-05-20T13:04:00Z");
    expect(rowFor(report, "wp-1", "EV2")?.arrived_sim_time).toBe("2024-05-20T13:06:30Z");
    // arrival offset = ARRIVED_STOP - EVA_STARTED (13:01:00)
    expect(rowFor(report, "wp-1", "EV1")?.arrival_offset_s).toBe(180);
    expect(rowFor(report, "wp-1", "EV2")?.arrival_offset_s).toBe(330);
  });

  it("report: dwell = LEFT_STOP - ARRIVED_STOP; no LEFT_STOP gives a null departure", () => {
    const report = buildReport(stormLog, "h", PLAN);

    expect(rowFor(report, "wp-1", "EV1")).toMatchObject({ departed_sim_time: "2024-05-20T13:14:00Z", dwell_s: 600 });
    expect(rowFor(report, "wp-1", "EV2")).toMatchObject({ departed_sim_time: "2024-05-20T13:17:30Z", dwell_s: 660 });
    expect(rowFor(report, "wp-2", "EV1")).toMatchObject({ arrived_sim_time: "2024-05-20T13:20:00Z", departed_sim_time: null, dwell_s: null });
    // EV2 never reached wp-2: a row with nothing, not a missing row
    expect(rowFor(report, "wp-2", "EV2")).toMatchObject({ arrived_sim_time: null, arrival_offset_s: null, dwell_s: null });
  });

  it("report: planned timing comes from the plan's stops_timeline as offsets from EVA start; differences derived", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const ev1 = rowFor(report, "wp-1", "EV1");
    const ev2 = rowFor(report, "wp-1", "EV2");

    expect(ev1).toMatchObject({ planned_arrival_offset_s: 240, planned_departure_offset_s: 840, planned_dwell_s: 600 });
    expect(ev1).toMatchObject({ arrival_diff_s: -60, dwell_diff_s: 0 });
    expect(ev2).toMatchObject({ arrival_diff_s: 90, dwell_diff_s: 60 });
    expect(ev1?.provenance).toEqual({ actual: "simulated", planned: "derived", differences: "derived" });
    // no departure -> no dwell difference
    expect(rowFor(report, "wp-2", "EV1")).toMatchObject({ planned_arrival_offset_s: 1140, dwell_diff_s: null });
  });

  it("report: planned side is null without a plan, and for a stop the plan's timeline has no entry for", () => {
    const without = buildReport(stormLog, "h");
    expect(rowFor(without, "wp-1", "EV1")).toMatchObject({ planned_arrival_offset_s: null, planned_departure_offset_s: null, planned_dwell_s: null, arrival_diff_s: null, dwell_diff_s: null });
    expect(rowFor(without, "wp-1", "EV1")?.arrival_offset_s).toBe(180);

    const emptyTimeline = { ...PLAN, result: { ...PLAN.result, stops_timeline: [] } } as PlanExport;
    expect(rowFor(buildReport(stormLog, "h", emptyTimeline), "wp-1", "EV1")?.planned_arrival_offset_s).toBeNull();
    expect(rowFor(buildReport(stormLog, "h", null), "wp-1", "EV1")?.planned_arrival_offset_s).toBeNull();
  });

  it("report: a same-count reorder in a PLAN_REVISED does not mis-map planned times (initial plan's index decides)", () => {
    const reordered = seqd(stormLog.map((e) => e.kind !== "PLAN_REVISED" ? e : {
      ...e,
      data: { ...e.data, waypoints: [WP_START, wp(2, "stop"), wp(1, "stop"), wp(3, "stop"), wp(4, "stop")] },
    }));
    const report = buildReport(reordered, "h", PLAN);

    expect(rowFor(report, "wp-1", "EV1")).toMatchObject({ planned_arrival_offset_s: 240, planned_departure_offset_s: 840 });
    expect(rowFor(report, "wp-2", "EV1")).toMatchObject({ planned_arrival_offset_s: 1140 });
    expect(report.stops.dropped).toBe(0);
  });

  it("report: a plan published before the EVA is the new baseline and planned source; it is not a revision", () => {
    const published = {
      scenario: { eva_start_utc: "2024-05-20T13:00:00Z" },
      waypoints: [WP_START, wp(1, "stop"), wp(5, "stop")],
      result: { stops_timeline: [slot("2024-05-20T13:00:00Z", "2024-05-20T13:00:00Z"), slot("2024-05-20T13:10:00Z", "2024-05-20T13:20:00Z"), slot("2024-05-20T13:30:00Z", "2024-05-20T13:40:00Z")] },
    } as unknown as PlanExport;
    const events = seqd([
      makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
      makeEvent(0, "2024-05-20T13:00:30Z", "PLAN_REVISED", { plan_revision: 1, option_id: null, stops_dropped: [], waypoints: published.waypoints, legs: [], plan: published }, "planner"),
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 1 }),
      makeEvent(0, "2024-05-20T13:12:00Z", "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.plan_revisions).toBe(0);
    // wp-2..wp-4 of the initial plan are not stops of the published plan: not "dropped", not listed
    expect(report.stops.details.map((d) => d.stop_id)).toEqual(["wp-1", "wp-5"]);
    expect(report.stops.dropped).toBe(0);
    // planned offsets are from the published plan's own eva_start_utc (13:00:00): arrive +600 s, depart +1200 s; actual arrival 13:12:00 - 13:01:00 = 660 s
    expect(rowFor(report, "wp-1", "EV1")).toMatchObject({ planned_arrival_offset_s: 600, planned_departure_offset_s: 1200, planned_dwell_s: 600, arrival_diff_s: 60 });
    expect(rowFor(report, "wp-5", "EV1")?.planned_arrival_offset_s).toBe(1800);
  });

  it("report: only a revision after EVA_STARTED is counted and diffed; one before it just replaces the baseline", () => {
    const prePublish = makeEvent(0, "2024-05-20T13:00:30Z", "PLAN_REVISED", { plan_revision: 1, option_id: null, stops_dropped: [], waypoints: [WP_START, wp(1, "stop"), wp(2, "stop"), wp(3, "stop"), wp(4, "stop")], legs: [] }, "planner");
    const events = seqd([stormLog[0], prePublish, ...stormLog.slice(1)]);
    const report = buildReport(events, "h", PLAN);

    expect(report.plan_revisions).toBe(1);
    expect(report.stops.details.find((d) => d.stop_id === "wp-3")?.status).toBe("dropped");
    expect(report.stops.dropped).toBe(1);
  });

  it("report: dropped stop by stop_id from plan diff, never from the stops_dropped ordinal", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const status = (id: string) => report.stops.details.find((s) => s.stop_id === id)?.status;

    expect(status("wp-3")).toBe("dropped");
    // stops_dropped: [1] would have dropped wp-1 under the old wp-<index> mapping
    expect(status("wp-1")).toBe("completed");
    expect(report.stops.dropped).toBe(1);
  });

  it("report: a later revision is diffed against the previous revision's waypoints", () => {
    const events = seqd([
      ...stormLog.slice(0, -1),
      makeEvent(0, "2024-05-20T13:26:00Z", "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [3], waypoints: [WP_START, wp(1, "stop"), wp(2, "stop")], legs: [] }, "ops"),
      makeEvent(0, "2024-05-20T13:31:00Z", "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }),
    ]);
    const report = buildReport(events, "h", PLAN);
    const dropped = report.stops.details.filter((s) => s.status === "dropped").map((s) => s.stop_id).sort();

    expect(dropped).toEqual(["wp-3", "wp-4"]);
    expect(report.plan_revisions).toBe(2);
  });

  it("report: completed needs every EVA crew to have left; unreached after EVA_ENDED is not_reached; not everyone left by EVA_ENDED is incomplete", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const status = (id: string) => report.stops.details.find((s) => s.stop_id === id)?.status;

    expect(status("wp-1")).toBe("completed");
    expect(status("wp-2")).toBe("incomplete"); // EV1 arrived and never left; EV2 never arrived
    expect(status("wp-3")).toBe("dropped");
    expect(status("wp-4")).toBe("not_reached");
    expect(report.stops).toMatchObject({ completed: 1, dropped: 1, not_reached: 1, incomplete: 1 });
  });

  it("report: while the EVA runs, reached-but-not-all-left is in_progress and unreached is pending", () => {
    const running = buildReport(seqd(stormLog.slice(0, -1)), "h", PLAN);
    const status = (id: string) => running.stops.details.find((s) => s.stop_id === id)?.status;

    expect(status("wp-2")).toBe("in_progress");
    expect(status("wp-4")).toBe("pending");
    const oneLeft = seqd(stormLog.filter((e) => !(e.kind === "LEFT_STOP" && (e.data as { crew_id: string }).crew_id === "EV2")).slice(0, -1));
    expect(buildReport(oneLeft, "h", PLAN).stops.details.find((s) => s.stop_id === "wp-1")?.status).toBe("in_progress");
  });

  it("report: every stop is in exactly one status; the counts add up to the details", () => {
    const ended = buildReport(stormLog, "h", PLAN);
    const { completed, dropped, not_reached, incomplete } = ended.stops;
    expect(completed + dropped + not_reached + incomplete).toBe(ended.stops.details.length);

    const running = buildReport(seqd(stormLog.slice(0, -1)), "h", PLAN);
    const n = (st: string): number => running.stops.details.filter((d) => d.status === st).length;
    expect(running.stops.completed + running.stops.dropped + running.stops.not_reached + running.stops.incomplete + n("pending") + n("in_progress"))
      .toBe(running.stops.details.length);
  });

  it("report: a stop reached and then dropped is dropped, with its timings kept", () => {
    const events = seqd([
      ...stormLog.slice(0, 10), // both crew arrived at and left wp-1
      makeEvent(0, "2024-05-20T13:18:00Z", "PLAN_REVISED", { plan_revision: 1, option_id: "opt-1", stops_dropped: [1], waypoints: [WP_START, wp(2, "stop"), wp(3, "stop"), wp(4, "stop")], legs: [] }, "ops"),
      makeEvent(0, "2024-05-20T13:31:00Z", "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.stops.details.find((d) => d.stop_id === "wp-1")?.status).toBe("dropped");
    expect(rowFor(report, "wp-1", "EV1")).toMatchObject({ arrived_sim_time: "2024-05-20T13:04:00Z", dwell_s: 600 });
    expect(report.stops).toMatchObject({ completed: 0, dropped: 1, not_reached: 3, incomplete: 0 });
  });

  it("report: a later revision that restores a dropped stop makes it not dropped", () => {
    const events = seqd([
      ...stormLog.slice(0, -1), // wp-3 dropped at 13:21:30
      makeEvent(0, "2024-05-20T13:26:00Z", "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: [WP_START, wp(1, "stop"), wp(2, "stop"), wp(3, "stop"), wp(4, "stop")], legs: [] }, "ops"),
      makeEvent(0, "2024-05-20T13:31:00Z", "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.stops.details.find((d) => d.stop_id === "wp-3")?.status).toBe("not_reached");
    expect(report.stops.dropped).toBe(0);
    expect(report.plan_revisions).toBe(2);
  });

  it("report: a published plan replaces the planned timing; a stop no longer in it keeps no stale planned times", () => {
    const published = {
      scenario: { eva_start_utc: "2024-05-20T13:00:00Z" },
      waypoints: [WP_START, wp(1, "stop")],
      result: { stops_timeline: [slot("2024-05-20T13:00:00Z", "2024-05-20T13:00:00Z"), slot("2024-05-20T13:10:00Z", "2024-05-20T13:20:00Z")] },
    } as unknown as PlanExport;
    const events = seqd([
      makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
      makeEvent(0, "2024-05-20T13:00:30Z", "PLAN_REVISED", { plan_revision: 1, option_id: null, stops_dropped: [], waypoints: published.waypoints, legs: [], plan: published }, "planner"),
      makeEvent(0, "2024-05-20T13:00:40Z", "TASK_ADDED", { task_id: "t-9", stop_id: "wp-2", crew_id: "EV1", kind: "image", text: "x", origin: "plan" }),
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 1 }),
    ]);
    const report = buildReport(events, "h", PLAN);

    // wp-2 is listed (a task names it) but is not in the published plan: the initial plan's 1140 s must not survive
    expect(rowFor(report, "wp-2", "EV1")?.planned_arrival_offset_s).toBeNull();
    expect(rowFor(report, "wp-1", "EV1")?.planned_arrival_offset_s).toBe(600);
  });

  it("report: the stop counts add up to details.length also in the middle of the EVA (in_progress and pending are counted)", () => {
    const running = buildReport(seqd(stormLog.slice(0, -1)), "h", PLAN);

    expect(running.stops).toMatchObject({ completed: 1, in_progress: 1, dropped: 1, pending: 1, not_reached: 0, incomplete: 0 });
    const s = running.stops;
    expect(s.completed + s.in_progress + s.dropped + s.pending + s.not_reached + s.incomplete).toBe(s.details.length);
    const ended = buildReport(stormLog, "h", PLAN).stops;
    expect(ended).toMatchObject({ in_progress: 0, pending: 0 });
    expect(ended.completed + ended.dropped + ended.not_reached + ended.incomplete).toBe(ended.details.length);
  });

  it("report: an alert raised before EVA_STARTED gives shelter rows only for crew ids, not for a vehicle subject", () => {
    const events = seqd([
      makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
      makeEvent(0, "2024-05-20T13:00:30Z", "ALERT_RAISED", { alert_id: "a-0", code: "BUDDY_SEPARATION", level: "caution", subjects: ["EV1", "MDV-1", "EV2"], message: "m" }),
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 0 }),
    ]);

    expect(buildReport(events, "h").alerts.details[0].shelter.map((r) => r.crew_id)).toEqual(["EV1", "EV2"]);
  });

  it("report: stop timing rows are only for the crew on the EVA; an alert subject off the EVA gets no shelter row, a crew who sheltered keeps a dose row", () => {
    const events = seqd([
      makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 0 }),
      makeEvent(0, "2024-05-20T13:04:00Z", "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }),
      makeEvent(0, "2024-05-20T13:05:00Z", "ALERT_RAISED", { alert_id: "a-1", code: "BUDDY_SEPARATION", level: "caution", subjects: ["EV1", "MDV-1"], message: "m" }),
      makeEvent(0, "2024-05-20T13:06:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 5, dose_event_unsheltered_ugy: 9 }),
      makeEvent(0, "2024-05-20T13:07:00Z", "CREW_SHELTERED", { crew_id: "EV2", haven_kind: "hab", dose_event_ugy: 7, dose_event_unsheltered_ugy: 11 }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.stops.details[0].crew.map((c) => c.crew_id)).toEqual(["EV1"]);
    expect(report.alerts.details[0].shelter.map((r) => r.crew_id)).toEqual(["EV1"]);
    expect(report.dose.per_crew.map((r) => r.crew_id)).toEqual(["EV1", "EV2"]);
    expect(report.dose.headline?.crew_id).toBe("EV2");
  });

  it("reduces alert acknowledgement time (raised -> first ack), not the latest ack", () => {
    const report = buildReport(stormLog, "h", PLAN);

    expect(report.alerts.total).toBe(1);
    const alt = report.alerts.details[0];
    expect(alt).toMatchObject({ code: "RADIATION_ALERT", level: "warning", acked_sim_time: "2024-05-20T13:21:45Z", cleared_sim_time: "2024-05-20T13:23:00Z" });
    // 13:21:00 to 13:21:45 = 45 s (the 13:24:00 re-ack must not replace it)
    expect(alt.ack_s).toBe(45);
  });

  it("report: shelter response only while alert open, plus ack_s", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const alt = report.alerts.details[0];

    // EV2 sheltered 13:22:30, 90 s after the 13:21:00 raise, before the alert was cleared at 13:23:00
    expect(alt.shelter.find((s) => s.crew_id === "EV2")).toMatchObject({ shelter_response_s: 90, sheltered_sim_time: "2024-05-20T13:22:30Z" });
    // EV1 sheltered at 13:25:00, after ALERT_CLEARED: that is not a response ("no shelter during alert")
    expect(alt.shelter.find((s) => s.crew_id === "EV1")).toMatchObject({ shelter_response_s: null, sheltered_sim_time: null });
    expect(alt.shelter.map((s) => s.crew_id)).toEqual(["EV1", "EV2"]);
    expect(alt.provenance).toEqual({ times: "simulated", durations: "derived" });
  });

  it("report: an end-of-loop shelter with no open alert is not a response, and an earlier shelter before the raise is ignored", () => {
    const events = seqd([
      makeEvent(0, "2024-05-20T13:00:00Z", "SESSION_LOADED", SESSION),
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 0 }),
      makeEvent(0, "2024-05-20T13:02:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 1, dose_event_unsheltered_ugy: 2 }),
      makeEvent(0, "2024-05-20T13:03:00Z", "ALERT_RAISED", { alert_id: "a-1", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], message: "m" }),
      makeEvent(0, "2024-05-20T13:04:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 3, dose_event_unsheltered_ugy: 4 }),
    ]);
    const alt = buildReport(events, "h").alerts.details[0];

    expect(alt.shelter).toEqual([{ crew_id: "EV1", shelter_response_s: 60, sheltered_sim_time: "2024-05-20T13:04:00Z" }]);
    expect(alt.ack_s).toBeNull();
    expect(alt.acked_sim_time).toBeNull();
    expect(alt.cleared_sim_time).toBeNull();
  });

  it("report: dose per crew; headline highest individual", () => {
    const report = buildReport(stormLog, "h", PLAN);

    expect(report.dose.per_crew).toEqual([
      { crew_id: "EV1", sheltered: true, sheltered_sim_time: "2024-05-20T13:25:00Z", haven_kind: "hab", dose_event_ugy: 300, dose_event_unsheltered_ugy: 9000 },
      { crew_id: "EV2", sheltered: true, sheltered_sim_time: "2024-05-20T13:22:30Z", haven_kind: "vehicle", dose_event_ugy: 120.5, dose_event_unsheltered_ugy: 8100 },
    ]);
    // headline = highest individual (EV1), not a crew total and not 300 + 120.5
    expect(report.dose.headline).toEqual({ crew_id: "EV1", dose_event_ugy: 300, dose_event_unsheltered_ugy: 9000 });
    expect(report.dose.provenance).toEqual({ per_crew: "simulated", headline: "derived" });
    expect(report.dose).not.toHaveProperty("dose_event_ugy");
    // TODO(decision): a sourced planned-background result comes through the report/session contract; until
    // then the background dose is null. A rate hard-coded in the builder would be an invented number.
    expect(report.dose.background_dose_ugy).toBeNull();
  });

  it("report: a crew member's last CREW_SHELTERED is the dose row", () => {
    const events = seqd([
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 0 }),
      makeEvent(0, "2024-05-20T13:10:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "vehicle", dose_event_ugy: 50, dose_event_unsheltered_ugy: 500 }),
      makeEvent(0, "2024-05-20T13:20:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 20, dose_event_unsheltered_ugy: 400 }),
    ]);
    expect(buildReport(events, "h").dose.per_crew[0]).toMatchObject({ dose_event_ugy: 20, dose_event_unsheltered_ugy: 400, haven_kind: "hab" });
  });

  it("report: never sheltered -> null", () => {
    const events = seqd([
      makeEvent(0, "2024-05-20T13:01:00Z", "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 0 }),
      makeEvent(0, "2024-05-20T13:10:00Z", "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "vehicle", dose_event_ugy: 50, dose_event_unsheltered_ugy: 500 }),
    ]);
    const report = buildReport(events, "h");

    expect(report.dose.per_crew.find((c) => c.crew_id === "EV2")).toEqual({
      crew_id: "EV2", sheltered: false, sheltered_sim_time: null, haven_kind: null, dose_event_ugy: null, dose_event_unsheltered_ugy: null,
    });
    expect(report.dose.headline?.crew_id).toBe("EV1");

    const nobody = buildReport(events.slice(0, 1), "h");
    expect(nobody.dose.headline).toBeNull();
    expect(nobody.dose.per_crew.map((c) => c.sheltered)).toEqual([false, false]);
  });

  it("report: eva_duration null without EVA_ENDED", () => {
    expect(buildReport(stormLog, "h", PLAN).eva_duration_s).toBe(1800); // 13:01:00 -> 13:31:00
    expect(buildReport(seqd(stormLog.slice(0, -1)), "h", PLAN).eva_duration_s).toBeNull();
    expect(buildReport(seqd(stormLog.filter((e) => e.kind !== "EVA_STARTED")), "h").eva_duration_s).toBeNull();
  });

  it("report: scope starts at last SESSION_LOADED", () => {
    const events = seqd([
      ...stormLog,
      makeEvent(0, "2024-05-20T15:00:00Z", "SESSION_LOADED", { ...SESSION, session_id: "s-second", seed: 7 }),
      makeEvent(0, "2024-05-20T15:01:00Z", "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 0 }),
      makeEvent(0, "2024-05-20T15:02:00Z", "ALERT_RAISED", { alert_id: "alt-new", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], message: "m" }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.session_id).toBe("s-second");
    expect(report.seed).toBe(7);
    expect(report.alerts.details.map((a) => a.alert_id)).toEqual(["alt-new"]);
    expect(report.stops.details.every((s) => s.status !== "completed")).toBe(true);
    expect(report.tasks.total).toBe(0);
    expect(report.plan_revisions).toBe(0);
    expect(report.eva_duration_s).toBeNull();
    expect(report.dose.per_crew.every((c) => !c.sheltered)).toBe(true);
    expect(report.generated_at).toBe("2024-05-20T15:02:00Z");
  });

  it("report: CLOCK_JUMPED, SESSION_RESET and EVENT_STARTED are not data", () => {
    const noise = ["CLOCK_JUMPED", "SESSION_RESET", "EVENT_STARTED"].map((kind) =>
      ({ seq: 0, sim_time: "2024-05-20T13:12:00Z", kind, actor: "system", data: { crew_id: "EV1", stop_id: "wp-1", alert_id: "alt-01" }, provenance: {}, command_ref: null }) as unknown as LogEvent);
    const base = buildReport(stormLog, "h", PLAN);
    const noisy = buildReport(seqd([...stormLog.slice(0, 5), ...noise, ...stormLog.slice(5)]), "h", PLAN);

    expect(noisy).toEqual(base);
  });

  it("reduces stop task counts (done, skipped, dropped, total) per stop and overall (FR-50)", () => {
    const events = seqd([
      ...stormLog.slice(0, 7),
      makeEvent(0, "2024-05-20T13:21:31Z", "TASK_DROPPED", { task_id: "t-03", stop_id: "wp-3", plan_revision: 1 }),
    ]);
    const report = buildReport(events, "h", PLAN);

    expect(report.tasks).toMatchObject({ total: 3, done: 1, dropped: 1, skipped: 0 });
    expect(report.tasks.per_stop["wp-1"]).toEqual({ done: 1, skipped: 0, dropped: 0, total: 1 });
    expect(report.tasks.per_stop["wp-3"]).toEqual({ done: 0, skipped: 0, dropped: 1, total: 1 });
  });

  it("counts match counts taken straight from the log, independent of the builder", () => {
    const report = buildReport(stormLog, "h", PLAN);
    const arrivedStops = new Set(stormLog.filter((e) => e.kind === "ARRIVED_STOP").map((e) => (e.data as { stop_id: string }).stop_id));

    expect(report.stops.details.filter((s) => s.crew.some((c) => c.arrived_sim_time !== null))).toHaveLength(arrivedStops.size);
    expect(report.alerts.total).toBe(stormLog.filter((e) => e.kind === "ALERT_RAISED").length);
    expect(report.plan_revisions).toBe(stormLog.filter((e) => e.kind === "PLAN_REVISED").length);
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

  it("includes plan revisions count, provenance summary, log_hash and disclaimer (01 §F.1)", () => {
    const report = buildReport(stormLog, "hash1234567890abcdef", PLAN);

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
