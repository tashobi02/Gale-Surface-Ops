/**
 * QoL Q4: the EVA mini-map is zoomed to the crew member, follows them, and has + / − / RECENTRE (docs/plan/qol/README.md
 * §1 Q4; decisions Q4-01 to Q4-04).
 *
 * Each `it` names the behaviour it locks down:
 * - the default view is centred on this crew member and its extent holds both the crew member and their next stop;
 * - the extent never falls below the minimum width (10 % of the AOI width, Q4-01);
 * - zoom changes the resolution, and the view keeps following the crew member at the chosen zoom (Q4-02);
 * - RECENTRE restores the follow view (crew + next stop);
 * - the controls are at least 56 px (04 §E, gloves) and tapping the map still opens the full-screen map.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import { MiniMap } from "../../../src/ui/eva/MiniMap";
import { followExtent } from "../../../src/ui/eva/miniMapView";
import { mockLoadedSite } from "./mapFixtures";
import { applyTokens } from "../tokensDom";
import { installDom, mount, removeDom } from "../domHarness";

const loadSite = vi.fn();
const createMap = vi.fn();

vi.mock("../../../src/boot/loadSite", () => ({ loadSite: (...args: unknown[]) => loadSite(...args) }));
vi.mock("../../../src/ui/map/createMap", () => ({ createMap: (...args: unknown[]) => createMap(...args) }));

/** A stateful stand-in for the map handle: a fit centres the extent and sets a resolution from its width. */
interface FakeView { center: [number, number]; resolution: number; fits: [number, number, number, number][] }
let view: FakeView;

const HOST_PX = 400;

beforeEach(() => {
  installDom();
  applyTokens();
  view = { center: [0, 0], resolution: 15, fits: [] };
  loadSite.mockReset();
  createMap.mockReset();
  loadSite.mockResolvedValue(mockLoadedSite());
  createMap.mockImplementation(() => ({
    getTargetElement: () => document.createElement("div"),
    getMap: () => ({ addLayer() {}, removeLayer() {}, getLayers: () => ({ getArray: () => [] }), on() {}, un() {} }),
    fitExtent(extent: [number, number, number, number]) {
      view.fits.push(extent);
      view.center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
      view.resolution = (extent[2] - extent[0]) / HOST_PX;
    },
    setCenter(coord: [number, number]) { view.center = coord; },
    getCenter: () => view.center,
    setZoom() {},
    getZoom: () => 3,
    getResolution: () => view.resolution,
    panBy() {},
    zoomBy(delta: number) { view.resolution = view.resolution / 2 ** delta; },
    onViewChange: () => () => {},
    destroy() {},
  }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  removeDom();
});

/** EV1 walking at (x, y) towards the plan's first stop at (700, 300). */
function snapshotAt(x: number, y: number): Snapshot {
  return {
    v: 1, type: "SNAPSHOT", seq: 1, sim_time: "2024-05-20T13:00:00Z",
    session: { session_id: "s-1", scenario_id: "sc", data_version: "d", seed: 1, status: "RUNNING", clock: { sim_time: "2024-05-20T13:00:00Z", speed: 1, paused: false }, plan_revision: 1, last_seq: 1, log_hash: "h", hab_candidate_id: null, started_events: [] },
    plan: {
      site_id: "mock_site", revision: 1,
      waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0 }, { id: "wp-1", role: "stop", x_m: 700, y_m: 300 }],
      result: { legs: [] },
    },
    crew: [{ crew_id: "EV1", activity: "WALKING", x_m: x, y_m: y }],
    vehicles: [], alerts: [], options: [], tasks: [],
    earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] },
    clients: [], provenance: {}, conditions: { ltst: null, sun_elevation_deg: null, dose_rate_background_ugy_h: null, dose_rate_event_ugy_h: null, event_series_utc: null, sol: null, source_ids: {}, provenance: {} },
    task_library: [], event_library: [], next_stop_target: null,
  } as unknown as Snapshot;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

const contains = (e: [number, number, number, number], [x, y]: [number, number]): boolean => x >= e[0] && x <= e[2] && y >= e[1] && y <= e[3];

describe("followExtent (Q4)", () => {
  it("is centred on the crew member and holds the next stop", () => {
    const e = followExtent([500, 300], [1400, -200], 600);
    expect([(e[0] + e[2]) / 2, (e[1] + e[3]) / 2]).toEqual([500, 300]);
    expect(contains(e, [1400, -200])).toBe(true);
  });

  it("never falls below the minimum width, also with no next stop", () => {
    const near = followExtent([500, 300], [510, 300], 600);
    expect(near[2] - near[0]).toBe(600);
    const none = followExtent([500, 300], null, 600);
    expect(none).toEqual([200, 0, 800, 600]);
  });
});

describe("the EVA mini-map follows the crew member (Q4)", () => {
  it("centres on the crew member with the next stop in view, zooms, keeps following, and RECENTRE restores the follow view", async () => {
    const onOpen = vi.fn();
    const mounted = await mount(createElement(MiniMap, { snapshot: snapshotAt(500, 300), crewId: "EV1", onOpen }));
    await settle();

    // Default view: centred on EV1, extent holds EV1 and wp-1.
    expect(view.center).toEqual([500, 300]);
    const first = view.fits.at(-1)!;
    expect(contains(first, [500, 300]) && contains(first, [700, 300])).toBe(true);
    const followResolution = view.resolution;

    // Zoom in changes the resolution.
    const zoomIn = document.querySelector<HTMLButtonElement>('[data-slot="mini-map-controls"] [data-control="zoom-in"]')!;
    await act(async () => { zoomIn.click(); });
    expect(view.resolution).toBeLessThan(followResolution);
    const zoomed = view.resolution;

    // The crew member moves: the view follows at the chosen zoom.
    await mounted.rerender(createElement(MiniMap, { snapshot: snapshotAt(560, 320), crewId: "EV1", onOpen }));
    expect(view.center).toEqual([560, 320]);
    expect(view.resolution).toBe(zoomed);

    // RECENTRE restores the follow view.
    const recentre = document.querySelector<HTMLButtonElement>('[data-slot="mini-map-controls"] [data-control="fit"]')!;
    expect(recentre.textContent).toMatch(/RECENTRE/);
    await act(async () => { recentre.click(); });
    expect(view.center).toEqual([560, 320]);
    expect(contains(view.fits.at(-1)!, [700, 300])).toBe(true);
    expect(view.resolution).not.toBe(zoomed);
    expect(onOpen).not.toHaveBeenCalled();

    // Gloves: every control is at least 56 px; the map itself still opens the full-screen map.
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-slot="mini-map-controls"] button')) {
      expect(parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(56);
      expect(parseFloat(button.style.minWidth)).toBeGreaterThanOrEqual(56);
    }
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-slot="mini-map-open"]')!.click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });
});
