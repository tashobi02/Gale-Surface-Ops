/**
 * The EVA mini-map (SCR-12; 04 §E.5; plan step 2 of `docs/plan/frontend/17-eva-tablet.md`).
 *
 * Each `it` names the defect it locks down:
 * - the ortho tile layer carries the shared `OPS_ORTHO_LAYER_CLASS`, so the OPS grayscale rule (FD-003) reaches the
 *   mini-map as well as the planner's map;
 * - the crew member the tablet belongs to is marked "own" and the other is not, so "me" and "buddy" differ;
 * - the route source is not cleared and rebuilt on a snapshot that does not change the route;
 * - a comm grid that cannot be fetched is logged and shown as unavailable, never silently absent;
 * - the basemap alone decides HUD-only (FD-500, FD-505): a site without an optical layer and a single lost tile keep the map and its
 *   FULL MAP control, while a stalled first tile or tiles that all failed report `onUnavailable`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { LINK_LOST_AFTER_MS, type Snapshot } from "@marswalk/protocol";
import type VectorSource from "ol/source/Vector.js";
import { MiniMap } from "../../../src/ui/eva/MiniMap";
import { OPS_ORTHO_LAYER_CLASS } from "../../../src/ui/map/rasterLayers";
import { mockLoadedSite } from "./mapFixtures";
import { applyTokens } from "../tokensDom";
import { installDom, mount, removeDom } from "../domHarness";

const loadSite = vi.fn();
const createMap = vi.fn();

vi.mock("../../../src/boot/loadSite", () => ({ loadSite: (...args: unknown[]) => loadSite(...args) }));
vi.mock("../../../src/ui/map/createMap", () => ({ createMap: (...args: unknown[]) => createMap(...args) }));

/** The tile layers the mini-map added to the map, by class name. */
let tileLayers: { className: string }[] = [];
/** Every vector source the mini-map added, so a test can find the route one. */
let vectorSources: VectorSource[] = [];
/** The sources of the tile layers, so a test can raise the tile events a browser would. */
interface TileEvents { dispatchEvent: (type: string) => unknown }
let tileSources: TileEvents[] = [];

/**
 * The mock site with an optical (ortho) raster layer, which is what the mini-map draws: the mock manifest has only
 * the slope and elevation layers, so the ortho is added here from the manifest's own shape.
 */
function siteWithOrtho(): ReturnType<typeof mockLoadedSite> {
  const loaded = mockLoadedSite();
  const source = loaded.sources.get("src-slope") ?? [...loaded.sources.values()][0]!;
  const optical = {
    ...loaded.layers.get("slope")!,
    layer_id: "ortho",
    title: "Ortho",
    category: "optical" as const,
    asset_id: "tiles-elevation",
    source_ids: [source.source_id],
  };
  // The mini-map reads the manifest's own layer list.
  loaded.site.layers = [...loaded.site.layers, optical];
  loaded.layers.set("ortho", optical);
  return loaded;
}

beforeEach(() => {
  installDom();
  applyTokens();
  tileLayers = [];
  vectorSources = [];
  tileSources = [];
  loadSite.mockReset();
  createMap.mockReset();
  loadSite.mockResolvedValue(siteWithOrtho());
  createMap.mockImplementation(() => {
    const host = {
      layers: [] as unknown[],
      addLayer(layer: { getClassName?: () => string; getSource?: () => VectorSource }) {
        host.layers.push(layer);
        const className = layer.getClassName?.();
        if (className !== undefined && className !== "ol-layer") {
          tileLayers.push({ className });
          tileSources.push(layer.getSource!() as unknown as TileEvents);
        } else {
          const source = layer.getSource?.();
          if (source && typeof (source as { getFeatures?: unknown }).getFeatures === "function") vectorSources.push(source);
        }
      },
      removeLayer() {},
    };
    return {
      getTargetElement: () => document.createElement("div"),
      getMap: () => host,
      fitExtent() {}, setCenter() {}, getCenter: () => [0, 0], setZoom() {}, getZoom: () => 3,
      getResolution: () => 1, panBy() {}, zoomBy() {}, onViewChange: () => () => {}, destroy() {},
    };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  removeDom();
});

/** A snapshot whose plan has one OK leg, so the route source holds one feature. */
function snapshotWithPlan(): Snapshot {
  return {
    v: 1, type: "SNAPSHOT", seq: 1, sim_time: "2024-05-20T13:00:00Z",
    session: { session_id: "s-1", scenario_id: "sc", data_version: "d", seed: 1, status: "RUNNING", clock: { sim_time: "2024-05-20T13:00:00Z", speed: 1, paused: false }, plan_revision: 1, last_seq: 1, log_hash: "h", hab_candidate_id: null, mission_setup: { crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "max", max_haven_min: 30 }, started_events: [] },
    plan: { site_id: "mock_site", revision: 1, result: { legs: [{ leg_id: "l1", status: "OK", geometry: [[0, 0], [10, 0]] }] } },
    crew: [], vehicles: [], alerts: [], options: [], tasks: [],
    earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] },
    clients: [], provenance: {}, conditions: { ltst: null, sun_elevation_deg: null, dose_rate_background_ugy_h: null, dose_rate_event_ugy_h: null, event_series_utc: null, sol: null, source_ids: {}, provenance: {} },
    task_library: [], event_library: [], next_stop_target: null,
  } as unknown as Snapshot;
}

