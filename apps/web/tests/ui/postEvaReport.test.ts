/**
 * Tests for SCR-17 Post-EVA report (01 FR-46, 03 SCR-17, 04 §E.8).
 * Mode PRINT: two page containers, paper styling, stat slabs, planned vs actual timeline, alert table,
 * stop tasks table, event log, log_hash and the mandatory disclaimer.
 *
 * Every value in the report comes from the data passed in; with none, values read "—". Absent, partial and full
 * reports are checked separately, and each value's provenance is checked on the value itself.
 *
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostEvaReport, REPORT_DISCLAIMER, type PostEvaReportData } from "../../src/ui/screens/scr17PostEvaReport";
import { adaptPostEvaReport, type ApiPostEvaReport } from "../../src/ui/report/reportAdapter";

const render = (report?: PostEvaReportData): string => renderToStaticMarkup(createElement(PostEvaReport, { report }));

/** An explicit report; every number here is a test input, not a result. */
const FULL: PostEvaReportData = {
  scenarioId: "scn-test",
  dataVersion: "dv-test",
  seed: 7,
  logHash: "abc123",
  doseReceivedUgy: 12.34,
  doseUnshelteredUgy: 5000,
  doseHeadlineCrew: "EV1",
  doseRows: [
    { crewId: "EV1", doseReceivedUgy: 12.34, doseUnshelteredUgy: 5000 },
    { crewId: "EV2", doseReceivedUgy: null, doseUnshelteredUgy: null },
  ],
  timeToShelterMin: 9,
  stopsCompleted: 2,
  stopsTotal: 5,
  planRevisionsCount: 3,
  evaDurationS: 1800,
  stopsDropped: 1,
  stopsNotReached: 1,
  stopsIncomplete: 1,
  stopsInProgress: 2,
  stopsPending: 3,
  generatedAt: "13:31:00 UTC",
  tasksTotals: { total: 3, done: 1, skipped: 0, dropped: 1 },
  timeline: [
    { stopId: "wp-1", crewId: "EV1", status: "LEFT", plannedArrival: "T+04:00", actualArrival: "T+03:00", arrivalDiff: "-01:00", plannedDwell: "10:00", actualDwell: "10:00", dwellDiff: "+00:00" },
    { stopId: "wp-3", crewId: null, status: "DROPPED", plannedArrival: null, actualArrival: null, arrivalDiff: null, plannedDwell: null, actualDwell: null, dwellDiff: null },
  ],
  alerts: [
    {
      level: "warning", code: "RADIATION_ALERT", message: "Shelter now", raisedAt: "10:10:00 UTC", ackedAt: "10:10:20 UTC", clearedAt: "10:12:00 UTC", ackSec: 20,
      shelter: [{ crewId: "EV1", responseSec: 90, shelteredAt: "10:11:30 UTC" }, { crewId: "EV2", responseSec: null, shelteredAt: null }],
    },
  ],
  tasks: [{ stopName: "wp-1", done: 1, skipped: 0, dropped: 0, total: 1 }],
  logEvents: [{ seq: 4, time: "10:10:00", actor: "system", event: "ALERT_RAISED", prov: "replayed" }],
};

/** The element carrying a given source id. */
function bySource(html: string, src: string): string {
  const m = html.match(new RegExp(`<[^>]*data-source="${src}"[^>]*>[^<]*(?:<[^/][^>]*>[^<]*)*`));
  if (!m) throw new Error(`no element with source ${src}`);
  return m[0];
}

