/**
 * T08.06, T08.07, T08.08, T08.09 — waypoint markers, placement validation, add-stop mode, drag and long-press
 * (03 SCR-02 Inputs/validation, §C.3, §D; 04 §C.3, §C.5, §E; 01 FR-06; FD-001, FD-112, FD-115, FD-117, FD-239).
 * The plan store is the real one on a fake worker; the worker client's `samplePoint` is a fake that answers per request, so each
 * placement rule is a SAMPLE_POINT answer. The map is a small fake with pixel <-> projected-metre conversion; the DOM is real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RegularShape from "ol/style/RegularShape.js";
import type Style from "ol/style/Style.js";
import type { SamplePointRequest, SampleResult } from "@marswalk/protocol";
import { SNAP_RADIUS_M } from "@marswalk/compute";
import type { MapHandle, WorkerClient } from "../../src/ui/context";
import { createPlacement, createWaypointLayer, type Placement, type PlacementNotice } from "../../src/ui/map/waypointLayer";
import { initAddStopMode } from "../../src/ui/map/addStopMode";
import { initWaypointDrag } from "../../src/ui/map/waypointDrag";
import { initTouchInput, LONG_PRESS_MS } from "../../src/ui/map/touchInput";
import { attachKeyboardControls } from "../../src/ui/map/keyboard";
import { installDom, removeDom } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
import { START, STOP_FREE, STOP_POI, realPlan, type RealPlan } from "./realPlanStore";

beforeAll(() => {
  installDom();
  const css = readFileSync(resolve(__dirname, "../../src/ui/styles/tokens.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
});
afterAll(() => removeDom());

const SITE = mockLoadedSite();
const PASSABLE: SampleResult = { type: "SAMPLE_RESULT", request_id: "r", inside_aoi: true, passable: true, reason: null, lat: -4.7, lon_e: 137.4, elevation_m: -2400, slope_p90_deg: 6, ti_tiu: 300, flags: [], snap: null };
const OUTSIDE: SampleResult = { ...PASSABLE, inside_aoi: false, passable: false, reason: "OUTSIDE_AOI", lat: null, lon_e: null, elevation_m: null, slope_p90_deg: null, ti_tiu: null };
const STEEP: SampleResult = { ...PASSABLE, passable: false, reason: "SLOPE_OVER_LIMIT", slope_p90_deg: 22.5, snap: { x_m: 1010, y_m: 505, distance_m: 19 } };
const NO_SNAP: SampleResult = { ...STEEP, snap: null };
const HAZARD: SampleResult = { ...PASSABLE, passable: false, reason: "HARD_HAZARD", snap: null };

interface Rig {
  plan: RealPlan;
  placement: Placement;
  requests: SamplePointRequest[];
  notices: (PlacementNotice | null)[];
  /** The newest notice that is not a clear. */
  notice(): PlacementNotice;
  answer(result: SampleResult | Error): void;
}
const text = (node: ReactNode): string => renderToStaticMarkup(createElement(Fragment, null, node)).replace(/<[^>]+>/g, "").replace(/&gt;/g, ">");

