/**
 * T07.06, T07.08, T07.13, T13.06 — SCR-02 workspace (docs/specs/03 SCR-02; 04 §E.3, §F, Appendix A §B; FD-063, FD-080, FD-118).
 * The real MapWorkspace is mounted with the real OpenLayers map on the F4 mock site. jsdom has no layout, so the map has no
 * size and draws no frame; pixel geometry and tile painting are the harness's (`make e2e-one CHECK=offline|axe|targets|provenance`).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { AppContext, MapHandle, WorkerClient } from "../../src/ui/context";
import { MapWorkspace } from "../../src/ui/screens/scr02MapWorkspace";
import { click, installDom, keyDown, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite, stubReducedMotion, stubResizeObserver } from "./map/mapFixtures";
import { fakePlanStore, resultOf, type FakePlanStore } from "./planStoreFake";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

beforeAll(() => {
  installDom();
  stubResizeObserver();
  // The real tokens.css, so the map layers read real design tokens.
  const css = readFileSync(resolve(__dirname, "../../src/ui/styles/tokens.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
});
afterAll(() => removeDom());

const SITE = mockLoadedSite();
const open: Mounted[] = [];
let restoreMotion: () => void;
beforeEach(() => {
  restoreMotion = stubReducedMotion(true);
  window.location.hash = "";
});
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
  restoreMotion();
});

const workerClient = {
  samplePoint: () => new Promise<never>(() => {}),
  computePlan: () => new Promise<never>(() => {}),
  postMessage() {},
  onMessage: () => () => {},
  terminate() {},
  retry() {},
  isCrashed: () => false,
} as unknown as WorkerClient;

async function workspace(width: number, over: { debug?: boolean; plan?: Parameters<typeof fakePlanStore>[0] } = {}): Promise<{ root: HTMLElement; plan: FakePlanStore; ctx: AppContext; handle: () => MapHandle }> {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
  const plan = fakePlanStore(over.plan ?? {});
  const ctx: AppContext = { site: SITE, planStore: plan.store, workerClient, debug: over.debug ?? false };
  let handle: MapHandle | null = null;
  const m = await mountRaw(createElement(MapWorkspace, { ctx, onMapReady: (h: MapHandle) => (handle = h) }));
  open.push(m);
  return { root: must(m.container, '[data-slot="map-workspace"]'), plan, ctx, handle: () => handle! };
}

describe("MapWorkspace layout (04 §E.3, §F)", () => {
  it("three columns at 1280: both drawers beside the map, results panel below", async () => {
    const { root } = await workspace(1280);
    expect(root.getAttribute("data-layout")).toBe("three-column");
    expect(must(root, '[data-drawer="left"]').hasAttribute("hidden")).toBe(false);
    expect(must(root, '[data-drawer="right"]').hasAttribute("hidden")).toBe(false);
    expect(root.querySelector('[data-slot="drawer-toggle"]')).toBeNull();
    expect(must(root, '[data-slot="map-host"]')).toBeTruthy();
    expect(must(root, '[data-slot="results-panel"]')).toBeTruthy();
  });

  it("one drawer at 1024: none open to begin with, opening one closes the other, the map is never covered by two", async () => {
    const { root } = await workspace(1024);
    expect(root.getAttribute("data-layout")).toBe("one-drawer");
    const left = must(root, '[data-drawer="left"]');
    const right = must(root, '[data-drawer="right"]');
    expect(left.hasAttribute("hidden")).toBe(true);
    expect(right.hasAttribute("hidden")).toBe(true);

    await click(must(root, '[data-slot="drawer-toggle"][data-for="left"]'));
    expect(left.hasAttribute("hidden")).toBe(false);
    expect(right.hasAttribute("hidden")).toBe(true);

    await click(must(root, '[data-slot="drawer-toggle"][data-for="right"]'));
    expect(left.hasAttribute("hidden")).toBe(true);
    expect(right.hasAttribute("hidden")).toBe(false);

    await click(must(root, '[data-slot="drawer-toggle"][data-for="right"]'));
    expect(right.hasAttribute("hidden")).toBe(true);
  });

  it("the top bar has the logo to SCR-01, the data-version chip and the Briefing and Sources buttons (04 Appendix A §B)", async () => {
    const { root } = await workspace(1280);
    const bar = must(root, '[data-slot="top-bar"]');
    expect(must<HTMLAnchorElement>(bar, '[data-slot="logo"]').getAttribute("href")).toBe("#/");
    const chip = must(bar, '[data-slot="data-version"]');
    expect(chip.textContent).toContain(SITE.site.data_version);
    expect(chip.getAttribute("data-provenance")).toBe("derived");
    expect(chip.getAttribute("data-source")).toBeTruthy();
    expect(must(bar, '[data-slot="briefing"]').textContent).toMatch(/Briefing/);
    expect(must<HTMLAnchorElement>(bar, '[data-slot="sources"]').getAttribute("href")).toBe("#/sources");
  });

  it("the results panel is the SCR-05 panel on the plan store, in the bottom slot", async () => {
    const { root } = await workspace(1280);
    expect(must(root, '[data-slot="results-panel"] .scr05-results-panel')).toBeTruthy();
  });

  it("the left drawer has the Layers and Plan tabs and the right drawer the POI detail and Conditions tabs, each saying plainly when its panel is not built (no throw, no blank)", async () => {
    const { root } = await workspace(1280);
    const names = (drawer: string): string[] => [...root.querySelectorAll(`[data-drawer="${drawer}"] [role="tab"]`)].map((t) => t.textContent!.trim());
    expect(names("left")).toEqual(["Layers", "Plan"]);
    expect(names("right")).toEqual(["POI detail", "Conditions"]);
    expect(must(root, '[data-drawer="left"] [role="tabpanel"]').textContent).not.toBe("");
    await click(must(root, '[data-drawer="left"] [role="tab"]:nth-child(2)'));
    expect(must(root, '[data-drawer="left"] [role="tab"][aria-selected="true"]').textContent).toContain("Plan");
  });

  it("the Plan tab is the SCR-04 panel on the plan store: inputs, the defaults badge and the stops list (package 09)", async () => {
    const { root } = await workspace(1280);
    await click(must(root, '[data-drawer="left"] [role="tab"]:nth-child(2)'));
    const plan = must(root, '[data-drawer="left"] [data-slot="plan-panel"]');
    expect(plan.querySelector('[data-slot="defaults-badge"]')).not.toBeNull();
    expect(plan.querySelector('[data-field="max_haven_min"] input')).not.toBeNull();
    expect(plan.querySelector('[data-slot="stops-list"]')).not.toBeNull();
    expect(root.querySelector('[data-drawer="left"] [data-slot="panel-pending"]')).toBeNull();
  });
});

describe("MapWorkspace map mount (T07.06, T07.08)", () => {
  it("mounts the real map once, with scale bar, north arrow and the pan/zoom controls", async () => {
    const { root } = await workspace(1280);
    expect(root.querySelectorAll(".ol-viewport")).toHaveLength(1);
    expect(must(root, '[data-testid="scale-bar"]')).toBeTruthy();
    expect(must(root, '[data-testid="north-arrow"]')).toBeTruthy();
    expect(must(root, '[data-slot="map-controls"][data-variant="planner"]')).toBeTruthy();
    expect(root.querySelectorAll(".ol-viewport")).toHaveLength(1);
  });

  it("readout is derived with projection source", async () => {
    const { root, handle } = await workspace(1280);
    const readout = must(root, '[data-testid="coord-readout"]');
    // Nothing measured yet: "—", still `derived`, its source marks it unavailable.
    expect(readout.textContent).toBe("—");
    expect(readout.getAttribute("data-provenance")).toBe("derived");
    handle().getMap<{ dispatchEvent(e: unknown): void }>().dispatchEvent({ type: "pointermove", coordinate: [100, 200] });
    expect(readout.textContent).toContain("x 100 m");
    expect(readout.getAttribute("data-provenance")).toBe("derived");
    expect(readout.getAttribute("data-source")).toBe("proj:IAU_2015:49900");
  });

  it("FIT fits the AOI of the manifest, in projected metres", async () => {
    const { root, ctx, handle } = await workspace(1280);
    handle().setCenter([1, 1]);
    await click(must(root, '[data-slot="map-controls"] [data-control="fit"]'));
    const [x0, y0, x1, y1] = ctx.site.site.aoi.extent_m;
    expect(handle().getCenter()[0]).toBeCloseTo((x0 + x1) / 2, 6);
    expect(handle().getCenter()[1]).toBeCloseTo((y0 + y1) / 2, 6);
  });

  it("every map module is built, so no control is hidden for a missing module (FD-118) and Add stop is on the toolbar", async () => {
    const { root } = await workspace(1280);
    expect(root.querySelector('[data-slot="modules-not-ready"]')).toBeNull();
    const add = must(root, '[data-control="add-stop"]');
    expect(add.getAttribute("aria-pressed")).toBe("false");
    expect(add.textContent).toContain("Add stop");
  });

  it("A toggles add-stop mode: the crosshair shows and the toolbar button follows; pressing it again turns it off (package 10)", async () => {
    const { root } = await workspace(1280);
    const add = must(root, '[data-control="add-stop"]');
    await keyDown(document.body, "a");
    expect(add.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector('[data-slot="crosshair"]')).not.toBeNull();
    await click(add);
    expect(add.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector('[data-slot="crosshair"]')).toBeNull();
  });

  it("the keyboard-move group shows while a stop is selected and names it; nothing for the start (package 10)", async () => {
    const stopSelected = await workspace(1280, { plan: { selected_waypoint_id: "wp-1" } });
    expect(must(stopSelected.root, '[data-slot="keyboard-move"]').getAttribute("aria-label")).toBe("Move stop 1");
    await open.pop()!.unmount();
    const startSelected = await workspace(1280, { plan: { selected_waypoint_id: "wp-0" } });
    expect(startSelected.root.querySelector('[data-slot="keyboard-move"]')).toBeNull();
  });

  it("a placement notice region is in the map box, empty until a placement says something (package 10)", async () => {
    const { root } = await workspace(1280);
    const region = must(root, '[data-slot="placement-notice"] [data-slot="notice"]');
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("data-empty")).toBe("true");
  });

  it("destroys the map and its listeners on unmount", async () => {
    const { plan } = await workspace(1280);
    const before = plan.listenerCount();
    expect(before).toBeGreaterThan(0);
    await open.pop()!.unmount();
    expect(plan.listenerCount()).toBe(0);
    expect(document.querySelector(".ol-viewport")).toBeNull();
  });
});

describe("MapWorkspace keyboard (T13.06, 04 §E, 03 SCR-02)", () => {
  it("B opens briefing once the plan is computed and has a stop", async () => {
    const { root } = await workspace(1280, { plan: { status: "OK", result: resultOf({ legs: [] }) } });
    expect(must<HTMLButtonElement>(root, '[data-slot="briefing"]').disabled).toBe(false);
    await keyDown(document.body, "b");
    expect(window.location.hash).toBe("#/briefing");
  });

  it("B does nothing with no stop or after an error, and the Briefing button is disabled with a reason (04 §D)", async () => {
    const { root } = await workspace(1280, { plan: { status: "Empty", waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0 }] } });
    const button = must<HTMLButtonElement>(root, '[data-slot="briefing"]');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toMatch(/Add a stop/);
    await keyDown(document.body, "B");
    expect(window.location.hash).toBe("");
  });

  it("? opens sources", async () => {
    await workspace(1280);
    await keyDown(document.body, "?");
    expect(window.location.hash).toBe("#/sources");
  });

  it("Delete removes the selected stop through the plan store", async () => {
    const { plan } = await workspace(1280, { plan: { selected_waypoint_id: "wp-1" } });
    const del = vi.spyOn(plan.store, "deleteWaypoint");
    await keyDown(document.body, "Delete");
    expect(del).toHaveBeenCalledWith("wp-1");
  });

  it("the start waypoint is never deleted by the keyboard", async () => {
    const { plan } = await workspace(1280, { plan: { selected_waypoint_id: "wp-0" } });
    const del = vi.spyOn(plan.store, "deleteWaypoint");
    await keyDown(document.body, "Delete");
    expect(del).not.toHaveBeenCalled();
  });

  it("arrow keys pan only while the map has focus", async () => {
    const { root, handle } = await workspace(1280);
    const viewport = must(root, ".ol-viewport");
    const before = handle().getCenter();
    await keyDown(document.body, "ArrowRight");
    expect(handle().getCenter()).toEqual(before);
    viewport.focus();
    await keyDown(viewport, "ArrowRight");
    expect(handle().getCenter()[0]).toBeGreaterThan(before[0]);
  });
});

describe("MapWorkspace debug overlay (T07.13)", () => {
  it("debug overlay only with debug=1", async () => {
    const off = await workspace(1280, { debug: false });
    expect(off.root.querySelector('[data-testid="debug-overlay"]')).toBeNull();
    await open.pop()!.unmount();
    const on = await workspace(1280, { debug: true });
    expect(on.root.ownerDocument.querySelector('[data-testid="debug-overlay"]')).not.toBeNull();
  });
});

describe("MapWorkspace layers and POI selection (package 08: SCR-03, FD-074, FD-111)", () => {
  type Ol = { getLayers(): { getArray(): { getZIndex(): number | undefined; getVisible(): boolean }[] } };
  const visibleAt = (h: MapHandle, z: number): number => h.getMap<Ol>().getLayers().getArray().filter((l) => l.getZIndex() === z && l.getVisible()).length;

  it("the Layers tab is the SCR-03 panel: the manifest's layers, the traverse, the POIs and the EZ stop types, as switches", async () => {
    const { root } = await workspace(1280);
    const ids = [...root.querySelectorAll('[data-drawer="left"] [data-layer-id]')].map((r) => r.getAttribute("data-layer-id"));
    expect(ids).toEqual(expect.arrayContaining(["slope", "elevation", "traverse", "pois", "ez"]));
    expect(root.querySelector('[data-drawer="left"] [data-slot="panel-pending"]')).toBeNull();
  });

  it("a layer switch shows and hides the map layer, and the legend follows the scenario's limits", async () => {
    const { root, handle } = await workspace(1280);
    expect(visibleAt(handle(), 30)).toBe(0);
    await click(must(root, '[data-layer-id="slope"] [role="switch"]'));
    expect(visibleAt(handle(), 30)).toBe(1);
    const legend = must(root, '[data-layer-id="slope"] [data-slot="layer-legend"]');
    expect(legend.querySelector('[data-source="scenario.caution_slope_deg"]')!.textContent).toContain("10");
    expect(legend.querySelector('[data-source="scenario.hard_slope_limit_deg"]')!.textContent).toContain("15");
    await click(must(root, '[data-layer-id="slope"] [role="switch"]'));
    expect(visibleAt(handle(), 30)).toBe(0);
  });

  it("the POI switch hides the POI pins and the EZ switch hides the stop-type markers", async () => {
    const { root, handle } = await workspace(1280);
    expect(visibleAt(handle(), 60)).toBe(1);
    await click(must(root, '[data-layer-id="pois"] [role="switch"]'));
    expect(visibleAt(handle(), 60)).toBe(0);
    expect(visibleAt(handle(), 58)).toBe(1);
    await click(must(root, '[data-layer-id="ez"] [role="switch"]'));
    expect(visibleAt(handle(), 58)).toBe(0);
  });

  it("selecting a POI sets selected_poi_id and opens the POI detail drawer, in its own state and not the plan store's waypoint selection", async () => {
    const { root, plan } = await workspace(1280);
    const select = vi.spyOn(plan.store, "selectWaypoint");
    await click(must(root, '[data-drawer="right"] [role="tab"]:nth-child(2)'));
    const poi = must<HTMLButtonElement>(root, "[data-poi-id]");
    await click(poi);
    expect(root.getAttribute("data-selected-poi-id")).toBe(poi.dataset.poiId);
    expect(must(root, '[data-drawer="right"] [role="tab"][aria-selected="true"]').textContent).toContain("POI detail");
    expect(select).not.toHaveBeenCalled();
  });

  it("in the one-drawer layout selecting a POI opens the right drawer and closes the left", async () => {
    const { root } = await workspace(1024);
    await click(must(root, '[data-slot="drawer-toggle"][data-for="left"]'));
    await click(must<HTMLButtonElement>(root, "[data-poi-id]"));
    expect(must(root, '[data-drawer="right"]').hasAttribute("hidden")).toBe(false);
    expect(must(root, '[data-drawer="left"]').hasAttribute("hidden")).toBe(true);
  });

  it("the repaint hook for the harness exists only with debug=1", async () => {
    const w = window as unknown as { __onNextPostrender?: unknown };
    delete w.__onNextPostrender;
    await workspace(1280, { debug: false });
    expect(w.__onNextPostrender).toBeUndefined();
    await open.pop()!.unmount();
    await workspace(1280, { debug: true });
    expect(typeof w.__onNextPostrender).toBe("function");
    await open.pop()!.unmount();
    expect(w.__onNextPostrender).toBeUndefined();
  });
});