describe("SCR-17 Post-EVA report with no data (nothing is made up)", () => {
  const html = render();

  it("keeps the structure and the mandatory disclaimer, independent of any data", () => {
    expect(html).toContain('data-page="1"');
    expect(html).toContain('data-page="2"');
    expect(html).toMatch(/DOSE RECEIVED VS UNSHELTERED/);
    expect(html).toMatch(/TIME TO SHELTER/);
    expect(html).toMatch(/STOPS COMPLETED/);
    expect(html).toMatch(/PLAN REVISIONS/);
    expect(html).toContain(REPORT_DISCLAIMER);
    expect(html).toMatch(/NASA Space Apps/i);
  });

  it("shows no sample results, hash, timeline, alert, task or event, and no fabricated schematic", () => {
    expect(html).not.toMatch(/120\.5|8,100|8100|b1fa5ad9|wp-1|EZ—|RADIATION_ALERT|SOLAR PARTICLE|450|600 m|SESSION_LOADED/);
    expect(html).not.toMatch(/Storm at Sol|storm-sol4190|gale_boxwork|seed 4190/);
    expect(html).not.toMatch(/<svg|HAB COMM COVERAGE|RDV SHELTER|STOP 3 \(DROPPED\)/);
    expect(html).not.toMatch(/NaN|undefined|null/);
  });

  it("reads — for each value, flagged unavailable with its own class and an unavailable source; never 'assumed'", () => {
    expect((html.match(/>—</g) ?? []).length).toBeGreaterThan(5);
    const classes: Record<string, string> = {
      dose_event_ugy: "simulated",
      dose_headline: "derived",
      eva_duration_s: "derived",
      stops_breakdown: "derived",
      tasks_totals: "simulated",
      generated_at: "simulated",
      time_to_shelter_min: "derived",
      stops: "simulated",
      plan_revisions: "derived",
      log_hash: "derived",
      seed: "simulated",
    };
    for (const [src, prov] of Object.entries(classes)) {
      const el = bySource(html, `unavailable:report.${src.replace("dose_headline", "dose.headline")}`);
      expect(el).toContain('data-unavailable="true"');
      expect(el).toContain(`data-provenance="${prov}"`);
    }
    expect(html).not.toContain('data-provenance="assumed"');
    // No provenance glyph is printed beside a "—" slab value.
    expect(html).not.toMatch(/—\s*(µGy|min)?\s*[■◆○△▶◇]/);
    for (const m of html.matchAll(/data-provenance="([a-z]+)"/g)) {
      expect(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]).toContain(m[1]);
    }
  });
});