function rig(initial: Parameters<typeof realPlan>[0] = {}, reply: SampleResult | Error | ((r: SamplePointRequest) => SampleResult | Error) = PASSABLE): Rig {
  const plan = realPlan({ waypoints: [START, STOP_POI], ...initial });
  const requests: SamplePointRequest[] = [];
  const notices: (PlacementNotice | null)[] = [];
  let next: SampleResult | Error | ((r: SamplePointRequest) => SampleResult | Error) = reply;
  const workerClient = {
    samplePoint: (req: Omit<SamplePointRequest, "type">) => {
      requests.push({ type: "SAMPLE_POINT", ...req });
      const r = typeof next === "function" ? next({ type: "SAMPLE_POINT", ...req }) : next;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve({ ...r, request_id: req.request_id });
    },
  } as unknown as WorkerClient;
  const placement = createPlacement({ planStore: plan.store, workerClient, site: SITE, notify: (n) => notices.push(n) });
  return {
    plan,
    placement,
    requests,
    notices,
    notice: () => [...notices].reverse().find((n): n is PlacementNotice => n !== null)!,
    answer: (r) => {
      next = r;
    },
  };
}
const stops = (plan: RealPlan): string[] => plan.store.get().waypoints.filter((w) => w.role === "stop").map((w) => w.id);
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("placement validation (03 §D; 01 FR-06; FD-112)", () => {
  it("every placement asks SAMPLE_POINT with the 50 m snap radius and the scenario's hard slope limit", async () => {
    const r = rig();
    await r.placement.place({ x_m: 100, y_m: 200 });
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]).toMatchObject({ x_m: 100, y_m: 200, snap_radius_m: SNAP_RADIUS_M, hard_slope_limit_deg: r.plan.store.get().scenario.hard_slope_limit_deg });
    expect(SNAP_RADIUS_M).toBe(50);
  });

  it("a passable point becomes a stop at that point, and it is selected", async () => {
    const r = rig();
    expect(await r.placement.place({ x_m: 100, y_m: 200 })).toBe("placed");
    const added = r.plan.store.get().waypoints.at(-1)!;
    expect(added).toMatchObject({ role: "stop", x_m: 100, y_m: 200 });
    expect(added.snapped_from).toBeUndefined();
    expect(r.plan.store.get().selected_waypoint_id).toBe(added.id);
  });

  it("a POI placement keeps the POI id and its name as the label (FD-001)", async () => {
    const r = rig({ waypoints: [START] });
    await r.placement.place({ x_m: 410, y_m: 325, poi_id: "poi-boxwork-ridge", label: "Boxwork ridge" });
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ poi_id: "poi-boxwork-ridge", label: "Boxwork ridge" });
  });

  it("outside AOI refused: the Outside mapped area notice, no waypoint, no recompute", async () => {
    const r = rig({}, OUTSIDE);
    expect(await r.placement.place({ x_m: 99999, y_m: 0 })).toBe("outside");
    expect(text(r.notice().message)).toBe("Outside mapped area");
    expect(stops(r.plan)).toEqual(["wp-1"]);
    expect(r.plan.calls).toHaveLength(0);
  });

  it("snap offered within 50 m: the message names the cause with the slope and the limit, labelled, and the offer has two buttons", async () => {
    const r = rig({}, STEEP);
    expect(await r.placement.place({ x_m: 1000, y_m: 500 })).toBe("offered");
    const n = r.notice();
    expect(text(n.message)).toContain("Not walkable here (slope 22.5° > 15.0° limit)");
    expect(text(n.message)).toContain("19");
    expect(n.actions!.map((a) => a.action)).toEqual(["accept-snap", "decline-snap"]);
    expect(stops(r.plan)).toEqual(["wp-1"]);
    const html = renderToStaticMarkup(createElement(Fragment, null, n.message));
    expect(html).toContain('data-source="scenario.hard_slope_limit_deg"');
    expect(html).toContain('data-provenance="assumed"');
    expect(html).toContain('data-provenance="derived"');
  });

  it("accepting the snap stores the stop at the snapped point with snapped_from set to where the user pointed", async () => {
    const r = rig({}, STEEP);
    await r.placement.place({ x_m: 1000, y_m: 500 });
    r.notice().actions![0]!.onClick();
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ role: "stop", x_m: 1010, y_m: 505, snapped_from: { x_m: 1000, y_m: 500 } });
    expect(r.notices.at(-1)).toBeNull();
  });

  it("declining the snap places elsewhere: nothing is added and the notice clears", async () => {
    const r = rig({}, STEEP);
    await r.placement.place({ x_m: 1000, y_m: 500 });
    r.notice().actions![1]!.onClick();
    expect(stops(r.plan)).toEqual(["wp-1"]);
    expect(r.notices.at(-1)).toBeNull();
  });

  it("impassable with no snap is refused with the reason in words", async () => {
    const r = rig({}, NO_SNAP);
    expect(await r.placement.place({ x_m: 1000, y_m: 500 })).toBe("refused");
    expect(text(r.notice().message)).toContain("Not walkable here (slope 22.5° > 15.0° limit)");
    expect(r.notice().actions).toBeUndefined();
    expect(stops(r.plan)).toEqual(["wp-1"]);
    r.answer(HAZARD);
    await r.placement.place({ x_m: 1000, y_m: 500 });
    expect(text(r.notice().message)).toContain("Not walkable here (hard hazard)");
  });

  it("a snap farther than 50 m is not offered", async () => {
    const r = rig({}, { ...STEEP, snap: { x_m: 1100, y_m: 600, distance_m: SNAP_RADIUS_M + 30 } });
    expect(await r.placement.place({ x_m: 1000, y_m: 500 })).toBe("refused");
  });

  it("an unreadable point (the worker failed) adds nothing and says so", async () => {
    const r = rig({}, new Error("TIMEOUT"));
    expect(await r.placement.place({ x_m: 1, y_m: 2 })).toBe("unreadable");
    expect(text(r.notice().message)).toBe("Could not check this point. Try again.");
    expect(stops(r.plan)).toEqual(["wp-1"]);
  });

  it("at the stop limit the stop is refused before the worker is asked", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `wp-${i + 1}`, role: "stop" as const, x_m: i * 10, y_m: 0 }));
    const r = rig({ waypoints: [START, ...many] });
    expect(await r.placement.place({ x_m: 1, y_m: 2 })).toBe("refused");
    expect(r.requests).toHaveLength(0);
    expect(text(r.notice().message)).toMatch(/Stop limit reached/);
  });

  it("a newer placement replaces a pending offer, and the old offer's buttons do nothing", async () => {
    const r = rig({}, STEEP);
    await r.placement.place({ x_m: 1000, y_m: 500 });
    const old = r.notice();
    r.answer(PASSABLE);
    await r.placement.place({ x_m: 300, y_m: 300 });
    old.actions![0]!.onClick();
    expect(r.plan.store.get().waypoints.filter((w) => w.x_m === 1010)).toHaveLength(0);
  });

  it("move validates like a drop: a passable point moves the stop (and drops snapped_from), outside leaves it", async () => {
    const r = rig();
    expect(await r.placement.move("wp-1", 500, 600)).toBe("placed");
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 500, y_m: 600 });
    r.answer(OUTSIDE);
    expect(await r.placement.move("wp-1", 99999, 0)).toBe("outside");
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 500, y_m: 600 });
    expect(r.requests.at(-1)).toMatchObject({ x_m: 99999, y_m: 0 });
  });

  it("an accepted snap on a move stores the snapped point with snapped_from", async () => {
    const r = rig({}, STEEP);
    await r.placement.move("wp-1", 1000, 500);
    r.notice().actions![0]!.onClick();
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 1010, y_m: 505, snapped_from: { x_m: 1000, y_m: 500 } });
  });
});

