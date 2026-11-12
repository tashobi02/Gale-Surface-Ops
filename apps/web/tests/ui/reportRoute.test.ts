/**
 * T27.03 — SCR-17 on its route: GET /api/report from the Hab Core -> adaptPostEvaReport -> render
 * (docs/specs/03 SCR-17; 01 FR-46, NFR-01). The fetch is stubbed; the report is built by the Hab Core's own builder, so
 * the wire shape under test is the real one. Loading and failure keep the layout with "—" and say why.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  describe("Export log JSON (FD-053)", () => {
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    let blobs: Blob[];
    let downloads: string[];
    let revoke: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      blobs = [];
      downloads = [];
      revoke = vi.fn();
      Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return `blob:report-${blobs.length}`; }), revokeObjectURL: revoke });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    });
    afterEach(() => {
      Object.assign(URL, { createObjectURL: realCreate, revokeObjectURL: realRevoke });
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    const route = (log: () => Promise<Response>) =>
      vi.fn(async (url: string) => (url === "api/log" ? log() : json({ ...realReport(), session_id: "session-test" })));

    it("export downloads log JSON: GET api/log, the events as a JSON array, named log-<session_id>.json", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const fetchImpl = route(async () => new Response('{"seq":1,"kind":"SESSION_LOADED"}\n{"seq":2,"kind":"EVA_STARTED"}\n', { status: 200 }));
      const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
      await flush();
      await click(must(container, '[data-slot="export-log"]'));
      await flush();
      expect(fetchImpl).toHaveBeenCalledWith("api/log");
      expect(downloads).toEqual(["log-session-test.json"]);
      expect(JSON.parse(await blobs[0]!.text())).toEqual([{ seq: 1, kind: "SESSION_LOADED" }, { seq: 2, kind: "EVA_STARTED" }]);
      expect(blobs[0]!.type).toBe("application/json");
      // The URL is revoked after the download had time to start, not right after the click.
      expect(revoke).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(revoke).toHaveBeenCalledWith("blob:report-1");
    });

    it("a second click while the export runs does not start another", async () => {
      let release: (r: Response) => void = () => {};
      const fetchImpl = route(() => new Promise<Response>((resolve) => { release = resolve; }));
      const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
      await flush();
      await click(must(container, '[data-slot="export-log"]'));
      await click(must(container, '[data-slot="export-log"]'));
      release(new Response('{"seq":1}', { status: 200 }));
      await flush();
      await flush();
      expect(fetchImpl.mock.calls.filter(([url]) => url === "api/log")).toHaveLength(1);
      expect(downloads).toHaveLength(1);
    });

    it("an HTTP error says so in an alert that is not printed, and downloads nothing", async () => {
      const fetchImpl = route(async () => new Response("no", { status: 503 }));
      const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
      await flush();
      await click(must(container, '[data-slot="export-log"]'));
      await flush();
      const alert = must(container, '[data-slot="report-export-error"]');
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).toContain("HTTP 503");
      expect(alert.closest(".report-route-no-print")).not.toBeNull();
      expect(downloads).toEqual([]);
    });

    it("a log line that is not JSON says so and downloads nothing", async () => {
      const fetchImpl = route(async () => new Response('{"seq":1}\nnot json\n', { status: 200 }));
      const { container } = await mount(createElement(ReportRoute, { fetchImpl }));
      await flush();
      await click(must(container, '[data-slot="export-log"]'));
      await flush();
      expect(must(container, '[data-slot="report-export-error"]').textContent).toContain("Could not export log");
      expect(downloads).toEqual([]);
      expect(blobs).toEqual([]);
    });
  });
});