describe("SCR-17 Post-EVA report with a full report (01 FR-46)", () => {
  const html = render(FULL);

  it("dose values stay simulated; only the highest-individual pick is derived, and both labels are shown; no crew total", () => {
    expect(bySource(html, "report:dose_event_ugy")).toContain("12.3 µGy");
    expect(bySource(html, "report:dose_event_ugy")).toContain('data-provenance="simulated"');
    expect(bySource(html, "report:dose_event_unsheltered_ugy")).toContain("5,000 µGy");
    expect(bySource(html, "report:dose_event_unsheltered_ugy")).toContain('data-provenance="simulated"');
    const pick = bySource(html, "report:dose.headline");
    expect(pick).toMatch(/highest individual: EV1/i);
    expect(pick).toContain('data-provenance="derived"');
    expect(bySource(html, "report:dose.EV1")).toContain("12.3 µGy");
    expect(bySource(html, "report:dose.EV1")).toContain('data-provenance="simulated"');
    expect(html).not.toMatch(/crew total/i);
    expect(html).not.toContain('data-provenance="measured"');
  });

  it("shows the EVA duration, the stop breakdown, the task totals, the clear time and the generated time", () => {
    expect(bySource(html, "report:eva_duration_s")).toContain("30:00");
    expect(bySource(html, "report:eva_duration_s")).toContain('data-provenance="derived"');
    const stops = bySource(html, "report:stops_breakdown");
    expect(stops).toContain("dropped 1");
    expect(stops).toContain("not reached 1");
    expect(stops).toContain("incomplete 1");
    expect(stops).toContain("in progress 2");
    expect(stops).toContain("pending 3");
    expect(stops).toContain('data-provenance="derived"');
    expect(bySource(html, "report:tasks_totals")).toContain("1 / 0 / 1 of 3");
    expect(bySource(html, "report:alerts.cleared")).toContain("10:12:00 UTC");
    expect(bySource(html, "report:generated_at")).toContain("13:31:00 UTC");
  });

  it("a crew member who never sheltered reads 'not sheltered', flagged unavailable with its class", () => {
    const row = bySource(html, "unavailable:report.dose.EV2");
    expect(row).toContain("not sheltered");
    expect(row).toContain('data-unavailable="true"');
    expect(row).toContain('data-provenance="simulated"');
  });

  it("shows the other slabs with their own provenance", () => {
    expect(bySource(html, "report:time_to_shelter_min")).toContain("9 min");
    expect(bySource(html, "report:time_to_shelter_min")).toContain('data-provenance="derived"');
    expect(bySource(html, "report:stops")).toContain("2 / 5");
    expect(bySource(html, "report:plan_revisions")).toContain("3");
  });

  it("renders the timeline with planned, actual and difference per crew; a dropped stop is a word, not blanks", () => {
    expect(bySource(html, "report:timeline.arrival_actual")).toContain("T+03:00");
    expect(bySource(html, "report:timeline.arrival_actual")).toContain('data-provenance="simulated"');
    expect(bySource(html, "report:timeline.arrival_planned")).toContain("T+04:00");
    expect(bySource(html, "report:timeline.arrival_planned")).toContain('data-provenance="derived"');
    expect(bySource(html, "report:timeline.arrival_diff")).toContain("-01:00");
    expect(bySource(html, "report:timeline.arrival_diff")).toContain('data-provenance="derived"');
    expect(html).toContain("wp-3");
    expect(html).toContain("DROPPED");
    expect(bySource(html, "unavailable:report.timeline.arrival_actual")).toContain("—");
    // a stop reached and then dropped keeps its timings and carries both words
    const kept = render({ timeline: [{ stopId: "wp-1", crewId: "EV1", status: "LEFT · DROPPED", plannedArrival: null, actualArrival: "T+03:00", arrivalDiff: null, plannedDwell: null, actualDwell: "10:00", dwellDiff: null }] });
    expect(kept).toContain("LEFT · DROPPED");
    expect(bySource(kept, "report:timeline.arrival_actual")).toContain("T+03:00");
  });

  it("renders the alert with its first-ack time and per-crew shelter response; no response reads 'no shelter during alert'", () => {
    expect(html).toContain("RADIATION_ALERT");
    expect(bySource(html, "report:alerts.ack_s")).toContain("20 s");
    expect(bySource(html, "report:alerts.ack_s")).toContain('data-provenance="derived"');
    expect(bySource(html, "report:alerts.shelter_response_s.EV1")).toContain("90 s");
    expect(bySource(html, "report:alerts.shelter_response_s.EV1")).toContain('data-provenance="derived"');
    const none = bySource(html, "unavailable:report.alerts.shelter_response_s.EV2");
    expect(none).toContain("no shelter during alert");
    expect(none).toContain('data-unavailable="true"');
  });

  it("renders the task counts and the event log from the data", () => {
    expect(html).toMatch(/<td[^>]*>1 \/ 0 \/ 0/);
    expect(html).toMatch(/<td[^>]*>ALERT_RAISED/);
    expect(bySource(html, "report:log_events.4")).toContain("replayed");
    // Sequence, time, actor and event are each labelled on their own element with the event's class and a distinct source.
    for (const [field, text] of [["seq", ">4"], ["time", ">10:10:00"], ["actor", ">system"], ["event", ">ALERT_RAISED"]] as const) {
      const el = bySource(html, `report:log_events.4.${field}`);
      expect(el).toContain('data-provenance="replayed"');
      expect(el).toContain(text);
    }
  });

  it("shows the supplied hash and scenario line, and headlines the scenario id rather than a fixed title", () => {
    expect(bySource(html, "report:log_hash")).toContain("abc123");
    // The id in the heading is a labelled value (FD-481), so it sits in its own span.
    expect(html).toMatch(/Mission Debrief — <span data-provenance="simulated" data-source="report:scenario_id"[^>]*>scn-test<\/span>/);
    expect(html).toContain("scn-test");
    expect(html).toContain("dv-test");
    expect(bySource(html, "report:seed")).toMatch(/>7$/);
  });

  it("alert levels show a shape and a word, not colour alone", () => {
    expect(html).toMatch(/⬣ WARNING/);
  });

  it("has no chrome corner radius", () => {
    expect(html).not.toMatch(/border-radius:\s*[1-9]/);
  });
});