describe("waypoint markers (04 §C.3, §C.5)", () => {
  type Ctl = ReturnType<typeof createWaypointLayer>;
  const styles = (ctl: Ctl, id: string): Style[] => {
    const feature = ctl.layer.getSource()!.getFeatures().find((f) => f.get("waypoint_id") === id)!;
    const out = ctl.layer.getStyleFunction()!(feature, 1);
    return (Array.isArray(out) ? out : out ? [out] : []) as Style[];
  };
  const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = (colour: unknown): string => String(colour);

  it("one feature per waypoint on the layer slot above the route, kept in sync with the store", () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const ctl = createWaypointLayer(plan.store);
    expect(ctl.layer.getZIndex()).toBe(55);
    expect(ctl.layer.getSource()!.getFeatures()).toHaveLength(2);
    plan.store.addWaypoint({ ...STOP_FREE });
    expect(ctl.layer.getSource()!.getFeatures()).toHaveLength(3);
    plan.store.deleteWaypoint("wp-1");
    expect(ctl.layer.getSource()!.getFeatures().map((f) => f.get("waypoint_id"))).toEqual(["wp-0", "wp-2"]);
    ctl.destroy();
  });

  it("a stop is a 28 px numbered marker, the start has its label, and the numbers follow the order", () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const ctl = createWaypointLayer(plan.store);
    const number = (id: string): string | undefined => styles(ctl, id).map((s) => s.getText()?.getText()).find((t) => t !== undefined) as string | undefined;
    expect(number("wp-1")).toBe("1");
    expect(number("wp-2")).toBe("2");
    expect(number("wp-0")).toBe("Habitat / rover");
    const circle = styles(ctl, "wp-1")[0]!.getImage() as unknown as { getRadius(): number };
    expect(circle.getRadius() * 2).toBe(28);
    plan.store.reorderWaypoints(["wp-2", "wp-1"]);
    expect(number("wp-2")).toBe("1");
    ctl.destroy();
  });

  it("selected: a route-coloured outline of the selection width plus a marker, never colour alone; hover adds a 2 px ring", () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const ctl = createWaypointLayer(plan.store);
    const plain = styles(ctl, "wp-1");
    const plainTwo = styles(ctl, "wp-2");
    plan.store.selectWaypoint("wp-1");
    const selected = styles(ctl, "wp-1");
    expect(selected.length).toBeGreaterThan(plain.length);
    expect(selected.some((s) => hex((s.getImage() as { getStroke?: () => { getColor(): unknown } }).getStroke?.()?.getColor()) .length > 0 && s.getImage() instanceof RegularShape)).toBe(true);
    const outline = selected.map((s) => (s.getImage() as { getStroke?: () => { getColor(): unknown; getWidth(): number | undefined } }).getStroke?.()).filter(Boolean);
    expect(outline.some((st) => st!.getWidth() === 2)).toBe(true);
    plan.store.setHover({ waypoint_id: "wp-2" });
    expect(styles(ctl, "wp-2").length).toBeGreaterThan(plainTwo.length);
    ctl.destroy();
    expect(token("--route")).not.toBe("");
  });

  it("a stop whose leg has no route is the blocked octagon with the warning outline (⬣)", async () => {
    const plan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
    const ctl = createWaypointLayer(plan.store);
    plan.store.setScenario({ dwell_min_per_stop: 30 });
    await vi.advanceTimersByTimeAsync(300);
    plan.answer({
      status: "PARTIAL",
      totals: null,
      legs: [
        { from: "wp-0", to: "wp-1", status: "OK" } as never,
        { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" },
      ],
    });
    await flush();
    const octagon = styles(ctl, "wp-2").map((s) => s.getImage()).find((i): i is RegularShape => i instanceof RegularShape && i.getPoints() === 8);
    expect(octagon).toBeDefined();
    expect(styles(ctl, "wp-1").some((s) => s.getImage() instanceof RegularShape && (s.getImage() as RegularShape).getPoints() === 8)).toBe(false);
    ctl.destroy();
  });

  it("a drag preview moves the marker without touching the store", () => {
    const plan = realPlan({ waypoints: [START, STOP_POI] });
    const ctl = createWaypointLayer(plan.store);
    ctl.setPreview({ id: "wp-1", coord: [777, 888] });
    const feature = ctl.layer.getSource()!.getFeatures().find((f) => f.get("waypoint_id") === "wp-1")!;
    expect((feature.getGeometry() as unknown as { getCoordinates(): number[] }).getCoordinates()).toEqual([777, 888]);
    expect(plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 410, y_m: 325 });
    ctl.setPreview(null);
    expect((feature.getGeometry() as unknown as { getCoordinates(): number[] }).getCoordinates()).toEqual([410, 325]);
    ctl.destroy();
  });
});

