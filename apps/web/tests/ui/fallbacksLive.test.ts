/** Package 34: real failures keep the live safety surface usable (FD-193). */
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { LINK_LOST_AFTER_MS, type Snapshot } from "@marswalk/protocol";
import { wsFixtures } from "../fixtures/ws";
import { act, createElement } from "react";
import { ClockControl } from "../../src/ui/ops/ClockControl";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { ReportRoute } from "../../src/ui/live/ReportRoute";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { loadSite } from "../../src/boot/loadSite";
import { recordingClient, rejected, storeFromBeat as createStore } from "./fixtureStore";
import { click, fire, flush, installDom, keyDown, mount, must, removeDom, type Mounted } from "./domHarness";

vi.mock("../../src/boot/loadSite", () => ({ loadSite: vi.fn(async () => { throw new Error("site unavailable"); }) }));
const mounted: Mounted[] = [];
const stores: ReturnType<typeof createStore>[] = [];
function storeFromBeat(...args: Parameters<typeof createStore>) { const store = createStore(...args); stores.push(store); return store; }
async function open(element: Parameters<typeof mount>[0]) { const view = await mount(element); mounted.push(view); await flush(); return view.container; }
beforeAll(installDom);
afterAll(removeDom);
afterEach(async () => { for (const view of mounted.splice(0)) await view.unmount(); for (const store of stores.splice(0)) store.close(); vi.restoreAllMocks(); vi.useRealTimers(); window.history.replaceState({}, "", "/"); });

it("site failure selects HUD-only navigation, retains ACK and abort, and logs the active path in debug", async () => {
  window.history.replaceState({}, "", "/?debug=1");
  const debug = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { client, sent } = recordingClient(storeFromBeat("radiation-alert"));
  const event = wsFixtures["radiation-alert"][0]!;
  if (event.type !== "EVENT") throw new Error("alert fixture required");
  const snapshot = { ...client.state()!, alerts: [{ ...event.event.data, raised_seq: event.seq, acked_seq: null, cleared_seq: null, acked_by: null }] } as Snapshot;
  const root = await open(createElement(EvaTablet, { crewId: "EV1", client, snapshot }));
  expect(loadSite).toHaveBeenCalled();
  expect(must(root, '[data-fallback="hud-only"]').textContent).toContain("Map unavailable");
  expect(root.querySelector('[data-slot="map-canvas"]')).toBeNull();
  expect(root.querySelector('[data-slot="mini-map-open"]')).toBeNull();
  expect(must(root, '[data-slot="haven"] .value').textContent).not.toBe("—");
  expect(must(root, '[aria-label*="Abort"]')).toBeTruthy();
  await click(must(root, '[aria-label="Acknowledge alert"]'));
  expect(sent.some(c => c.kind === "ACK_ALERT")).toBe(true);
  expect(debug).toHaveBeenCalledWith("live fallback", "hud-only");
});

it("keys-only flag replaces pointer controls and sends speed, pause, jump and start once", async () => {
  window.history.replaceState({}, "", "/?clock=keys");
  const onCommand = vi.fn();
  const root = await open(createElement(ClockControl, { onCommand, sessionState: "LOADED", speed: 1, isPaused: true }));
  expect(must(root, '[data-fallback="clock-keys"]').textContent).toContain("Space");
  expect(root.querySelector('button[aria-label="Set speed to 10x"]')).toBeNull();
  for (const key of ["2", " ", "n", "s"]) await keyDown(document.body, key);
  expect(onCommand.mock.calls.map(([c]) => c)).toEqual([
    { kind: "SET_CLOCK", args: { speed: 10 } }, { kind: "SET_CLOCK", args: { paused: false } },
    { kind: "JUMP_NEXT_EVENT", args: {} }, { kind: "START_EVA", args: {} },
  ]);
});

it("empty scenario options are unavailable and cannot load a stale active id", async () => {
  const onCommand = vi.fn();
  const root = await open(createElement(ClockControl, { onCommand, activeScenarioId: "storm-sol4190", availableScenarios: [] }));
  const select = must<HTMLSelectElement>(root, "select");
  expect(select.getAttribute("data-unavailable")).toBe("true");
  expect(select.textContent).toBe("—");
  expect(must<HTMLButtonElement>(root, '[aria-label="Load scenario"]').disabled).toBe(true);
});