describe("SCR-17 Post-EVA report with a partial report", () => {
  it("only the supplied values are filled in; the rest stay — and unavailable", () => {
    const html = render({ doseReceivedUgy: 0, stopsCompleted: 0, stopsTotal: 0 });

    // Real zeros are shown as zeros.
    expect(bySource(html, "report:dose_event_ugy")).toContain("0.0 µGy");
    expect(bySource(html, "report:stops")).toContain("0 / 0");
    expect(bySource(html, "unavailable:report.dose_event_unsheltered_ugy")).toContain("—");
    expect(bySource(html, "unavailable:report.time_to_shelter_min")).toContain("—");
    expect(bySource(html, "unavailable:report.timeline")).toContain("—");
    expect(html).toContain(REPORT_DISCLAIMER);
  });

  it("supplied commentary is added after the mandatory disclaimer and never replaces it, even when empty", () => {
    const html = render({ disclaimer: "Custom commentary text", timeToShelterMin: Number.NaN });
    expect(html).toContain(REPORT_DISCLAIMER);
    expect(html).toContain("Custom commentary text");
    expect(html.indexOf(REPORT_DISCLAIMER)).toBeLessThan(html.indexOf("Custom commentary text"));

    for (const blank of ["", "   "]) {
      const empty = render({ disclaimer: blank });
      expect(empty).toContain(REPORT_DISCLAIMER);
    }
  });

  it("the mandatory disclaimer is rendered once, also when the API report repeats it as commentary", () => {
    const count = (html: string): number => html.split(REPORT_DISCLAIMER).length - 1;
    expect(count(render(FULL))).toBe(1);
    expect(count(render({ disclaimer: REPORT_DISCLAIMER }))).toBe(1);
    const extra = render({ disclaimer: `${REPORT_DISCLAIMER} Extra note.` });
    expect(count(extra)).toBe(1);
    expect(extra).toContain("Extra note.");
  });

  it("nobody sheltered: the dose slab reads 'not sheltered' with its class, not a number", () => {
    const html = render({ doseRows: [{ crewId: "EV1", doseReceivedUgy: null, doseUnshelteredUgy: null }] });
    const el = bySource(html, "unavailable:report.dose_event_ugy");
    expect(el).toContain("not sheltered");
    expect(el).toContain('data-provenance="simulated"');
  });

  it("a non-finite number is treated as unavailable", () => {
    const html = render({ timeToShelterMin: Number.NaN });
    expect(bySource(html, "unavailable:report.time_to_shelter_min")).toContain("—");
    expect(html).not.toContain("NaN");
  });
});

describe("SCR-17 pagination and print (not established by these tests)", () => {
  it("renders exactly two page containers (a structural check, not a printed-page measurement)", () => {
    const html = render(FULL);
    expect((html.match(/class="report-page"/g) ?? []).length).toBe(2);
  });

  it("page numbers are computed from the pages rendered, not hard-coded", () => {
    const html = render(FULL);
    expect(html).toContain("p. 1 / 2");
    expect(html).toContain("p. 2 / 2");
  });


});


