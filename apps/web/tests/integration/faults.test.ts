/** T14.03/T14.05: local F4 assets, injected transport faults, real validation and worker. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlanResultMessage, SampleResult, WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import type { WorkerClient } from "../../src/ui/context";
import { validateSite } from "../../src/boot/validateSite";
import { createBootPlanStore, createPlannerBoot } from "../../src/boot/bootPlanner";
import { buildGridRequest, deliverGrid } from "../../src/boot/loadGrid";
import { DEFAULT_SCENARIO, createPlanStore } from "../../src/state/planStore";
import { loadedSiteFrom, mockManifest } from "../ui/map/mapFixtures";
import { createPlanWorker } from "../../src/worker/planWorker";
import { createWorkerClient, type WorkerLike } from "../../src/ui/workerClient";
import { BootErrorScreen } from "../../src/ui/screens/scr00BootError";
import { RouteResults } from "../../src/ui/screens/scr05RouteResults";
import { createPlacement, type PlacementNotice } from "../../src/ui/map/waypointLayer";
import { createRasterLayers } from "../../src/ui/map/rasterLayers";
import { LayersPanel } from "../../src/ui/screens/scr03LayersPanel";
import { installDom, removeDom, mount, click, must, flush } from "../ui/domHarness";

const DIR = resolve(__dirname, "../../../../data/sites/mock_site");

function fixture() {
  const site = mockManifest();
  // F4 has optional topographic layers; make its elevation tiles the required basemap for these fault cases.
  site.layers[0].optional = false;
  const urls: string[] = [];
  const bodies = new Map<string, Uint8Array>();
  for (const asset of site.assets) {
    const file = asset.path + (asset.format === "tiles" ? "/index.json" : "");
    const bytes = new Uint8Array(readFileSync(resolve(DIR, file)));
    const url = `sites/${site.site_id}/${file}`;
    bodies.set(url, bytes);
    asset.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
    urls.push(url);
    const bytes = bodies.get(url);
    return bytes
      ? new Response(options?.method === "HEAD" ? null : bytes.slice().buffer, { status: 200 })
      : new Response(null, { status: 404 });
  });
  const urlOf = (id: string) => {
    const asset = site.assets.find(a => a.asset_id === id)!;
    return `sites/${site.site_id}/${asset.path}${asset.format === "tiles" ? "/index.json" : ""}`;
  };
  return { site, urls, bodies, fetchImpl, urlOf };
}

afterEach(() => vi.restoreAllMocks());

describe("site validation faults (T14.03/T14.05)", () => {
  it("refuses another schema major before fetching any asset", async () => {
    const f = fixture();
    f.site.schema_version = "2.0.0";
    const problems = await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: false });
    expect(problems).toEqual([expect.objectContaining({ code: "SCHEMA_MAJOR_MISMATCH", message: expect.stringContaining("2") })]);
    expect(f.urls).toEqual([]);
  });

  it("allows a compatible minor version and keeps every request in the local site folder", async () => {
    const f = fixture();
    f.site.schema_version = "1.7.2";
    expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: true })).toEqual([]);
    expect(f.urls.length).toBe(f.site.assets.length);
    expect(f.urls.every(url => url.startsWith("sites/mock_site/") && !url.includes(".."))).toBe(true);
  });

  it("hashes each development asset using Web Crypto, including the tiles index", async () => {
    const f = fixture();
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: true, subtle: webcrypto.subtle as SubtleCrypto })).toEqual([]);
    expect(digest).toHaveBeenCalledTimes(f.site.assets.length);
    expect(f.urls).toContain("sites/mock_site/tiles/elevation/index.json");
  });

  it("names a corrupted required file and stops planner boot before worker creation", async () => {
    const f = fixture();
    const url = f.urlOf(f.site.grid.elevation_asset);
    const bytes = f.bodies.get(url)!.slice();
    bytes[0] ^= 1;
    f.bodies.set(url, bytes);
    const createWorkerClient = vi.fn(() => ({}) as WorkerClient);
    const boot = createPlannerBoot({
      hasWorker: () => true,
      loadSite: async () => loadedSiteFrom(f.site),
      validateSite: site => validateSite(site, { fetchImpl: f.fetchImpl, dev: true }),
      createWorkerClient,
    });
    await expect(boot.get()).rejects.toMatchObject({ problem: { code: "ASSET_CHECKSUM_MISMATCH", missingFile: url } });
    expect(createWorkerClient).not.toHaveBeenCalled();
    const problem = await boot.get().catch(error => error.problem);
    const screen = renderToStaticMarkup(createElement(BootErrorScreen, { problem, onRetry() {} }));
    expect(screen).toContain(url);
    expect(screen).toContain("Retry");
  });

  it("production probes required assets without reading bodies, hashing, or probing optional assets", async () => {
    const f = fixture();
    f.bodies.get(f.urlOf(f.site.grid.elevation_asset))![0] ^= 1;
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: false, subtle: webcrypto.subtle as SubtleCrypto })).toEqual([]);
    expect(digest).not.toHaveBeenCalled();
    expect(f.fetchImpl.mock.calls.every(([, options]) => options?.method === "HEAD")).toBe(true);
    expect(f.urls).not.toContain(f.urlOf(f.site.grid.ti_asset!));
  });

  it("a missing required grid or basemap names the actual local file", async () => {
    for (const kind of ["grid", "basemap"] as const) {
      const f = fixture();
      const id = kind === "grid" ? f.site.grid.flags_asset : f.site.layers.find(layer => !layer.optional)!.asset_id;
      const url = f.urlOf(id);
      f.bodies.delete(url);
      const problems = await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: false });
      expect(problems).toContainEqual(expect.objectContaining({ code: "ASSET_MISSING", missingFile: url }));
    }
  });

  it("does not fetch an escaping asset path or unsafe site id", async () => {
    for (const path of ["https://outside.example/file", "//outside.example/file", "../secret", "tiles/%2e%2e/secret", "tiles\\secret", ".. ",
      "tiles/..\t/..\t/..\t/api/session", "tiles/..\n/..\r/api/session", "tiles/%09secret", "tiles/%00secret", "tiles/\u007fsecret"]) {
      const f = fixture();
      f.site.assets[0].path = path;
      expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: false })).toContainEqual(expect.objectContaining({ code: "ASSET_PATH_INVALID" }));
      expect(f.urls).toEqual([]);
    }
    const f = fixture();
    f.site.site_id = "../outside";
    expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: false })).toContainEqual(expect.objectContaining({ code: "INVALID_SITE_ID" }));
    expect(f.urls).toEqual([]);
  });

  it("a required asset reference absent from the manifest fails before fetching", async () => {
    const f = fixture();
    f.site.assets = f.site.assets.filter(asset => asset.asset_id !== f.site.grid.flags_asset);
    expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: true })).toContainEqual(expect.objectContaining({ code: "ASSET_UNRESOLVED" }));
    expect(f.urls).toEqual([]);
  });

  it("unresolved provenance source and derived-layer references fail before fetching", async () => {
    for (const kind of ["source", "layer", "constant"] as const) {
      const f = fixture();
      if (kind === "source") f.site.layers[0].source_ids = ["missing-source"];
      else if (kind === "layer") f.site.layers[0].derived_from = ["missing-layer"];
      else f.site.env_constants[0].source_id = "missing-source";
      expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: true })).toContainEqual(expect.objectContaining({ code: "REFERENCE_UNRESOLVED" }));
      expect(f.urls).toEqual([]);
    }
  });

  it("deleted optional TI tiles make the real raster controller and SCR-03 row unavailable", async () => {
    installDom();
    const f = fixture();
    const thermal = { ...f.site.layers[0], layer_id: "thermal_inertia", title: "Thermal inertia", category: "thermal" as const, asset_id: "tiles-ti", optional: true };
    f.site.layers.push(thermal);
    f.site.assets.push({ ...f.site.assets.find(asset => asset.format === "tiles")!, asset_id: "tiles-ti", path: "tiles/thermal_inertia" });
    const site = loadedSiteFrom(f.site);
    let controller: ReturnType<typeof createRasterLayers> | undefined;
    try {
      expect(await validateSite(f.site, { fetchImpl: f.fetchImpl, dev: true, onUnavailableAsset: id => site.assets.delete(id) })).toEqual([]);
      const store = createPlanStore({ scenario: DEFAULT_SCENARIO, waypoints: [] }, {
        siteId: f.site.site_id, dataVersion: f.site.data_version,
        workerClient: { computePlan: () => new Promise<never>(() => {}), retry() {}, isCrashed: () => false },
      });
      const css = readFileSync(resolve(__dirname, "../../src/ui/styles/tokens.css"), "utf8");
      controller = createRasterLayers(site, { scenario: store, deps: { readToken: name => css.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1].trim() ?? "" } });
      const managed = controller.getLayer(thermal.layer_id)!;
      expect(managed.getStatus()).toBe("unavailable");
      const html = renderToStaticMarkup(createElement(LayersPanel, {
        layers: [{ id: managed.layerId, title: managed.title, scientific: true, visible: false, opacity: null,
          status: managed.getStatus(), provenance: managed.provenance, sourceIds: managed.sourceIds, legend: { type: "none" } }],
        onVisibleChange() {}, onOpacityChange() {},
      }));
      expect(html).toContain('data-state="unavailable"');
      expect(html).toContain("Unavailable");
      expect(html).toContain("disabled");
    } finally {
      controller?.destroy();
      removeDom();
    }
  });

  it("default planner validation removes failed optional assets from the loaded lookup before grid delivery", async () => {
    const f = fixture();
    const id = f.site.grid.ti_asset!;
    f.bodies.delete(f.urlOf(id));
    const site = loadedSiteFrom(f.site);
    vi.stubGlobal("fetch", f.fetchImpl);
    const loadGrid = vi.fn(async () => { expect(site.assets.has(id)).toBe(false); });
    try {
      const boot = await createPlannerBoot({
        hasWorker: () => true, loadSite: async () => site,
        createWorkerClient: () => ({ terminate() {} }) as WorkerClient,
        loadGrid,
      }).get();
      expect(loadGrid).toHaveBeenCalledOnce();
      expect(boot.skipped).toEqual([]);
      expect(site.site.assets.some(asset => asset.asset_id === id)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("missing optional TI continues through real routing and produces TI_UNKNOWN", async () => {
    const f = fixture();
    const tiId = f.site.grid.ti_asset!;
    f.bodies.delete(f.urlOf(tiId));
    const site = loadedSiteFrom(f.site);
    const unavailable: string[] = [];
    expect(await validateSite(f.site, {
      fetchImpl: f.fetchImpl, dev: true,
      onUnavailableAsset: id => { unavailable.push(id); site.assets.delete(id); },
    })).toEqual([]);
    expect(unavailable).toContain(tiId);
    const request = await buildGridRequest(site, "grid-missing-ti", f.fetchImpl);
    expect(request.arrays.ti).toBeNull();
    const worker = createPlanWorker();
    expect((await worker.handleMessage(request)).type).toBe("GRID_LOADED");
    const start = f.site.default_start;
    const response = await worker.handleMessage({
      type: "COMPUTE_PLAN", request_id: "missing-ti-plan", plan_revision: 1,
      site_id: f.site.site_id, data_version: f.site.data_version,
      scenario: { ...DEFAULT_SCENARIO, eva_start_utc: "2026-11-14T08:00:00Z" },
      waypoints: [
        { id: "start", role: "start", x_m: start.x_m, y_m: start.y_m },
        { id: "stop", role: "stop", x_m: start.x_m + f.site.grid.cell_m, y_m: start.y_m },
      ],
    });
    expect(response.type).toBe("PLAN_RESULT");
    const result = response as PlanResultMessage;
    expect(result.legs[0].status).toBe("OK");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "TI_UNKNOWN", severity: "unknown" }));
  });

  it("a real worker rejects impossible placements, offers a nearby snap, and never adds an outside waypoint", async () => {
    const f = fixture();
    const site = loadedSiteFrom(f.site);
    const adapter = createPlanWorker();
    await adapter.handleMessage(await buildGridRequest(site, "placement-grid", f.fetchImpl));
    const store = createPlanStore({ scenario: DEFAULT_SCENARIO, waypoints: [] }, {
      siteId: f.site.site_id, dataVersion: f.site.data_version,
      workerClient: { computePlan: () => new Promise<never>(() => {}), retry() {}, isCrashed: () => false },
    });
    const notices: PlacementNotice[] = [];
    const placement = createPlacement({
      site, planStore: store,
      workerClient: { samplePoint: async request => await adapter.handleMessage({ ...request, type: "SAMPLE_POINT" }) as SampleResult },
      notify: notice => { if (notice) notices.push(notice); },
    });
    const [minx, , maxx, maxy] = f.site.aoi.extent_m;
    const cell = f.site.grid.cell_m;
    // F4's synthetic central wall is blocked except at its middle-row gap; nearest passable centre is 50 m away here.
    const wallEdge = minx + Math.floor(f.site.grid.width / 2) * cell;
    const y = maxy - (10 + 0.5) * cell;
    expect(await placement.place({ x_m: wallEdge, y_m: y })).toBe("offered");
    expect(renderToStaticMarkup(createElement(Fragment, null, notices.at(-1)!.message))).toContain("Not walkable here");
    expect(store.get().waypoints).toHaveLength(0);
    notices.at(-1)!.actions!.find(action => action.action === "accept-snap")!.onClick();
    expect(store.get().waypoints).toHaveLength(1);
    expect(store.get().waypoints[0].snapped_from).toEqual({ x_m: wallEdge, y_m: y });
    const count = store.get().waypoints.length;
    expect(await placement.place({ x_m: wallEdge + cell / 2, y_m: y })).toBe("refused");
    expect(await placement.place({ x_m: maxx + cell, y_m: y })).toBe("outside");
    expect(notices.at(-1)!.message).toBe("Outside mapped area");
    expect(store.get().waypoints).toHaveLength(count);
  });

  it("worker crash shows Retry, and Retry reloads the grid into a fresh real worker and recomputes", async () => {
    installDom();
    const f = fixture();
    const site = loadedSiteFrom(f.site);
    const loads: string[] = [];
    let crashNext = true;
    const client = createWorkerClient({ workerFactory: () => {
      const adapter = createPlanWorker();
      const instance: WorkerLike = {
        onmessage: null, onerror: null,
        postMessage(value) {
          const request = value as WorkerRequest;
          if (request.type === "COMPUTE_PLAN" && crashNext) {
            crashNext = false;
            queueMicrotask(() => instance.onerror?.({ message: "injected worker failure", preventDefault() {} } as ErrorEvent));
          } else {
            if (request.type === "LOAD_GRID") loads.push(request.request_id);
            void adapter.handleMessage(request).then(data => instance.onmessage?.({ data } as MessageEvent<WorkerResponse>));
          }
        },
        terminate() {},
      };
      return instance;
    } });
    vi.stubGlobal("fetch", f.fetchImpl);
    let view: Awaited<ReturnType<typeof mount>> | undefined;
    try {
      await deliverGrid(client, await buildGridRequest(site, "first-grid", f.fetchImpl));
      const store = createBootPlanStore(site, client);
      store.setScenario({ eva_start_utc: "2026-11-14T08:00:00Z" });
      const start = f.site.default_start;
      store.addWaypoint({ id: "stop", role: "stop", x_m: start.x_m + f.site.grid.cell_m, y_m: start.y_m });
      await vi.waitFor(() => expect(store.get().status).toBe("Error"));
      view = await mount(createElement(RouteResults, { planStore: store, site }));
      expect(view.container.textContent).toContain("Computation failed");
      await click(must(view.container, ".scr05-retry-btn"));
      await vi.waitFor(() => expect(["OK", "OverLimits"]).toContain(store.get().status));
      await flush();
      expect(loads).toHaveLength(2);
      expect(store.get().result?.legs[0].status).toBe("OK");
      expect(view.container.textContent).not.toContain("Computation failed");
    } finally {
      await view?.unmount();
      client.terminate();
      vi.unstubAllGlobals();
      removeDom();
    }
  });
});
