/**
 * Tests for SCR-17 Post-EVA report (01 FR-46, 03 SCR-17, 04 §E.8).
 * Mode PRINT: 2 pages at most, light/paper styling, high contrast,
 * stat slabs, planned vs actual timeline, alert table, map trace,
 * stop tasks table, event log, log_hash, and disclaimer.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostEvaReport } from "../../src/ui/screens/scr17PostEvaReport";

describe("SCR-17 Post-EVA report (01 FR-46, 04 §E.8)", () => {
  it("renders page 1 and page 2 containers for print (<= 2 pages)", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toContain('data-page="1"');
    expect(html).toContain('data-page="2"');
    expect(html).toContain("p. 1 / 2");
    expect(html).toContain("p. 2 / 2");
  });

  it("renders four stat slabs: dose received vs unsheltered, time to shelter, stops completed, plan revisions", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/DOSE RECEIVED VS UNSHELTERED/i);
    expect(html).toMatch(/TIME TO SHELTER/i);
    expect(html).toMatch(/STOPS COMPLETED/i);
    expect(html).toMatch(/PLAN REVISIONS/i);
  });

  it("renders planned vs actual timeline and alerts table with response times", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/PLANNED VS ACTUAL/i);
    expect(html).toMatch(/ALERTS AND RESPONSES/i);
    expect(html).toMatch(/RADIATION_ALERT|SOLAR/i);
  });

  it("renders map trace container with schematic tag", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/MAP TRACE/i);
    expect(html).toMatch(/<svg/i);
  });

  it("renders stop tasks summary with simulated provenance chip (01 FR-50)", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/STOP TASKS/i);
    expect(html).toContain('data-provenance="simulated"');
  });

  it("renders event log table with sim times, actors and events", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/EVENT LOG/i);
    expect(html).toContain("<table");
  });

  it("includes log_hash and mandatory NASA Space Apps Challenge disclaimer (01 §F.1)", () => {
    const html = renderToStaticMarkup(createElement(PostEvaReport));

    expect(html).toMatch(/LOG HASH/i);
    expect(html).toMatch(/NASA Space Apps/i);
  });
});