/** What GET /api/report returns for the Hab Core fixture of apps/hab-core/tests/report.test.ts (two crew, one revision). */
const API: ApiPostEvaReport = {
  session_id: "s-demo-4190",
  scenario_id: "storm-sol4190",
  data_version: "gale-v2026.11",
  seed: 42,
  generated_at: "2024-05-20T13:31:00Z",
  log_hash: "hash1234567890abcdef",
  eva_duration_s: 1800,
  stops: {
    completed: 1,
    dropped: 1,
    not_reached: 1,
    incomplete: 1,
    in_progress: 0,
    pending: 0,
    details: [
      {
        stop_id: "wp-1",
        status: "completed",
        crew: [
          { crew_id: "EV1", arrived_sim_time: "2024-05-20T13:04:00Z", departed_sim_time: "2024-05-20T13:14:00Z", arrival_offset_s: 180, dwell_s: 600, planned_arrival_offset_s: 240, planned_departure_offset_s: 840, planned_dwell_s: 600, arrival_diff_s: -60, dwell_diff_s: 0, provenance: { actual: "simulated", planned: "derived", differences: "derived" } },
          { crew_id: "EV2", arrived_sim_time: "2024-05-20T13:06:30Z", departed_sim_time: "2024-05-20T13:17:30Z", arrival_offset_s: 330, dwell_s: 660, planned_arrival_offset_s: 240, planned_departure_offset_s: 840, planned_dwell_s: 600, arrival_diff_s: 90, dwell_diff_s: 60, provenance: { actual: "simulated", planned: "derived", differences: "derived" } },
        ],
      },
      {
        stop_id: "wp-2",
        status: "incomplete",
        crew: [
          { crew_id: "EV1", arrived_sim_time: "2024-05-20T13:20:00Z", departed_sim_time: null, arrival_offset_s: 1140, dwell_s: null, planned_arrival_offset_s: null, planned_departure_offset_s: null, planned_dwell_s: null, arrival_diff_s: null, dwell_diff_s: null, provenance: { actual: "simulated", planned: "derived", differences: "derived" } },
          { crew_id: "EV2", arrived_sim_time: null, departed_sim_time: null, arrival_offset_s: null, dwell_s: null, planned_arrival_offset_s: null, planned_departure_offset_s: null, planned_dwell_s: null, arrival_diff_s: null, dwell_diff_s: null, provenance: { actual: "simulated", planned: "derived", differences: "derived" } },
        ],
      },
      { stop_id: "wp-3", status: "dropped", crew: [] },
      { stop_id: "wp-4", status: "not_reached", crew: [] },
    ],
  },
  alerts: {
    total: 1,
    details: [
      {
        alert_id: "alt-01",
        code: "RADIATION_ALERT",
        level: "warning",
        raised_sim_time: "2024-05-20T13:21:00Z",
        acked_sim_time: "2024-05-20T13:21:45Z",
        cleared_sim_time: "2024-05-20T13:23:00Z",
        ack_s: 45,
        shelter: [
          { crew_id: "EV1", shelter_response_s: null, sheltered_sim_time: null },
          { crew_id: "EV2", shelter_response_s: 90, sheltered_sim_time: "2024-05-20T13:22:30Z" },
        ],
        provenance: { times: "simulated", durations: "derived" },
      },
    ],
  },
  tasks: { total: 3, done: 1, skipped: 0, dropped: 1, per_stop: { "wp-1": { done: 1, skipped: 0, dropped: 0, total: 1 }, "wp-3": { done: 0, skipped: 0, dropped: 1, total: 1 } } },
  dose: {
    per_crew: [
      { crew_id: "EV1", sheltered: true, sheltered_sim_time: "2024-05-20T13:25:00Z", haven_kind: "hab", dose_event_ugy: 300, dose_event_unsheltered_ugy: 9000 },
      { crew_id: "EV2", sheltered: true, sheltered_sim_time: "2024-05-20T13:22:30Z", haven_kind: "vehicle", dose_event_ugy: 120.5, dose_event_unsheltered_ugy: 8100 },
    ],
    headline: { crew_id: "EV1", dose_event_ugy: 300, dose_event_unsheltered_ugy: 9000 },
    provenance: { per_crew: "simulated", headline: "derived", planned_background_ugy: "modelled" },
    background_dose_ugy: null,
    planned_background_ugy: null,
    planned_background_reason: "no sourced planned-background dose result yet",
    planned_background_source_id: null,
  },
  trace: [
    { crew_id: "EV1", points: [{ sim_time: "2024-05-20T13:00:00Z", x_m: 10, y_m: 20 }, { sim_time: "2024-05-20T13:00:30Z", x_m: 30, y_m: 60 }] },
    { crew_id: "EV2", points: [{ sim_time: "2024-05-20T13:00:00Z", x_m: 12, y_m: 25 }, { sim_time: "2024-05-20T13:00:30Z", x_m: 40, y_m: 45 }] },
  ],
  plan_revisions: 1,
  provenance_summary: { measured: 0, derived: 6, modelled: 0, assumed: 0, replayed: 0, simulated: 14 },
  disclaimer: REPORT_DISCLAIMER,
};