const log = JSON.stringify({ seq: 1, sim_time: "2024-05-20T13:00:10Z", actor: "ops", kind: "EVA_STARTED", data: {}, provenance: {} });
it("report HTTP 500 falls back to the fetched log table with unavailable hash and no invented metrics", async () => {
  const fetchImpl = vi.fn(async (url: string) => url === "api/report" ? new Response('{"error":"report failed"}', { status: 500 }) : new Response(log));
  const root = await open(createElement(ReportRoute, { fetchImpl }));
  await flush();
  const table = must(root, '[data-fallback="report-log"]');
  expect(table.textContent).toContain("EVA_STARTED");
  expect(table.textContent).toContain("not certified for actual Martian flight");
  expect(must(table, '[data-slot="fallback-log-hash"]').getAttribute("data-unavailable")).toBe("true");
  expect(must(table, '[data-slot="fallback-log-hash"]').textContent).toBe("—");
  expect(must(root, '[data-slot="export-log"]').hasAttribute("disabled")).toBe(false);
});
it("report and log failure give a labelled unavailable table, with retry and back still usable", async () => {
  const root = await open(createElement(ReportRoute, { fetchImpl: async () => new Response("failed", { status: 500 }) }));
  await flush();
  const table = must(root, '[data-fallback="report-log"]');
  expect(must(table, '[data-unavailable="true"]').textContent).toContain("—");
  expect(table.textContent).toContain("Log unavailable");
  expect(root.querySelector('[data-slot="report-retry"]')).not.toBeNull();
});

it("missing log (404) or malformed NDJSON on report fallback shows em dash and data-unavailable without crashing", async () => {
  for (const logResp of [() => new Response("not found", { status: 404 }), () => new Response("{broken json\n", { status: 200 })]) {
    const root = await open(createElement(ReportRoute, {
      fetchImpl: async (url: string) => url === "api/report" ? new Response('{"error":"missing"}', { status: 404 }) : logResp(),
    }));
    await flush();
    const table = must(root, '[data-fallback="report-log"]');
    const unavailable = table.querySelectorAll('[data-unavailable="true"]');
    expect(unavailable.length).toBeGreaterThan(0);
    expect([...unavailable].some((el) => (el.textContent ?? "").includes("—"))).toBe(true);
    expect(table.textContent).toContain("Log unavailable");
  }
});

it.each([["FORBIDDEN_ROLE", "not supported"], ["INVALID", "unknown command kind ADD_STOP_TASK"]] as const)("%s ADD_STOP_TASK removes authoring while retaining live task progress", async (code, message) => {
  const store = storeFromBeat("connect");
  Object.assign(window, { innerWidth: 1440 });
  const { client } = recordingClient(store, () => rejected(code, message));
  const task = store.state()!.tasks[0]!;
  const root = await open(createElement(OpsConsole, { client, crew: store.state()!.crew, taskProgress: { EV1: { stop: { stopId: task.stop_id, stopNo: 1, done: 0, total: 1 }, total: { done: 0, total: 1 } } } }));
  const add = must(root, '[aria-label="Add task for EV1"]');
  await click(add);
  const input = must<HTMLInputElement>(root, '[aria-label="Enter task description"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, "Observe terrain");
  await fire(input, new window.Event("input", { bubbles: true }));
  await fire(must(root, "form.add-task-popover"), new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  expect(must(root, '[data-fallback="tasks-view-only"]').textContent).toContain("View only");
  expect(root.querySelector('[aria-label="Add task for EV1"]')).toBeNull();
  expect(must(root, '[data-testid="task-progress-EV1"]').textContent).toContain("TOTAL");
});

it("unanswered report and log requests leave loading at the link watchdog deadline", async () => {
  vi.useFakeTimers();
  const root = await open(createElement(ReportRoute, { fetchImpl: () => new Promise<Response>(() => {}) }));
  await act(async () => { await vi.advanceTimersByTimeAsync(LINK_LOST_AFTER_MS * 2); });
  expect(must(root, '[data-fallback="report-log"]').textContent).toContain("Log unavailable");
  expect(root.textContent).not.toContain("Loading event log");
});

it("a stalled map load also enters HUD-only without waiting forever", async () => {
  vi.useFakeTimers();
  vi.mocked(loadSite).mockImplementationOnce(() => new Promise(() => {}));
  const root = await open(createElement(EvaTablet, { crewId: "EV1", snapshot: storeFromBeat("connect").state() }));
  await act(async () => { await vi.advanceTimersByTimeAsync(LINK_LOST_AFTER_MS); });
  expect(must(root, '[data-fallback="hud-only"]').textContent).toContain("Map unavailable");
});
