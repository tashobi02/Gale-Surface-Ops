/**
 * T08.05 — SCR-04 stops list (03 SCR-04; 04 §D "Stops list", §C.5, §E; 01 FR-06, FR-09, FR-15).
 * The real StopsList is mounted on the real plan store (fake worker): reorder and delete reach the worker at once, Undo restores,
 * every value carries provenance, and every control is a named button (NFR-04).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { PlanResultMessage } from "@marswalk/protocol";
import { StopsList } from "../../src/ui/plan/stopsList";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
import { START, STOP_FREE, STOP_POI, realPlan, type RealPlan } from "./realPlanStore";

beforeAll(() => installDom());
afterAll(() => removeDom());
beforeEach(() => vi.useFakeTimers());

const SITE = mockLoadedSite();
const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function list(plan: RealPlan): Promise<HTMLElement> {
  const m = await mountRaw(createElement(StopsList, { planStore: plan.store, site: SITE }));
  open.push(m);
  return must(m.container, '[data-slot="stops-list"]');
}
const rows = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>("[data-stops-row]")];
const stopIds = (plan: RealPlan): string[] => plan.store.get().waypoints.filter((w) => w.role === "stop").map((w) => w.id);
const timeline = (n: number): PlanResultMessage["stops_timeline"] =>
  Array.from({ length: n }, (_, i) => ({ arrive_utc: "2026-11-14T08:00:00Z", depart_utc: "2026-11-14T08:20:00Z", arrive_ltst: `1${i}:30`, sun_elevation_deg: 40 + i }));

describe("StopsList rows (03 SCR-04; 04 §D)", () => {
  it("with only the start it says how to add a stop, and lists the start without edit controls", async () => {
    const plan = realPlan();
    const root = await list(plan);
    expect(must(root, '[data-slot="stops-empty"]').textContent).toBe("Add a stop: click a POI or press A");
    expect(rows(root)).toHaveLength(1);
    expect(rows(root)[0]!.getAttribute("data-role")).toBe("start");
    expect(rows(root)[0]!.querySelector('[data-action="move-up"], [data-action="move-down"], [data-action="delete"]')).toBeNull();
  });

  it("one row per stop in order: number, POI name or free stop, coordinates in the 02 §C.1 format", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    const stops = rows(root).filter((r) => r.getAttribute("data-role") === "stop");
    expect(stops.map((r) => r.getAttribute("data-waypoint-id"))).toEqual(["wp-1", "wp-2"]);
    expect(stops.map((r) => r.getAttribute("data-stop-index"))).toEqual(["1", "2"]);
    expect(must(stops[0]!, '[data-slot="stop-name"]').textContent).toBe("Boxwork ridge");
    expect(must(stops[1]!, '[data-slot="stop-name"]').textContent).toBe("Free stop");
    expect(must(stops[0]!, '[data-slot="stop-coords"]').textContent).toMatch(/^[−\d.]+°, [\d.]+°E$/);
  });

  it("coordinates are assumed user input (FD-114) except an unmoved start, which is derived from the manifest", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const root = await list(plan);
    const coords = (id: string): HTMLElement => must(root, `[data-waypoint-id="${id}"] [data-slot="stop-coords"]`);
    expect(coords("wp-1").getAttribute("data-provenance")).toBe("assumed");
    expect(coords("wp-1").getAttribute("data-source")).toBe("user:waypoint.wp-1");
    expect(coords("wp-0").getAttribute("data-provenance")).toBe("derived");
    expect(coords("wp-0").getAttribute("data-source")).toBe("manifest:default_start");
  });

  it("arrival LTST and sun elevation come only from the latest result, modelled, and read the dash before there is one", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const root = await list(plan);
    const arrival = (): HTMLElement => must(root, '[data-waypoint-id="wp-1"] [data-slot="stop-arrival"] [data-provenance]');
    expect(arrival().textContent).toBe("—");
    expect(arrival().getAttribute("data-unavailable")).toBe("true");
    plan.store.setScenario({ dwell_min_per_stop: 25 });
    await vi.advanceTimersByTimeAsync(300);
    plan.answer({ stops_timeline: timeline(2) });
    await vi.advanceTimersByTimeAsync(0);
    const shown = must(root, '[data-waypoint-id="wp-1"] [data-slot="stop-arrival"]');
    expect(shown.textContent).toContain("11:30");
    const value = must(shown, '[data-slot="stop-ltst"]');
    expect(value.getAttribute("data-provenance")).toBe("modelled");
    expect(value.getAttribute("data-source")).toBe("mars24-allison-mcewen-2000");
    expect(must(shown, '[data-slot="stop-sun-elevation"]').textContent).toContain("41");
  });

  it("a stop whose leg has no route is marked with the blocked shape, the word and the reason (04 §D)", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    plan.store.setScenario({ dwell_min_per_stop: 25 });
    await vi.advanceTimersByTimeAsync(300);
    plan.answer({
      status: "PARTIAL",
      totals: null,
      legs: [
        { from: "wp-0", to: "wp-1", status: "OK" } as never,
        { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    const bad = must(root, '[data-waypoint-id="wp-2"] [data-slot="stop-blocked"]');
    expect(bad.textContent).toContain("BLOCKED");
    expect(bad.textContent).toContain("disconnected by slope");
    expect(root.querySelector('[data-waypoint-id="wp-1"] [data-slot="stop-blocked"]')).toBeNull();
  });

  it("while computing the arrival shows the previous value dimmed, flagged busy, not a blank (04 §D)", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const root = await list(plan);
    plan.store.setScenario({ dwell_min_per_stop: 25 });
    await vi.advanceTimersByTimeAsync(300);
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(must(root, '[data-waypoint-id="wp-1"] [data-slot="stop-arrival"]').getAttribute("data-computing")).toBe("true");
  });
});

describe("StopsList selection and hover (C11; 04 §C.5)", () => {
  it("selecting a row selects the waypoint and the row says so (selected is a state word, not colour)", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const root = await list(plan);
    await click(must(root, '[data-waypoint-id="wp-1"] [data-action="select"]'));
    expect(plan.store.get().selected_waypoint_id).toBe("wp-1");
    const row = must(root, '[data-waypoint-id="wp-1"]');
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(must(row, '[data-action="select"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("a row selected on the map is highlighted in the list", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    const { act } = await import("react");
    await act(async () => plan.store.selectWaypoint("wp-2"));
    expect(must(root, '[data-waypoint-id="wp-2"]').getAttribute("data-selected")).toBe("true");
    expect(must(root, '[data-waypoint-id="wp-1"]').getAttribute("data-selected")).toBeNull();
  });
});

describe("StopsList edits (03 §C.3)", () => {
  it("reorder recomputes immediately: one COMPUTE_PLAN with the new order, with no 300 ms wait", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    expect(plan.calls).toHaveLength(0);
    await click(must(root, '[data-waypoint-id="wp-2"] [data-action="move-up"]'));
    expect(stopIds(plan)).toEqual(["wp-2", "wp-1"]);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]!.req.waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-2", "wp-1"]);
    await click(must(root, '[data-waypoint-id="wp-2"] [data-action="move-down"]'));
    expect(stopIds(plan)).toEqual(["wp-1", "wp-2"]);
    expect(plan.calls).toHaveLength(2);
  });

  it("the first stop cannot move up and the last cannot move down", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    expect(must<HTMLButtonElement>(root, '[data-waypoint-id="wp-1"] [data-action="move-up"]').disabled).toBe(true);
    expect(must<HTMLButtonElement>(root, '[data-waypoint-id="wp-2"] [data-action="move-down"]').disabled).toBe(true);
  });

  it("delete removes the stop and recomputes at once", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    await click(must(root, '[data-waypoint-id="wp-1"] [data-action="delete"]'));
    expect(stopIds(plan)).toEqual(["wp-2"]);
    expect(plan.calls).toHaveLength(1);
    expect(root.querySelector('[data-waypoint-id="wp-1"]')).toBeNull();
  });

  it("undo restores the previous waypoint list and recomputes; it is disabled until there is something to undo", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    const undo = (): HTMLButtonElement => must<HTMLButtonElement>(root, '[data-action="undo"]');
    expect(undo().disabled).toBe(true);
    await click(must(root, '[data-waypoint-id="wp-1"] [data-action="delete"]'));
    expect(undo().disabled).toBe(false);
    await click(undo());
    expect(stopIds(plan)).toEqual(["wp-1", "wp-2"]);
    expect(plan.calls).toHaveLength(2);
    expect(undo().disabled).toBe(true);
  });
});

describe("StopsList access (NFR-04; 04 §E)", () => {
  it("every control is a named button, and each row carries a drag handle and the data attributes the drag module reads", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const root = await list(plan);
    for (const b of root.querySelectorAll("button")) expect((b.getAttribute("aria-label") ?? b.textContent ?? "").trim(), b.outerHTML).not.toBe("");
    expect(must(root, '[data-waypoint-id="wp-2"] [data-action="delete"]').getAttribute("aria-label")).toBe("Delete stop 2");
    expect(must(root, '[data-waypoint-id="wp-2"] [data-action="move-up"]').getAttribute("aria-label")).toBe("Move stop 2 up");
    const handle = must(root, '[data-waypoint-id="wp-1"] [data-drag-handle]');
    expect(handle.getAttribute("aria-hidden")).toBe("true");
    expect(root.getAttribute("data-stops-list")).not.toBeNull();
  });

  it("the list is an ordered list named Stops, the text alternative to the map", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const root = await list(plan);
    const ol = must(root, "ol");
    expect(ol.getAttribute("aria-label")).toBe("Stops");
  });
});