describe("SCR-17 API report adapter (snake_case PostEvaReport -> camelCase PostEvaReportData)", () => {
  const data = adaptPostEvaReport(API);

  it("maps the scenario line, hash and counts", () => {
    expect(data).toMatchObject({ sessionId: "s-demo-4190", scenarioId: "storm-sol4190", dataVersion: "gale-v2026.11", seed: 42, logHash: "hash1234567890abcdef", planRevisionsCount: 1 });
    expect(data.stopsCompleted).toBe(1);
    expect(data.stopsTotal).toBe(4);
  });

  it("dose: the headline is the highest individual and each crew keeps its own row", () => {
    expect(data.doseReceivedUgy).toBe(300);
    expect(data.doseUnshelteredUgy).toBe(9000);
    expect(data.doseHeadlineCrew).toBe("EV1");
    expect(data.doseRows).toEqual([
      { crewId: "EV1", doseReceivedUgy: 300, doseUnshelteredUgy: 9000 },
      { crewId: "EV2", doseReceivedUgy: 120.5, doseUnshelteredUgy: 8100 },
    ]);
  });

  it("dose: a crew member who never sheltered maps to nulls, and nobody sheltered leaves no headline", () => {
    const none = adaptPostEvaReport({
      ...API,
      dose: { ...API.dose, headline: null, per_crew: [{ crew_id: "EV1", sheltered: false, sheltered_sim_time: null, haven_kind: null, dose_event_ugy: null, dose_event_unsheltered_ugy: null }] },
    });
    expect(none.doseRows).toEqual([{ crewId: "EV1", doseReceivedUgy: null, doseUnshelteredUgy: null }]);
    expect(none.doseReceivedUgy).toBeUndefined();
    expect(none.doseHeadlineCrew).toBeUndefined();
  });

  it("alerts: ack time, per-crew shelter response and a null for no shelter during the alert", () => {
    expect(data.alerts).toEqual([
      {
        level: "warning",
        code: "RADIATION_ALERT",
        raisedAt: "13:21:00 UTC",
        ackedAt: "13:21:45 UTC",
        clearedAt: "13:23:00 UTC",
        ackSec: 45,
        shelter: [
          { crewId: "EV1", responseSec: null, shelteredAt: null },
          { crewId: "EV2", responseSec: 90, shelteredAt: "13:22:30 UTC" },
        ],
      },
    ]);
  });

  it("time to shelter is the slowest crew response in minutes, null when nobody responded", () => {
    expect(data.timeToShelterMin).toBe(1.5);
    const none = adaptPostEvaReport({ ...API, alerts: { total: 1, details: [{ ...API.alerts.details[0], shelter: [{ crew_id: "EV1", shelter_response_s: null, sheltered_sim_time: null }] }] } });
    expect(none.timeToShelterMin).toBeUndefined();
  });

  it("timeline: one row per crew for stops reached, one row with a status word for the rest", () => {
    const rows = data.timeline ?? [];
    expect(rows.map((r) => [r.stopId, r.crewId, r.status])).toEqual([
      ["wp-1", "EV1", "LEFT"],
      ["wp-1", "EV2", "LEFT"],
      ["wp-2", "EV1", "AT STOP · INCOMPLETE"],
      ["wp-2", "EV2", "NOT ARRIVED · INCOMPLETE"],
      ["wp-3", null, "DROPPED"],
      ["wp-4", null, "NOT REACHED"],
    ]);
    expect(rows[0]).toMatchObject({ plannedArrival: "T+04:00", actualArrival: "T+03:00", arrivalDiff: "-01:00", plannedDwell: "10:00", actualDwell: "10:00", dwellDiff: "+00:00" });
    expect(rows[1]).toMatchObject({ arrivalDiff: "+01:30", dwellDiff: "+01:00", actualDwell: "11:00" });
    // no departure: dwell and its difference are null, not 0
    expect(rows[2]).toMatchObject({ actualArrival: "T+19:00", plannedArrival: null, actualDwell: null, dwellDiff: null });
  });

  it("maps every report field: EVA duration, stop breakdown, task totals, clear time, generated time", () => {
    expect(data.evaDurationS).toBe(1800);
    expect(data).toMatchObject({ stopsDropped: 1, stopsNotReached: 1, stopsIncomplete: 1, stopsInProgress: 0, stopsPending: 0, generatedAt: "13:31:00 UTC" });
    expect(data.tasksTotals).toEqual({ total: 3, done: 1, skipped: 0, dropped: 1 });
    expect(data.alerts?.[0].clearedAt).toBe("13:23:00 UTC");
    expect(adaptPostEvaReport({ ...API, eva_duration_s: null, generated_at: "" })).toMatchObject({ evaDurationS: null, generatedAt: undefined });
  });

  it("timeline: a stop reached and then dropped keeps its per-crew rows and says so; an incomplete stop says so", () => {
    const dropped = adaptPostEvaReport({
      ...API,
      stops: { ...API.stops, details: [{ ...API.stops.details[0], status: "dropped" }, { ...API.stops.details[1], status: "incomplete" }] },
    });
    const rows = dropped.timeline ?? [];
    expect(rows.slice(0, 2).map((r) => r.status)).toEqual(["LEFT · DROPPED", "LEFT · DROPPED"]);
    expect(rows[0].actualArrival).toBe("T+03:00");
    expect(rows.slice(2).map((r) => r.status)).toEqual(["AT STOP · INCOMPLETE", "NOT ARRIVED · INCOMPLETE"]);
  });

  it("tasks: per-stop counts, sorted by stop id (code-unit order, not locale)", () => {
    expect(data.tasks).toEqual([
      { stopName: "wp-1", done: 1, skipped: 0, dropped: 0, total: 1 },
      { stopName: "wp-3", done: 0, skipped: 0, dropped: 1, total: 1 },
    ]);
  });

  it("task rows sort by plain code-unit comparison, so the order does not depend on the host locale", () => {
    const per_stop = { "wp-10": { done: 0, skipped: 0, dropped: 0, total: 1 }, "wp-2": { done: 0, skipped: 0, dropped: 0, total: 1 }, "WP-3": { done: 0, skipped: 0, dropped: 0, total: 1 } };
    const names = (adaptPostEvaReport({ ...API, tasks: { ...API.tasks, per_stop } }).tasks ?? []).map((t) => t.stopName);
    expect(names).toEqual(["WP-3", "wp-10", "wp-2"]);
  });

  it("the API disclaimer equal to the mandatory one is not passed on as commentary; a different one is", () => {
    expect(data.disclaimer).toBeUndefined();
    expect(adaptPostEvaReport({ ...API, disclaimer: "Note" }).disclaimer).toBe("Note");
    expect(render(data).split(REPORT_DISCLAIMER).length - 1).toBe(1);
  });

  it("an unknown session leaves the scenario fields out rather than printing 'unknown'", () => {
    const d = adaptPostEvaReport({ ...API, session_id: "unknown", scenario_id: "unknown", data_version: "unknown" });
    expect(d.sessionId).toBeUndefined();
    expect(d.scenarioId).toBeUndefined();
    expect(d.dataVersion).toBeUndefined();
  });

  it("renders end to end with nothing undefined or NaN, and an EVA-less report still renders", () => {
    const html = render(data);
    expect(html).not.toMatch(/NaN|undefined|null/);
    expect(html).toContain("no shelter during alert");
    const bare = adaptPostEvaReport({ ...API, eva_duration_s: null, stops: { completed: 0, dropped: 0, not_reached: 0, incomplete: 0, in_progress: 0, pending: 0, details: [] }, alerts: { total: 0, details: [] }, tasks: { total: 0, done: 0, skipped: 0, dropped: 0, per_stop: {} } });
    expect(render(bare)).not.toMatch(/NaN|undefined|null/);
  });
});