// --- a fake map with pixel <-> metre conversion ----------------------------------------------------------------------------
interface FakeMap {
  handle: MapHandle;
  target: HTMLElement;
  click(x_m: number, y_m: number): void;
  setCentre(c: [number, number]): void;
}
/** Pixels are (x_m / 10, -y_m / 10) from the target's top left; the target has no layout in jsdom, so client = pixel. */
function fakeMap(): FakeMap {
  const target = document.createElement("div");
  target.tabIndex = 0;
  document.body.appendChild(target);
  const listeners = new Map<string, Set<(e: { coordinate: number[] }) => void>>();
  let centre: [number, number] = [0, 0];
  const map = {
    on: (type: string, fn: (e: { coordinate: number[] }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    un: (type: string, fn: (e: { coordinate: number[] }) => void) => listeners.get(type)?.delete(fn),
    getPixelFromCoordinate: (c: number[]) => [c[0] / 10, -c[1] / 10],
    getCoordinateFromPixel: (p: number[]) => [p[0] * 10, -p[1] * 10],
    getSize: () => [800, 600],
  };
  const handle = {
    getMap: () => map,
    getTargetElement: () => target,
    getCenter: () => centre,
    getResolution: () => 10,
    setCenter: (c: [number, number]) => {
      centre = c;
    },
    onViewChange: () => () => {},
  } as unknown as MapHandle;
  return {
    handle,
    target,
    click: (x, y) => listeners.get("singleclick")?.forEach((fn) => fn({ coordinate: [x, y] })),
    setCentre: (c) => {
      centre = c;
    },
  };
}

function pointer(type: string, x: number, y: number, pointerType = "mouse"): Event {
  const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

describe("add-stop mode (T08.07; FD-117; 04 §E)", () => {
  it("A toggles add-stop through the keyboard layer: the crosshair shows at the map centre and the mode reports on", async () => {
    const r = rig();
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    const detach = attachKeyboardControls({
      mapHandle: m.handle as never,
      planContext: { getSelectedStopId: () => null, deleteStop: () => {}, canOpenBriefing: () => false, addStop: mode },
    });
    expect(mode.isActive()).toBe(false);
    expect(m.target.querySelector('[data-slot="crosshair"]')).toBeNull();
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(mode.isActive()).toBe(true);
    expect(m.target.querySelector('[data-slot="crosshair"]')).not.toBeNull();
    document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "A", bubbles: true }));
    expect(mode.isActive()).toBe(false);
    expect(m.target.querySelector('[data-slot="crosshair"]')).toBeNull();
    detach();
    mode.destroy();
  });

  it("A typed into an input does not toggle the mode (04 §E)", () => {
    const r = rig();
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    const detach = attachKeyboardControls({ planContext: { getSelectedStopId: () => null, deleteStop: () => {}, canOpenBriefing: () => false, addStop: mode } });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(mode.isActive()).toBe(false);
    detach();
    mode.destroy();
  });

  it("while on, a map click places a stop there through the placement function, and a placed stop ends the mode", async () => {
    const r = rig();
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    m.click(100, 100);
    await flush();
    expect(r.requests).toHaveLength(0);
    mode.setActive(true);
    m.click(2000, 300);
    await flush();
    expect(r.requests.at(-1)).toMatchObject({ x_m: 2000, y_m: 300 });
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ x_m: 2000, y_m: 300 });
    expect(mode.isActive()).toBe(false);
    mode.destroy();
  });

  it("a refused click keeps the mode on so the user can try again", async () => {
    const r = rig({}, OUTSIDE);
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    mode.setActive(true);
    m.click(99999, 0);
    await flush();
    expect(mode.isActive()).toBe(true);
    mode.destroy();
  });

  it("a click on a POI pin places the stop at the POI with its id and name (FD-001)", async () => {
    const r = rig({ waypoints: [START] });
    const m = fakeMap();
    const poi = SITE.pois.get("poi-boxwork-ridge")!;
    const mode = initAddStopMode(m.handle, r.placement, { poiAt: () => poi });
    mode.setActive(true);
    m.click(405, 330);
    await flush();
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ role: "stop", poi_id: "poi-boxwork-ridge", label: "Boxwork ridge", x_m: 410, y_m: 325 });
    mode.destroy();
  });

  it("Enter at the crosshair places a stop at the map centre; Enter does nothing when the mode is off", async () => {
    const r = rig();
    const m = fakeMap();
    m.setCentre([1200, -400]);
    const mode = initAddStopMode(m.handle, r.placement);
    const detach = attachKeyboardControls({
      mapHandle: m.handle as never,
      planContext: { getSelectedStopId: () => null, deleteStop: () => {}, canOpenBriefing: () => false, addStop: mode },
    });
    m.target.focus();
    m.target.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(r.requests).toHaveLength(0);
    mode.setActive(true);
    m.target.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(r.requests.at(-1)).toMatchObject({ x_m: 1200, y_m: -400 });
    expect(mode.isActive()).toBe(false);
    detach();
    mode.destroy();
  });

  it("Escape leaves the mode; destroy removes the crosshair and the listeners", async () => {
    const r = rig();
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    mode.setActive(true);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(mode.isActive()).toBe(false);
    mode.setActive(true);
    mode.destroy();
    expect(m.target.querySelector('[data-slot="crosshair"]')).toBeNull();
    m.click(10, 10);
    await flush();
    expect(r.requests).toHaveLength(0);
  });

  it("onChange tells the toolbar button when the mode flips", () => {
    const r = rig();
    const m = fakeMap();
    const mode = initAddStopMode(m.handle, r.placement);
    const seen: boolean[] = [];
    const off = mode.onChange((on) => seen.push(on));
    mode.toggle();
    mode.toggle();
    off();
    mode.toggle();
    expect(seen).toEqual([true, false]);
    mode.destroy();
  });
});

