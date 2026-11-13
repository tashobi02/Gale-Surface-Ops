/**
 * SCR-08 Briefing Card unit tests (T11.03, T11.08; 03 SCR-08; 04 §F SCR-08).
 * Tests the four named cases from package 14:
 * - partial omits totals
 * - over limits lists limits
 * - tasks per stop
 * - no plan shows empty banner
 */
import { createElement as h } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResult, StopTaskSeed, Waypoint } from "@marswalk/protocol";
import type { AppContext } from "../../src/ui/context";
import { BriefingCard } from "../../src/ui/screens/scr08BriefingCard";
import { PROTOTYPE_DISCLAIMER } from "../../src/export/planExport";
import { click, flush, installDom, mount, removeDom } from "./domHarness";
import { contrast } from "./wcag";
import { fakePlanStore, SCENARIO } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
import okJson from "../fixtures/plan-results/ok.json";
import partialJson from "../fixtures/plan-results/partial.json";
import overLimitsJson from "../fixtures/plan-results/over-limits.json";

vi.mock("../../src/ui/briefing/mapSnapshot", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../src/ui/briefing/mapSnapshot")>()), captureBriefingMap: vi.fn(async () => undefined) }));
vi.mock("../../src/ui/briefing/publishPlan", () => ({ publishPlan: vi.fn(async () => ({ status: "accepted", planHash: "test" })) }));
import { captureBriefingMap } from "../../src/ui/briefing/mapSnapshot";
import { publishPlan } from "../../src/ui/briefing/publishPlan";

describe("SCR-08 — Briefing Card (T11.03, T11.08)", () => {
  beforeEach(() => {
    installDom();
    vi.clearAllMocks();
  });

  afterEach(() => {
    removeDom();
  });

  function createTestContext(overrides: {
    status?: "OK" | "OverLimits" | "Partial" | "Empty";
    result?: PlanResult | null;
    waypoints?: Waypoint[];
    stopTasks?: StopTaskSeed[];
  }) {
    const site = mockLoadedSite();
    const waypoints: Waypoint[] = overrides.waypoints ?? [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" },
      { id: "wp-1", role: "stop", x_m: 100, y_m: 100, label: "Boxwork ridge", poi_id: "poi-boxwork-ridge" },
      { id: "wp-2", role: "stop", x_m: 200, y_m: 200, label: "Sulfate contact", poi_id: "poi-sulfate-contact" },
    ];
    const { store } = fakePlanStore({
      status: overrides.status ?? "OK",
      result: overrides.result !== undefined ? overrides.result : (okJson as PlanResult),
      waypoints,
      stop_tasks: overrides.stopTasks ?? [],
      scenario: { ...SCENARIO, eva_start_utc: "2026-11-14T08:00:00Z" },
    });

    const ctx: AppContext = {
      site,
      planStore: store,
      workerClient: {} as never,
      debug: false,
    };
    return { ctx, site, store };
  }

  it("partial omits totals", async () => {
    const { ctx } = createTestContext({
      status: "Partial",
      result: partialJson as PlanResult,
    });

    const { container, unmount } = await mount(h(BriefingCard, { ctx }));

    // Partial banner "Plan incomplete — not valid for use"
    const banner = container.querySelector("[data-slot='banner']");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Plan incomplete — not valid for use");

    expect(container.querySelector("[data-slot='totals']")).toBeNull();
    expect(container.querySelector("[data-slot='radiation']")).toBeNull();

    // Publish button is disabled when partial
    const publishBtn = container.querySelector<HTMLButtonElement>("button[data-action='publish']");
    expect(publishBtn).not.toBeNull();
    expect(publishBtn?.disabled).toBe(true);

    await unmount();
  });

  it("over limits lists limits", async () => {
    const { ctx } = createTestContext({
      status: "OverLimits",
      result: overLimitsJson as PlanResult,
    });

    const { container, unmount } = await mount(h(BriefingCard, { ctx }));

    // Over limits banner listing exceeded limits
    const banner = container.querySelector("[data-slot='banner']");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("OVER LIMITS");
    expect(banner?.textContent?.toLowerCase()).toMatch(/exceeded|walkback|slope|darkness/);

    // Status pill on the card shows OVER LIMITS
    const statusPill = container.querySelector("[data-status='caution']");
    expect(statusPill).not.toBeNull();
    expect(statusPill?.textContent).toContain("OVER LIMITS");

    // Totals are not omitted for over-limits
    const metrics = container.querySelectorAll(".metric-value");
    const numbers = Array.from(metrics)
      .map((m) => m.textContent)
      .filter((t) => t !== "—");
    expect(numbers.length).toBeGreaterThanOrEqual(4);

    await unmount();
  });

  it("tasks per stop", async () => {
    const stopTasks: StopTaskSeed[] = [
      { task_id: "t-1", stop_id: "wp-1", crew_id: "EV1", kind: "sample", text: "Collect sulfate sample" },
      { task_id: "t-2", stop_id: "wp-1", crew_id: "EV2", kind: "image", text: "Photograph layering" },
      { task_id: "t-3", stop_id: "wp-2", crew_id: "EV1", kind: "observe", text: "Survey ridge transition" },
    ];

    const { ctx } = createTestContext({
      status: "OK",
      result: okJson as PlanResult,
      stopTasks,
    });

    const { container, unmount } = await mount(h(BriefingCard, { ctx }));

    // Stop tasks table contains the tasks by stop and crew
    const tasksTable = container.querySelector("[data-slot='stop-tasks']");
    expect(tasksTable).not.toBeNull();
    expect(tasksTable?.textContent).toContain("Collect sulfate sample");
    expect(tasksTable?.textContent).toContain("Photograph layering");
    expect(tasksTable?.textContent).toContain("Survey ridge transition");
    expect(tasksTable?.textContent).toContain("EV1");
    expect(tasksTable?.textContent).toContain("EV2");

    // Stops timeline table includes notes with task counts / POI name
    const stopsTable = container.querySelector("[data-slot='stops-table']");
    expect(stopsTable).not.toBeNull();
    expect(stopsTable?.textContent).toMatch(/2 tasks|1 task/);

    await unmount();
  });

  it("no plan shows empty banner", async () => {
    const { ctx } = createTestContext({
      status: "Empty",
      result: null,
      waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" }],
    });

    const { container, unmount } = await mount(h(BriefingCard, { ctx }));

    // Empty banner: "Add at least one stop"
    const emptyBanner = container.querySelector("[data-slot='empty-banner']");
    expect(emptyBanner).not.toBeNull();
    expect(emptyBanner?.textContent).toContain("Add at least one stop");

    // The screen slot is present in every state, so the harness finds the card either way.
    expect(container.querySelector("[data-slot='briefing-card']")).not.toBeNull();

    // Back to map button
    const backBtn = container.querySelector<HTMLButtonElement>("button[data-action='back-to-map']");
    expect(backBtn).not.toBeNull();
    expect(backBtn?.textContent).toContain("Back to map");

    await unmount();
  });

  it("renders header, disclaimer, and provenance attributes", async () => {
    const { ctx, site } = createTestContext({
      status: "OK",
      result: okJson as PlanResult,
    });

    const { container, unmount } = await mount(h(BriefingCard, { ctx }));

    // Header plan name (FD-133)
    const title = container.querySelector(".scr08-title");
    expect(title?.textContent).toContain(`Plan for ${site.site.name}`);
    expect(title?.textContent).toContain("2026-11-14");

    // Header generated time = computed_utc (FD-138)
    const generated = container.querySelector("[data-slot='generated-time']");
    expect(generated?.textContent).toContain((okJson as PlanResult).computed_utc);

    for (const source of site.site.sources) {
      expect(container.querySelector(`a[href="#/sources#source-${source.source_id}"]`)).not.toBeNull();
    }

    // Full 01 §F.1 prototype disclaimer (FD-135)
    const disclaimer = container.querySelector("[data-slot='disclaimer']");
    expect(disclaimer?.textContent).toContain(PROTOTYPE_DISCLAIMER);

    // Every displayed value has data-provenance and data-source
    const provenanceElements = container.querySelectorAll("[data-provenance]");
    expect(provenanceElements.length).toBeGreaterThan(0);
    for (const el of Array.from(provenanceElements)) {
      expect(el.getAttribute("data-provenance")).toMatch(/measured|derived|modelled|assumed|replayed|simulated/);
      expect(el.getAttribute("data-source")).toBeTruthy();
    }

    await unmount();
  });
  it("publish carries the store stop tasks beside the export", async () => {
    const stopTasks: StopTaskSeed[] = [{ task_id: "t-1", stop_id: "wp-1", crew_id: "EV1", kind: "sample", text: "Collect sulfate sample" }];
    const { ctx } = createTestContext({ stopTasks });
    const view = await mount(h(BriefingCard, { ctx }));
    await click(view.container.querySelector("button[data-action='publish']")!);
    expect(publishPlan).toHaveBeenCalledWith({ plan: expect.objectContaining({ site_id: ctx.site.site.site_id }), stop_tasks: stopTasks });
    expect(view.container.textContent).toContain("Published");
    await view.unmount();
  });

  it("failed capture shows an explicit notice with the reason, and the thumbnail with the route as SVG, never a stale image (T11.06)", async () => {
    vi.mocked(captureBriefingMap).mockRejectedValueOnce(new Error("Canvas is tainted"));
    const routed = { ...(okJson as PlanResult), legs: [{ ...(okJson as PlanResult).legs[0]!, geometry: [[0, 0], [50, 40], [100, 100]] }] } as PlanResult;
    const { ctx } = createTestContext({ result: routed });
    const view = await mount(h(BriefingCard, { ctx }));
    const notice = view.container.querySelector("[data-slot='map-error']")!;
    expect(notice.textContent).toContain("Canvas is tainted");
    expect(notice.textContent).toMatch(/thumbnail/i);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.querySelector("[data-status='caution'] .status-glyph")).not.toBeNull(); // shape + word, not colour alone
    const fallback = view.container.querySelector("[data-slot='map-fallback']")!;
    expect(fallback.querySelector("svg polyline.route")).not.toBeNull();
    expect(fallback.querySelectorAll("svg text")).toHaveLength(3); // start and two stops, numbered
    // The only image is the site's own thumbnail file: nothing drawn from an earlier plan, no data: or blob: source.
    expect([...view.container.querySelectorAll("img")].map(i => i.getAttribute("src"))).toEqual([expect.stringMatching(/^sites\/mock_site\/tiles\//)]);
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(view.container.querySelector<HTMLButtonElement>("nav button")!.disabled).toBe(false); // Print stays available
    await view.unmount();
  });

  it("draws the map into a canvas element, not a data-URL image (FD-363)", async () => {
    // The app's CSP is `default-src 'self'`: a `data:` image source is refused, so the map must be a canvas.
    const { ctx } = createTestContext({});
    const view = await mount(h(BriefingCard, { ctx }));
    await flush();
    expect(view.container.querySelector("img")).toBeNull();
    const canvas = view.container.querySelector<HTMLCanvasElement>(".scr08-map canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(860);
    expect(canvas?.height).toBe(470);
    expect(captureBriefingMap).toHaveBeenCalledWith(canvas, ctx.site, ctx.planStore);
    await view.unmount();
  });

  it("a stale result while computing shows the empty banner", async () => {
    const { ctx, store } = createTestContext({});
    const state = store.get();
    vi.spyOn(store, "get").mockReturnValue({ ...state, status: "Computing" });
    const view = await mount(h(BriefingCard, { ctx }));
    expect(view.container.querySelector("[data-slot='empty-banner']")).not.toBeNull();
    expect(view.container.querySelector("[data-action='publish']")).toBeNull();
    await view.unmount();
  });

  it("the stops region is keyboard reachable: it scrolls sideways on a narrow screen", async () => {
    // A scrollable region must be focusable (axe `scrollable-region-focusable`).
    const { ctx } = createTestContext({});
    const view = await mount(h(BriefingCard, { ctx }));
    const stops = view.container.querySelector<HTMLElement>(".scr08-stops");
    expect(stops?.getAttribute("tabindex")).toBe("0");
    expect(stops?.getAttribute("aria-label")).toBeTruthy();
    await view.unmount();
  });
});

/**
 * The card is a PRINT surface: every colour it shows is a PRINT token (04 §C.1 PRINT, FD-013).
 * `--unknown` is a screen token (2.07 : 1 on paper) and the profile's NO ROUTE line uses it, so the card
 * remaps it to `--print-unknown` (7.1 : 1). The card's own stylesheet, read as source: jsdom cannot
 * resolve `var()`.
 */
describe("SCR-08 print surface uses PRINT tokens only (FD-364)", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/screens/scr08BriefingCard.css"), "utf8");

  it("remaps --unknown to the PRINT unknown colour on the card", () => {
    expect(css).toMatch(/--unknown:\s*var\(--print-unknown\)/);
  });

  it("the PRINT unknown colour keeps 4.5 : 1 on paper", () => {
    expect(contrast("#6D28D9", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // The screen token the card must not use on paper.
    expect(contrast("#B8A9FF", "#FFFFFF")).toBeLessThan(4.5);
  });

  it("the map is a canvas, not a data-URL image (the CSP refuses a data source)", () => {
    expect(css).not.toMatch(/url\(data:/);
    expect(css).toMatch(/\.scr08-map-canvas/);
  });
});