describe("T27.03 report contract", () => {
  it("trace from decimated positions: one polyline per crew, north up (y flipped), viewBox from the extent", () => {
    const html = render(adaptPostEvaReport(API));
    expect(html).toContain('data-slot="report-trace"');
    expect(html).toContain('data-source="report:trace"');
    // x 10..40, y 20..60: the viewBox starts at -maxY and spans the extent.
    expect(html).toMatch(/viewBox="10 -60 30 40"/);
    expect(html).toMatch(/<polyline[^>]*data-crew="EV1"[^>]*points="10,-20 30,-60"/);
    expect(html).toMatch(/<polyline[^>]*data-crew="EV2"[^>]*points="12,-25 40,-45"/);
    expect((html.match(/<polyline/g) ?? []).length).toBe(2);
    // The second crew is dashed, and the legend says which is which; the scale note gives the unit.
    expect(html).toMatch(/<polyline[^>]*data-crew="EV2"[^>]*stroke-dasharray/);
    expect(html).toContain("EV1 solid");
    expect(html).toContain("EV2 dashed");
    expect(html).toMatch(/metres/);
  });

  it("a crew with a single trace point is drawn as a dot, not an invisible polyline", () => {
    const html = render(adaptPostEvaReport({ ...API, trace: [{ crew_id: "EV1", points: [{ sim_time: "2024-05-20T13:00:00Z", x_m: 5, y_m: 7 }] }] }));
    expect(html).toMatch(/<circle[^>]*data-crew="EV1"/);
  });

  it("no trace: says so with — and flagged unavailable", () => {
    const html = render(adaptPostEvaReport({ ...API, trace: [] }));
    expect(bySource(html, "unavailable:report.trace")).toContain('data-unavailable="true"');
  });

  it("dose per crew includes planned background (modelled, with its glyph), or its reason when null", () => {
    const report = adaptPostEvaReport({ ...API, dose: { ...API.dose, planned_background_ugy: 17, planned_background_reason: null } });
    const html = render(report);
    expect(html).toContain("17.0 µGy");
    expect(bySource(html, "report:dose.planned_background_ugy")).toContain('data-provenance="modelled"');
    expect(bySource(html, "report:dose.planned_background_ugy")).toContain("○");
    const none = render(adaptPostEvaReport(API));
    expect(none).toContain("no sourced planned-background dose result yet");
  });

  it("sources: the report carries no source ids, so the section says — and why; the provenance summary is shown", () => {
    const html = render(adaptPostEvaReport(API));
    expect(html).toMatch(/aria-label="Sources"/);
    expect(bySource(html, "unavailable:report.source_ids")).toContain('data-unavailable="true"');
    expect(html).toContain("#/sources");
    expect(bySource(html, "report:provenance_summary")).toContain("simulated 14");
  });

  it("event log: the report carries no events, so the table is marked unavailable with the reason and the export", () => {
    const html = render(adaptPostEvaReport(API));
    const cell = bySource(html, "unavailable:report.log_events");
    expect(cell).toContain('data-unavailable="true"');
    expect(html).toMatch(/EXPORT LOG JSON/);
    expect(html).toMatch(/full event log/i);
  });

  it("print layout: headings stay with their content, blocks do not split, the @page margin is 12 mm", () => {
    const html = render(adaptPostEvaReport(API));
    // A stylesheet, never an inline <style> (the CSP blocks it, so the @page rule would never apply).
    expect(html).not.toContain("<style");
    const css = readFileSync(new URL("../../src/ui/screens/scr17PostEvaReport.css", import.meta.url), "utf8");
    expect(css).toMatch(/@page \{\s*margin: 12mm;\s*\}/);
    expect(css).toMatch(/h2 \{[^}]*break-after: avoid/);
    expect(css).toMatch(/break-inside: avoid/);
    // The trace heading is styled like every other section heading.
    expect(html).toMatch(/<h2[^>]*>\[ MAP \/\/\/ CREW TRACE \]<\/h2>/);
  });

  it("carries data-screen=\"SCR-17\" on the report root so live ops redirect verification finds SCR-17", () => {
    const html = render(FULL);
    expect(html).toMatch(/<div[^>]*data-screen="SCR-17"/);
  });
});