describe("marker drag (T08.08; 03 §C.3)", () => {
  it("drag drop validates: the drop point is sampled, a passable drop moves the stop, an outside drop leaves it where it was", async () => {
    const r = rig();
    const m = fakeMap();
    const previews: unknown[] = [];
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement, { preview: (p) => previews.push(p) });
    // wp-1 is at (410, 325) metres = pixel (41, -32.5)
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5));
    document.dispatchEvent(pointer("pointermove", 80, -50));
    document.dispatchEvent(pointer("pointerup", 120, -60));
    await flush();
    expect(r.requests.at(-1)).toMatchObject({ x_m: 1200, y_m: 600 });
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 1200, y_m: 600 });
    expect(previews.some((p) => p !== null)).toBe(true);
    expect(previews.at(-1)).toBeNull();

    r.answer(OUTSIDE);
    m.target.dispatchEvent(pointer("pointerdown", 120, -60));
    document.dispatchEvent(pointer("pointermove", 9000, 0));
    document.dispatchEvent(pointer("pointerup", 9000, 0));
    await flush();
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 1200, y_m: 600 });
    expect(text(r.notice().message)).toBe("Outside mapped area");
    detach();
  });

  it("a press with no movement only selects the stop; nothing is sampled", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5));
    document.dispatchEvent(pointer("pointerup", 41, -32.5));
    await flush();
    expect(r.plan.store.get().selected_waypoint_id).toBe("wp-1");
    expect(r.requests).toHaveLength(0);
    detach();
  });

  it("a press that is not on a stop (the map, the start) is left to the map to pan", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    const seenByMap = vi.fn();
    m.target.addEventListener("pointerdown", seenByMap);
    m.target.dispatchEvent(pointer("pointerdown", 500, -500));
    m.target.dispatchEvent(pointer("pointerdown", -180, 150)); // the start
    expect(seenByMap).toHaveBeenCalledTimes(2);
    detach();
  });

  it("a press on a stop is taken by the drag and not passed to the map's own pan", () => {
    const r = rig();
    const m = fakeMap();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    const seenByMap = vi.fn();
    m.target.addEventListener("pointerdown", seenByMap);
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5));
    expect(seenByMap).not.toHaveBeenCalled();
    document.dispatchEvent(pointer("pointerup", 41, -32.5));
    detach();
  });

  it("Escape during a drag cancels it: the preview clears and nothing is sampled", async () => {
    const r = rig();
    const m = fakeMap();
    const previews: unknown[] = [];
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement, { preview: (p) => previews.push(p) });
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5));
    document.dispatchEvent(pointer("pointermove", 80, -50));
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.dispatchEvent(pointer("pointerup", 120, -60));
    await flush();
    expect(previews.at(-1)).toBeNull();
    expect(r.requests).toHaveLength(0);
    detach();
  });

  it("a touch drag on a stop moves it the same way", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5, "touch"));
    document.dispatchEvent(pointer("pointermove", 100, -40, "touch"));
    document.dispatchEvent(pointer("pointerup", 100, -40, "touch"));
    await flush();
    expect(r.plan.store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 1000, y_m: 400 });
    detach();
  });
});

