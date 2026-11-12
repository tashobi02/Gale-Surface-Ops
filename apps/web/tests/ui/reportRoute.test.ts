/**
 * T27.03 — SCR-17 on its route: GET /api/report from the Hab Core -> adaptPostEvaReport -> render
 * (docs/specs/03 SCR-17; 01 FR-46, NFR-01). The fetch is stubbed; the report is built by the Hab Core's own builder, so
 * the wire shape under test is the real one. Loading and failure keep the layout with "—" and say why.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { buildReport } from "../../../hab-core/src/report";
import { ReportRoute } from "../../src/ui/live/ReportRoute";
import { click, flush, installDom, mount, must, removeDom } from "./domHarness";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const realReport = () => JSON.parse(JSON.stringify(buildReport([], "feedbeef")));

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ReportRoute", () => {
  it("fetches the report from the Hab Core's own origin only, once", async () => {
    const fetchImpl = vi.fn(async () => json(realReport()));
    await mount(createElement(ReportRoute, { fetchImpl }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toBe("api/report");
    expect(url).not.toMatch(/^[a-z]+:\/\//i);
  });

  it("while loading: the report layout with —, and a status line saying it is loading", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    expect(must(container, '[data-slot="report-status"]').textContent).toContain("LOADING");
    expect(must(container, '[data-slot="report-status"]').getAttribute("data-state")).toBe("loading");
    expect(must(container, '[data-surface="report"]').textContent).toContain("—");
  });

  it("loaded: the adapted report is shown (log hash from the server) and there is no status line", async () => {
    const fetchImpl = vi.fn(async () => json(realReport()));
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    await flush();
    expect(container.querySelector('[data-slot="report-status"]')).toBeNull();
    expect(must(container, '[data-surface="report"]').textContent).toContain("feedbeef");
    // Every displayed report value is labelled and sourced (NFR-05).
    const values = [...container.querySelectorAll("[data-provenance]")];
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v.getAttribute("data-source"), v.outerHTML).toBeTruthy();
  });

  it("no session (404): says so with the server's reason, keeps —, offers retry", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "no session loaded" }, 404));
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    await flush();
    const status = must(container, '[data-slot="report-status"]');
    expect(status.getAttribute("data-state")).toBe("error");
    expect(status.textContent).toContain("REPORT UNAVAILABLE");
    expect(status.textContent).toContain("no session loaded");
    expect(status.textContent).toContain("404");
    expect(must(container, '[data-surface="report"]').textContent).toContain("—");
    expect(must(status, '[data-slot="report-retry"]')).toBeTruthy();
  });

  it("network failure: error status with the reason, never a blank page", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    await flush();
    expect(must(container, '[data-slot="report-status"]').textContent).toContain("Failed to fetch");
    expect(must(container, '[data-surface="report"]')).toBeTruthy();
  });

  it("a body that is not a report is an error, not a half-filled report", async () => {
    for (const body of [{}, { stops: 3 }, null, "text"]) {
      const fetchImpl = vi.fn(async () => json(body));
      const { container, unmount } = await mount(createElement(ReportRoute, { fetchImpl }));
      await flush();
      expect(must(container, '[data-slot="report-status"]').getAttribute("data-state"), JSON.stringify(body)).toBe("error");
      await unmount();
    }
    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    const { container } = await mount(createElement(ReportRoute, { fetchImpl: html }));
    await flush();
    expect(must(container, '[data-slot="report-status"]').textContent).toContain("not valid JSON");
  });

  it("RETRY fetches again and shows the report when it is there", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => (++calls === 1 ? json({ error: "no session loaded" }, 404) : json(realReport())));
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    await flush();
    await click(must(container, '[data-slot="report-retry"]'));
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-slot="report-status"]')).toBeNull();
    expect(must(container, '[data-surface="report"]').textContent).toContain("feedbeef");
  });
  it("export downloads log JSON", async () => {
    const fetchImpl = vi.fn(async (url: string) => url === "api/log" ? new Response('{"seq":1}\n{"seq":2}', { status: 200 }) : json({ ...realReport(), session_id: "session-test" }));
    const create = vi.fn(() => "blob:report");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
    await flush();
    await click(must(container, '[data-slot="export-log"]'));
    await flush();
    expect(fetchImpl).toHaveBeenCalledWith("api/log");
    expect(create).toHaveBeenCalledOnce();
    expect(clicked).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:report");
    clicked.mockRestore();
  });

});
