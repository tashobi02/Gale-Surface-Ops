/** T09.08/FD-125: pointer and keyboard share snapped manual-leg entry. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MapHandle, WorkerClient } from "../../src/ui/context";
import { createPlanStore, DEFAULT_SCENARIO } from "../../src/state/planStore";
import { initDrawLegs, legPairs, manualLegPreview, needsDrawLegs } from "../../src/ui/map/drawLegs";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import { installDom, removeDom } from "./domHarness";

beforeEach(installDom);
afterEach(removeDom);
function fixture() {
  const host = document.createElement("div"); host.tabIndex = 0; document.body.append(host);
  let center: [number, number] = [10, 20];
  const callbacks = new Map<string, (e: { coordinate: number[] }) => void>();
  const map = { on: (name: string, fn: (e: { coordinate: number[] }) => void) => callbacks.set(name, fn), un: vi.fn(), addInteraction: vi.fn(), removeInteraction: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn() };
  const handle = { getTargetElement: () => host, getMap: () => map, getCenter: () => center, setCenter: (c: [number, number]) => { center = c; } } as unknown as MapHandle;
  let receive: (message: import("@marswalk/protocol").WorkerResponse) => void = () => {};
  const offMessage = vi.fn();
  const worker = { computePlan: vi.fn(), retry: vi.fn(), isCrashed: () => false, postMessage: vi.fn(), onMessage: vi.fn((fn: (message: import("@marswalk/protocol").WorkerResponse) => void) => { receive = fn; return offMessage; }) } as unknown as WorkerClient;
  const store = createPlanStore({ scenario: { ...DEFAULT_SCENARIO, loop: false }, waypoints: [{ id: "start", role: "start", x_m: 0, y_m: 0 }, { id: "stop", role: "stop", x_m: 100, y_m: 200 }] }, { workerClient: worker, siteId: "mock_site", dataVersion: "fixture" });
  return { host, map, handle, worker, store, reply: (message: import("@marswalk/protocol").WorkerResponse) => receive(message), offMessage };
}
it("keyboard places leg points", () => {
  const { host, handle, store, worker } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0); host.focus();
  host.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  handle.setCenter([30, 40]); host.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  controller.finish();
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "VALIDATE_MANUAL_LEG", from: "start", to: "stop", vertices: [[0, 0], [10, 20], [30, 40], [100, 200]], plan_revision: store.get().plan_revision }));
  controller.destroy();
});
it("only the flag or a nonempty all-NO_ROUTE result enables the fallback", () => {
  expect(needsDrawLegs("", null)).toBe(false);
  expect(needsDrawLegs("?draw_legs=1", null)).toBe(true);
  expect(needsDrawLegs("", { legs: [] } as never)).toBe(false);
  expect(needsDrawLegs("", { legs: [{ status: "NO_ROUTE" }] } as never)).toBe(true);
  expect(needsDrawLegs("", { legs: [{ status: "NO_ROUTE" }, { status: "OK" }] } as never)).toBe(false);
});
it("Escape and a changed revision discard vertices and stale replies", () => {
  const { host, handle, store, worker } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0); host.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  controller.finish(); expect(worker.postMessage).not.toHaveBeenCalled();
  controller.start(0); store.moveWaypoint("stop", 200, 300); controller.finish();
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(controller.get().active).toBe(false);
  controller.destroy();
});
it("ignores Enter in controls, bounds missing replies, and removes listeners", async () => {
  vi.useFakeTimers();
  try {
    const { host, handle, store, worker, map } = fixture();
    const controller = initDrawLegs(handle, { planStore: store, workerClient: worker, timeoutMs: 10 });
    const input = document.createElement("input"); host.append(input);
    controller.start(0); input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    controller.finish();
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ vertices: [[0, 0], [100, 200]] }));
    await vi.advanceTimersByTimeAsync(10);
    expect(controller.get().error).toMatch(/unavailable/i);
    controller.destroy(); expect(map.removeInteraction).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("pointer finish snaps both endpoints and the loop return is available", () => {
  const { map, handle, store, worker } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0);
  const drawing = map.addInteraction.mock.calls[0][0] as import("ol/interaction/Draw.js").default;
  drawing.dispatchEvent({ type: "drawend", feature: new Feature(new LineString([[999, 999], [30, 40], [888, 888]])) } as never);
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ vertices: [[0, 0], [30, 40], [100, 200]] }));
  controller.destroy();
});
it("accepts only a matching manual reply and drops replies after a route edit", () => {
  const { handle, store, worker, reply, offMessage } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0); controller.finish();
  const request = vi.mocked(worker.postMessage).mock.calls[0][0] as import("@marswalk/protocol").ValidateManualLegRequest;
  const result = { type: "MANUAL_LEG_RESULT" as const, request_id: request.request_id, plan_revision: request.plan_revision, leg: { status: "NO_ROUTE" as const, from: "start", to: "stop", reason: "DISCONNECTED_BY_NODATA" as const }, warnings: [] };
  reply({ ...result, request_id: "unrelated" }); expect(controller.get().response).toBeNull();
  reply(result); expect(controller.get().response).toEqual(result);
  store.moveWaypoint("stop", 400, 400); reply(result);
  expect(controller.get().response).toBeNull();
  controller.destroy(); expect(offMessage).toHaveBeenCalledOnce();
});

it("Finish leg completes the pointer sketch instead of losing its vertices", () => {
  const { map, handle, store, worker } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0);
  const drawing = map.addInteraction.mock.calls[0][0] as import("ol/interaction/Draw.js").default;
  const feature = new Feature(new LineString([[999, 999], [30, 40], [888, 888]]));
  drawing.dispatchEvent({ type: "drawstart", feature } as never);
  vi.spyOn(drawing, "finishDrawing").mockImplementation(() => { drawing.dispatchEvent({ type: "drawend", feature } as never); return feature; });
  controller.finish();
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ vertices: [[0, 0], [30, 40], [100, 200]] }));
  controller.destroy();
});

it("a worker ERROR (N-25 not implemented) is shown as unavailable with the worker's words and no leg", () => {
  const { handle, store, worker, reply } = fixture();
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0); controller.finish();
  const request = vi.mocked(worker.postMessage).mock.calls[0][0] as import("@marswalk/protocol").ValidateManualLegRequest;
  reply({ type: "ERROR", request_id: request.request_id, code: "INTERNAL", message: "Unknown worker request type: VALIDATE_MANUAL_LEG" });
  expect(controller.get()).toMatchObject({ pending: false, response: null, error: expect.stringContaining("Unknown worker request type") });
  expect(controller.get().error).toMatch(/unavailable/i);
  controller.destroy();
});

it("a thrown postMessage leaves an unavailable error and no pending request", () => {
  const { handle, store, worker } = fixture();
  vi.mocked(worker.postMessage).mockImplementation(() => { throw new Error("worker crashed"); });
  const controller = initDrawLegs(handle, { planStore: store, workerClient: worker });
  controller.start(0); controller.finish();
  expect(controller.get()).toMatchObject({ pending: false, error: expect.stringContaining("worker crashed") });
  controller.destroy();
});

it("the loop return is a leg pair, and a manual leg preview carries no totals, timeline, radiation or conditions", () => {
  const { store } = fixture();
  expect(legPairs(store).map(([a, b]) => `${a.id}>${b.id}`)).toEqual(["start>stop"]);
  store.setScenario({ loop: true });
  expect(legPairs(store).map(([a, b]) => `${a.id}>${b.id}`)).toEqual(["start>stop", "stop>start"]);
  const leg = { status: "NO_ROUTE" as const, from: "start", to: "stop", reason: "DISCONNECTED_BY_NODATA" as const };
  const base = { status: "OK", legs: [], warnings: [{ severity: "caution" }], totals: { distance_m: 1 }, stops_timeline: [{}], radiation: {}, conditions: {} } as never;
  const preview = manualLegPreview(base, { type: "MANUAL_LEG_RESULT", request_id: "r", plan_revision: 1, leg, warnings: [] });
  expect(preview).toMatchObject({ status: "PARTIAL", legs: [leg], warnings: [], totals: null, stops_timeline: [] });
  expect(preview?.radiation).toBeUndefined(); expect(preview?.conditions).toBeUndefined();
  expect(manualLegPreview(null, null)).toBeNull();
});