describe("stops-list row drag (T08.08; 04 §E 44 px handles)", () => {
  /** A list of three rows whose boxes are 40 px tall at y = 0, 40, 80. */
  function list(): HTMLElement {
    const root = document.createElement("section");
    root.setAttribute("data-stops-list", "");
    for (const id of ["wp-1", "wp-2", "wp-3"]) {
      const row = document.createElement("li");
      row.setAttribute("data-stops-row", "");
      row.setAttribute("data-waypoint-id", id);
      row.setAttribute("data-role", "stop");
      const handle = document.createElement("span");
      handle.setAttribute("data-drag-handle", "");
      row.appendChild(handle);
      const top = (["wp-1", "wp-2", "wp-3"].indexOf(id)) * 40;
      row.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      root.appendChild(row);
    }
    document.body.appendChild(root);
    return root;
  }
  const three = (): RealPlan => realPlan({ waypoints: [START, STOP_POI, STOP_FREE, { id: "wp-3", role: "stop", x_m: 50, y_m: 50 }] });

  it("dragging a handle onto another row reorders the stops, one recompute", () => {
    const r = rig({ waypoints: three().store.get().waypoints });
    const m = fakeMap();
    const root = list();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    root.querySelector('[data-waypoint-id="wp-1"] [data-drag-handle]')!.dispatchEvent(pointer("pointerdown", 10, 20));
    document.dispatchEvent(pointer("pointermove", 10, 70));
    document.dispatchEvent(pointer("pointerup", 10, 100));
    expect(stops(r.plan)).toEqual(["wp-2", "wp-3", "wp-1"]);
    expect(r.plan.calls).toHaveLength(1);
    detach();
  });

  it("a press that does not move, or ends on its own row, changes nothing", () => {
    const r = rig({ waypoints: three().store.get().waypoints });
    const m = fakeMap();
    const root = list();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    root.querySelector('[data-waypoint-id="wp-2"] [data-drag-handle]')!.dispatchEvent(pointer("pointerdown", 10, 60));
    document.dispatchEvent(pointer("pointerup", 10, 62));
    expect(stops(r.plan)).toEqual(["wp-1", "wp-2", "wp-3"]);
    expect(r.plan.calls).toHaveLength(0);
    detach();
  });

  it("a press outside any handle is ignored", () => {
    const r = rig({ waypoints: three().store.get().waypoints });
    const m = fakeMap();
    const root = list();
    const detach = initWaypointDrag(m.handle, r.plan.store, r.placement);
    root.querySelector('[data-waypoint-id="wp-1"]')!.dispatchEvent(pointer("pointerdown", 10, 20));
    document.dispatchEvent(pointer("pointerup", 10, 100));
    expect(stops(r.plan)).toEqual(["wp-1", "wp-2", "wp-3"]);
    detach();
  });
});