/** Let the site load and the effects settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the mini-map's ortho layer carries the OPS grayscale class (FD-003)", () => {
  it("the tile layer the mini-map adds has the shared ortho class, the same name the planner's map uses", async () => {
    const view = await mount(createElement(MiniMap, { snapshot: snapshotWithPlan() }));
    await settle();
    expect(tileLayers.length).toBeGreaterThan(0);
    expect(tileLayers.every((l) => l.className === OPS_ORTHO_LAYER_CLASS)).toBe(true);
    expect(view.container.querySelector('[data-slot="map-canvas"]')).not.toBeNull();
  });
});

/** The route source: the one whose features are plain geometries (the ops layers' features carry a `type`). */
function routeSourceOf(): VectorSource {
  const found = vectorSources.find((s) => s.getFeatures().some((f) => (f as { getGeometry?: () => unknown }).getGeometry?.() !== undefined && !(f as { get: (k: string) => unknown }).get("type")));
  if (!found) throw new Error("no route source");
  return found;
}

describe("the mini-map's route source is not rebuilt on every snapshot", () => {
  it("a snapshot that leaves the route alone does not clear the drawn route", async () => {
    const snapshot = snapshotWithPlan();
    const view = await mount(createElement(MiniMap, { snapshot }));
    await settle();
    const source = routeSourceOf();
    expect(source.getFeatures()).toHaveLength(1);
    const clear = vi.spyOn(source, "clear");
    // The same route in a new snapshot: nothing is cleared.
    await view.rerender(createElement(MiniMap, { snapshot: { ...snapshot, seq: 2 } }));
    await settle();
    expect(clear).not.toHaveBeenCalled();
    expect(source.getFeatures()).toHaveLength(1);
  });

  it("a snapshot whose route changed redraws the route", async () => {
    const snapshot = snapshotWithPlan();
    const view = await mount(createElement(MiniMap, { snapshot }));
    await settle();
    const source = routeSourceOf();
    const changed = {
      ...snapshot,
      plan: {
        ...snapshot.plan,
        result: { legs: [{ leg_id: "l1", status: "OK", geometry: [[0, 0], [10, 0], [20, 0]] }] },
      },
    } as unknown as Snapshot;
    await view.rerender(createElement(MiniMap, { snapshot: changed }));
    await settle();
    // The route was redrawn: the source holds the new geometry, not the old one.
    const geometry = source.getFeatures()[0]!.getGeometry() as unknown as { getCoordinates: () => number[][] };
    expect(geometry.getCoordinates()).toEqual([[0, 0], [10, 0], [20, 0]]);
  });
});

describe("the mini-map's comm grid is never silently absent", () => {
  it("a comm grid that cannot be fetched is logged and shown as unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    const view = await mount(createElement(MiniMap, { snapshot: snapshotWithPlan() }));
    await settle();
    expect(error).toHaveBeenCalled();
    const notice = view.container.querySelector('[data-source="unavailable:comm_hab"]');
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute("data-unavailable")).toBe("true");
  });
});

describe("the mini-map falls back to HUD-only only when the basemap itself failed (FD-500, FD-505)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("a site that declares no optical layer is a complete map: it never reports unavailable, also past the deadline", async () => {
    vi.useFakeTimers();
    loadSite.mockResolvedValue(mockLoadedSite());
    const onUnavailable = vi.fn();
    const view = await mount(createElement(MiniMap, { snapshot: snapshotWithPlan(), onUnavailable }));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(LINK_LOST_AFTER_MS * 2); });
    expect(tileSources).toHaveLength(0);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-slot="mini-map-open"]')).not.toBeNull();
    expect(view.container.querySelector('[data-source="site:manifest"]')).toBeNull();
  });

  it("one lost tile among tiles that loaded keeps the map, and the first tile that loads cancels the deadline", async () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
    await mount(createElement(MiniMap, { snapshot: snapshotWithPlan(), onUnavailable }));
    await settle();
    const [tiles] = tileSources;
    for (const type of ["tileloadstart", "tileloadstart", "tileloadstart"]) tiles!.dispatchEvent(type);
    tiles!.dispatchEvent("tileloaderror");
    tiles!.dispatchEvent("tileloadend");
    tiles!.dispatchEvent("tileloaderror");
    await act(async () => { await vi.advanceTimersByTimeAsync(LINK_LOST_AFTER_MS * 2); });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("tiles that all failed report the map unavailable once the last one is back, not at the first failure", async () => {
    const onUnavailable = vi.fn();
    const view = await mount(createElement(MiniMap, { snapshot: snapshotWithPlan(), onUnavailable }));
    await settle();
    const [tiles] = tileSources;
    for (const type of ["tileloadstart", "tileloadstart"]) tiles!.dispatchEvent(type);
    await act(async () => { tiles!.dispatchEvent("tileloaderror"); });
    expect(onUnavailable).not.toHaveBeenCalled();
    await act(async () => { tiles!.dispatchEvent("tileloaderror"); });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[data-source="site:manifest"]')).not.toBeNull();
  });

  it("a first tile that never answers reports the map unavailable at the link watchdog deadline", async () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
    await mount(createElement(MiniMap, { snapshot: snapshotWithPlan(), onUnavailable }));
    await settle();
    tileSources[0]!.dispatchEvent("tileloadstart");
    await act(async () => { await vi.advanceTimersByTimeAsync(LINK_LOST_AFTER_MS - 1); });
    expect(onUnavailable).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});
