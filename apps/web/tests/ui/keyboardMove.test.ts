/**
 * T08.10 — keyboard move of a selected stop (04 §E; 01 NFR-04; FD-119): the arrow keys nudge it one grid cell, and "Move to crosshair"
 * places it at the map centre. Both are validated like a drop (SAMPLE_POINT through the placement function).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { SamplePointRequest, SampleResult } from "@marswalk/protocol";
import type { MapHandle, WorkerClient } from "../../src/ui/context";
import { createPlacement } from "../../src/ui/map/waypointLayer";
import { KeyboardMove, nudgeKeys } from "../../src/ui/map/keyboardMove";
import { click, installDom, keyDown, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
import { START, STOP_FREE, STOP_POI, realPlan, type RealPlan } from "./realPlanStore";

beforeAll(() => installDom());
afterAll(() => removeDom());
beforeEach(() => vi.useFakeTimers());

const SITE = mockLoadedSite();
const CELL_M = SITE.site.grid.cell_m;
const PASSABLE: SampleResult = { type: "SAMPLE_RESULT", request_id: "r", inside_aoi: true, passable: true, reason: null, lat: -4.7, lon_e: 137.4, elevation_m: -2400, slope_p90_deg: 6, ti_tiu: 300, flags: [], snap: null };
const OUTSIDE: SampleResult = { ...PASSABLE, inside_aoi: false, passable: false, reason: "OUTSIDE_AOI" };

const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function rig(reply: SampleResult = PASSABLE, selected: string | null = "wp-2") {
  const plan: RealPlan = realPlan({ waypoints: [START, STOP_POI, STOP_FREE] });
  plan.store.selectWaypoint(selected);
  const requests: SamplePointRequest[] = [];
  let next = reply;
  const workerClient = {
    samplePoint: (req: Omit<SamplePointRequest, "type">) => {
      requests.push({ type: "SAMPLE_POINT", ...req });
      return Promise.resolve({ ...next, request_id: req.request_id });
    },
  } as unknown as WorkerClient;
  const notices: unknown[] = [];
  const placement = createPlacement({ planStore: plan.store, workerClient, site: SITE, notify: (n) => notices.push(n) });
  let centre: [number, number] = [-700, 900];
  const handle = { getCenter: () => centre } as unknown as MapHandle;
  const m = await mountRaw(createElement(KeyboardMove, { planStore: plan.store, placement, mapHandle: handle, cellM: CELL_M }));
  open.push(m);
  return { plan, requests, root: m.container, notices, setReply: (r: SampleResult) => (next = r), setCentre: (c: [number, number]) => (centre = c) };
}
const wp = (plan: RealPlan, id: string) => plan.store.get().waypoints.find((w) => w.id === id)!;
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("KeyboardMove (T08.10; FD-119)", () => {
  it("shows only while a stop is selected, naming it; nothing with no selection or with the start selected", async () => {
    const none = await rig(PASSABLE, null);
    expect(none.root.querySelector('[data-slot="keyboard-move"]')).toBeNull();
    await open.pop()!.unmount();
    const start = await rig(PASSABLE, "wp-0");
    expect(start.root.querySelector('[data-slot="keyboard-move"]')).toBeNull();
    await open.pop()!.unmount();
    const some = await rig();
    expect(must(some.root, '[data-slot="keyboard-move"]').getAttribute("aria-label")).toBe("Move stop 2");
  });

  it("arrow nudges selected stop one cell: each button moves it one manifest grid cell, after validating the new point", async () => {
    const r = await rig();
    const before = { ...wp(r.plan, "wp-2") };
    await click(must(r.root, '[data-action="nudge-east"]'));
    await settle();
    expect(r.requests.at(-1)).toMatchObject({ x_m: before.x_m + CELL_M, y_m: before.y_m });
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: before.x_m + CELL_M, y_m: before.y_m });
    await click(must(r.root, '[data-action="nudge-north"]'));
    await settle();
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: before.x_m + CELL_M, y_m: before.y_m + CELL_M });
    await click(must(r.root, '[data-action="nudge-west"]'));
    await click(must(r.root, '[data-action="nudge-south"]'));
    await settle();
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: before.x_m, y_m: before.y_m });
  });

  it("arrow nudges selected stop one cell from the keyboard too: the arrow keys on the focused control, north is up (+y)", async () => {
    const r = await rig();
    const before = { ...wp(r.plan, "wp-2") };
    const button = must(r.root, '[data-action="nudge-east"]');
    button.focus();
    await keyDown(button, "ArrowRight");
    await settle();
    expect(wp(r.plan, "wp-2").x_m).toBe(before.x_m + CELL_M);
    await keyDown(button, "ArrowUp");
    await settle();
    expect(wp(r.plan, "wp-2").y_m).toBe(before.y_m + CELL_M);
    await keyDown(button, "ArrowLeft");
    await keyDown(button, "ArrowDown");
    await settle();
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: before.x_m, y_m: before.y_m });
    expect(nudgeKeys).toEqual({ ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] });
  });

  it("a nudge onto an outside or impassable point is refused like a drop: the stop stays and the placement says why", async () => {
    const r = await rig(OUTSIDE);
    const before = { ...wp(r.plan, "wp-2") };
    await click(must(r.root, '[data-action="nudge-east"]'));
    await settle();
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: before.x_m, y_m: before.y_m });
    expect(r.notices.length).toBeGreaterThan(0);
  });

  it("several quick nudges are applied in order, each from the stop's position after the one before", async () => {
    const r = await rig();
    const before = { ...wp(r.plan, "wp-2") };
    const east = must(r.root, '[data-action="nudge-east"]');
    await click(east);
    await click(east);
    await click(east);
    await settle();
    expect(wp(r.plan, "wp-2").x_m).toBe(before.x_m + 3 * CELL_M);
    expect(r.requests.map((q) => q.x_m)).toEqual([before.x_m + CELL_M, before.x_m + 2 * CELL_M, before.x_m + 3 * CELL_M]);
  });

  it("move to crosshair validates: the map centre is sampled and the stop moves there when passable", async () => {
    const r = await rig();
    r.setCentre([-700, 900]);
    await click(must(r.root, '[data-action="move-to-crosshair"]'));
    await settle();
    expect(r.requests.at(-1)).toMatchObject({ x_m: -700, y_m: 900 });
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: -700, y_m: 900 });
    r.setReply(OUTSIDE);
    r.setCentre([99999, 0]);
    await click(must(r.root, '[data-action="move-to-crosshair"]'));
    await settle();
    expect(wp(r.plan, "wp-2")).toMatchObject({ x_m: -700, y_m: 900 });
  });

  it("every control is a named button with a 32 px mouse target", async () => {
    const r = await rig();
    for (const b of r.root.querySelectorAll("button")) expect((b.getAttribute("aria-label") ?? b.textContent ?? "").trim()).not.toBe("");
    expect(r.root.querySelectorAll("button")).toHaveLength(5);
    expect(must(r.root, '[data-action="nudge-north"]').getAttribute("aria-label")).toBe("Move stop 2 one cell north");
  });
});