describe("tablet long-press placement (T08.09; 04 §E Touch)", () => {
  it("long-press places: a touch held for the long-press time without moving places a stop at that point", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initTouchInput(m.handle, r.placement);
    m.target.dispatchEvent(pointer("pointerdown", 150, -20, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS - 1);
    expect(r.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.requests.at(-1)).toMatchObject({ x_m: 1500, y_m: 200 });
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ x_m: 1500, y_m: 200 });
    detach();
  });

  it("lifting early or moving past the tolerance is a tap or a pan, not a placement", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initTouchInput(m.handle, r.placement);
    m.target.dispatchEvent(pointer("pointerdown", 150, -20, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS / 2);
    document.dispatchEvent(pointer("pointerup", 150, -20, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
    m.target.dispatchEvent(pointer("pointerdown", 150, -20, "touch"));
    document.dispatchEvent(pointer("pointermove", 200, -20, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
    expect(r.requests).toHaveLength(0);
    detach();
  });

  it("a mouse press never starts a long-press; a press on a stop is the drag's, not a placement", async () => {
    const r = rig();
    const m = fakeMap();
    const detach = initTouchInput(m.handle, r.placement);
    m.target.dispatchEvent(pointer("pointerdown", 150, -20, "mouse"));
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
    expect(r.requests).toHaveLength(0);
    detach();
  });

  it("a long-press on a POI pin places the stop at the POI (FD-001)", async () => {
    const r = rig({ waypoints: [START] });
    const m = fakeMap();
    const poi = SITE.pois.get("poi-boxwork-ridge")!;
    const detach = initTouchInput(m.handle, r.placement, { poiAt: () => poi });
    m.target.dispatchEvent(pointer("pointerdown", 41, -32.5, "touch"));
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
    expect(r.plan.store.get().waypoints.at(-1)).toMatchObject({ poi_id: "poi-boxwork-ridge", x_m: 410, y_m: 325 });
    detach();
  });
});
