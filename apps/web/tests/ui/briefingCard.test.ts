/**
 * SCR-08 Briefing Card unit tests (T11.03, T11.08; 03 SCR-08; 04 §F SCR-08).
 * Tests the four named cases from package 14:
 * - partial omits totals
 * - over limits lists limits
 * - tasks per stop
 * - no plan shows empty banner
 */
import { createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResult, StopTaskSeed, Waypoint } from "@marswalk/protocol";
import type { AppContext } from "../../src/ui/context";
import { BriefingCard } from "../../src/ui/screens/scr08BriefingCard";
import { PROTOTYPE_DISCLAIMER } from "../../src/export/planExport";
import { click, installDom, mount, removeDom } from "./domHarness";
import { fakePlanStore, SCENARIO } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
import okJson from "../fixtures/plan-results/ok.json";
import partialJson from "../fixtures/plan-results/partial.json";
import overLimitsJson from "../fixtures/plan-results/over-limits.json";

vi.mock("../../src/ui/briefing/mapSnapshot", () => ({ captureBriefingMap: vi.fn(async () => "data:image/png;base64,bWFw") }));
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

  it("failed capture shows an explicit error and no stale image", async () => {
    vi.mocked(captureBriefingMap).mockRejectedValueOnce(new Error("Canvas is tainted"));
    const { ctx } = createTestContext({});
    const view = await mount(h(BriefingCard, { ctx }));
    expect(view.container.querySelector("[data-slot='map-error']")?.textContent).toContain("Canvas is tainted");
    expect(view.container.querySelector("img")).toBeNull();
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
});
