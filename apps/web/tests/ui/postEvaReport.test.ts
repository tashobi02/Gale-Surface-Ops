/**
 * Tests for SCR-17 Post-EVA report (01 FR-46, 03 SCR-17, 04 §E.8).
 * Mode PRINT: two page containers, paper styling, stat slabs, planned vs actual timeline, alert table,
 * stop tasks table, event log, log_hash and the mandatory disclaimer.
 *
 * Every value in the report comes from the data passed in; with none, values read "—". Absent, partial and full
 * reports are checked separately, and each value's provenance is checked on the value itself.
 *
 * Not claimed here: that the report prints on two pages. Two `report-page` containers are not a measurement of
 * printed pages. Chrome A4/Letter pagination with 12 mm margins is still to be verified by hand
 * (TODO(decision): see docs/tasks/status.md, T27.03).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostEvaReport, REPORT_DISCLAIMER, type PostEvaReportData } from "../../src/ui/screens/scr17PostEvaReport";

const render = (report?: PostEvaReportData): string => renderToStaticMarkup(createElement(PostEvaReport, { report }));

/** An explicit report; every number here is a test input, not a result. */
const FULL: PostEvaReportData = {
  scenarioId: "scn-test",
  dataVersion: "dv-test",
  seed: 7,
  logHash: "abc123",
  doseReceivedUgy: 12.34,
  doseUnshelteredUgy: 5000,
  timeToShelterMin: 9,
  stopsCompleted: 2,
  stopsTotal: 5,
  planRevisionsCount: 3,
  timeline: [{ phase: "STOP A", plannedLtst: "10:00", actualLtst: "10:05" }],
  alerts: [
    { level: "warning", code: "RADIATION_ALERT", message: "Shelter now", raisedLtst: "10:10:00", ackedLtst: "10:10:20", responseSec: 20 },
  ],
  tasks: [{ stopName: "Stop A", ev1: "1 / 0 / 0", ev2: "0 / 1 / 0" }],
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
      time_to_shelter_min: "derived",
      stops: "simulated",
      plan_revisions: "derived",
      log_hash: "derived",
      seed: "simulated",
    };
    for (const [src, prov] of Object.entries(classes)) {
      const el = bySource(html, `unavailable:report.${src}`);
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

  it("shows the supplied values, each labelled on its own element; received and unsheltered dose are simulated, never measured", () => {
    expect(bySource(html, "report:dose_event_ugy")).toContain("12.3 µGy");
    expect(bySource(html, "report:dose_event_ugy")).toContain('data-provenance="simulated"');
    expect(bySource(html, "report:dose_event_unsheltered_ugy")).toContain("5,000 µGy");
    expect(bySource(html, "report:dose_event_unsheltered_ugy")).toContain('data-provenance="simulated"');
    expect(bySource(html, "report:time_to_shelter_min")).toContain("9 min");
    expect(bySource(html, "report:time_to_shelter_min")).toContain('data-provenance="derived"');
    expect(bySource(html, "report:stops")).toContain("2 / 5");
    expect(bySource(html, "report:plan_revisions")).toContain("3");
    expect(html).not.toContain('data-provenance="measured"');
  });

  it("renders the timeline, the alert with its response time, the tasks and the event log from the data", () => {
    expect(html).toContain("STOP A");
    expect(html).toContain("10:05");
    expect(html).toContain("RADIATION_ALERT");
    expect(bySource(html, "report:alerts.response_s")).toContain("20 s");
    expect(html).toContain("1 / 0 / 0");
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
    expect(html).toContain("Mission Debrief — scn-test");
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

  it.todo("prints on at most two pages in Chrome at A4 and Letter with 12 mm margins (TODO(decision): manual check)");
  it.todo("map trace is drawn from the session position log (TODO(decision): needs the report API-to-UI adapter)");
});
