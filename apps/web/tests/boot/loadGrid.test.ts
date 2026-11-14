/**
 * T07.08 / BD-40 — the boot sends LOAD_GRID from the main thread to the worker once the site has loaded, so the real worker
 * stops answering GRID_NOT_LOADED (02 §E.1, §E.2; 05 §E.3 byte-identical projection string).
 * The fetches, the worker and the clock are test doubles; the real plan worker adapter is exercised in tests/worker/planWorker.grid.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import type { LoadGridRequest, WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import type { WorkerClient } from "../../src/ui/context";
import { BootError } from "../../src/boot/loadSite";
import { buildGridRequest, deliverGrid } from "../../src/boot/loadGrid";
import { sha256HexBytes } from "../../src/export/sha256";
import { mockLoadedSite, loadedSiteFrom, mockManifest } from "../ui/map/mapFixtures";

const SITE = mockLoadedSite();
const GRID = SITE.site.grid;
const cells = GRID.width * GRID.height;

/** Same-origin fetch answering every grid asset of the mock site with a buffer of the right size. */
function fetchGrid(over: Record<string, () => Response> = {}): { fetch: (url: string) => Promise<Response>; urls: string[] } {
  const urls: string[] = [];
  const bytes = (asset: string): number => (asset === GRID.elevation_asset ? cells * 4 : cells);
  const assetOf = new Map([...SITE.assets.values()].map((a) => [a.url, a.asset_id]));
  return {
    urls,
    fetch: async (url) => {
      urls.push(url);
      const id = assetOf.get(url) ?? "";
      if (over[id]) return over[id]();
      if (id === GRID.ti_asset) return new Response(new Uint8Array(40).buffer);
      return new Response(new Uint8Array(bytes(id)).buffer);
    },
  };
}

describe("buildGridRequest (BD-40 LOAD_GRID shape)", () => {
  it("fetches the six grid assets of the manifest and keys them as protocol worker.ts does", async () => {
    const { fetch, urls } = fetchGrid();
    const request = await buildGridRequest(SITE, "req-grid", fetch);
    expect(request.type).toBe("LOAD_GRID");
    expect(request.request_id).toBe("req-grid");
    expect(request.site_id).toBe(SITE.site.site_id);
    expect(request.data_version).toBe(SITE.site.data_version);
    expect(Object.keys(request.arrays).sort()).toEqual(["commHab", "elevation", "flags", "slopeMax", "slopeP90", "ti"]);
    expect(request.arrays.elevation.byteLength).toBe(cells * 4);
    expect(request.arrays.slopeP90.byteLength).toBe(cells);
    expect(request.arrays.slopeMax.byteLength).toBe(cells);
    expect(request.arrays.flags.byteLength).toBe(cells);
    expect(request.arrays.commHab.byteLength).toBe(cells);
    expect(request.arrays.ti?.byteLength).toBe(40);
    expect(urls.sort()).toEqual(
      [GRID.elevation_asset, GRID.slope_p90_asset, GRID.slope_max_asset, GRID.flags_asset, GRID.comm_hab_asset, GRID.ti_asset!].map((id) => SITE.assets.get(id)!.url).sort(),
    );
  });

  it("carries the manifest grid and the working-projection string byte for byte (05 §E.3, BD-45)", async () => {
    const request = await buildGridRequest(SITE, "r", fetchGrid().fetch);
    expect(request.meta).toEqual({ ...GRID, proj4: SITE.site.crs.proj4 });
    expect(request.meta.proj4).toBe("+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs");
  });

  it("a manifest with no ti_asset sends ti: null, and so does a thermal-inertia file the site does not have (05 §E.6)", async () => {
    const noTi = mockManifest();
    delete noTi.grid.ti_asset;
    delete noTi.grid.ti_cell_m;
    expect((await buildGridRequest(loadedSiteFrom(noTi), "r", fetchGrid().fetch)).arrays.ti).toBeNull();

    const missing = fetchGrid({ [GRID.ti_asset!]: () => new Response("", { status: 404 }) });
    expect((await buildGridRequest(SITE, "r", missing.fetch)).arrays.ti).toBeNull();
  });

  it("development detects an optional grid checksum mismatch but still allows a missing optional file", async () => {
    const site = loadedSiteFrom(mockManifest());
    const normal = fetchGrid().fetch;
    for (const asset of site.assets.values()) {
      if ([GRID.elevation_asset, GRID.slope_p90_asset, GRID.slope_max_asset, GRID.flags_asset, GRID.comm_hab_asset, GRID.ti_asset].includes(asset.asset_id)) {
        asset.sha256 = sha256HexBytes(new Uint8Array(await (await normal(asset.url)).arrayBuffer()));
      }
    }
    await expect(buildGridRequest(site, "r", normal, true)).resolves.toBeDefined();
    const badTi = fetchGrid({ [GRID.ti_asset!]: () => new Response(new Uint8Array(40).fill(1).buffer) });
    await expect(buildGridRequest(site, "r", badTi.fetch, true)).rejects.toMatchObject({ problem: { code: "GRID_CHECKSUM_MISMATCH", missingFile: site.assets.get(GRID.ti_asset!)!.url } });
    const missing = fetchGrid({ [GRID.ti_asset!]: () => new Response("", { status: 404 }) });
    expect((await buildGridRequest(site, "r", missing.fetch, true)).arrays.ti).toBeNull();
    expect((await buildGridRequest(site, "r", badTi.fetch, false)).arrays.ti).not.toBeNull();
  });

  it("a required grid file that is missing is a BootError naming the file, never a guessed path", async () => {
    const elevationUrl = SITE.assets.get(GRID.elevation_asset)!.url;
    const gone = fetchGrid({ [GRID.elevation_asset]: () => new Response("", { status: 404, statusText: "Not Found" }) });
    await expect(buildGridRequest(SITE, "r", gone.fetch)).rejects.toMatchObject({
      problem: { code: "GRID_ASSET_NOT_FOUND", missingFile: elevationUrl },
    });

    const noEntry = mockManifest();
    noEntry.assets = noEntry.assets.filter((a) => a.asset_id !== GRID.flags_asset);
    await expect(buildGridRequest(loadedSiteFrom(noEntry), "r", fetchGrid().fetch)).rejects.toMatchObject({
      problem: { code: "GRID_ASSET_UNRESOLVED" },
    });
  });

  it("a network failure on a required grid file is a BootError too", async () => {
    const fetch = async (): Promise<Response> => {
      throw new TypeError("offline");
    };
    await expect(buildGridRequest(SITE, "r", fetch)).rejects.toBeInstanceOf(BootError);
  });
});

/** A worker client double: records what is posted and lets the test answer. */
function clientDouble(): { client: WorkerClient; posted: WorkerRequest[]; answer: (m: WorkerResponse) => void; listeners: () => number } {
  const posted: WorkerRequest[] = [];
  const set = new Set<(m: WorkerResponse) => void>();
  const client = {
    postMessage: (m: WorkerRequest) => void posted.push(m),
    onMessage: (l: (m: WorkerResponse) => void) => {
      set.add(l);
      return () => void set.delete(l);
    },
  } as unknown as WorkerClient;
  return { client, posted, answer: (m) => set.forEach((l) => l(m)), listeners: () => set.size };
}

const request = (): LoadGridRequest => ({
  type: "LOAD_GRID",
  request_id: "req-grid",
  site_id: "mock_site",
  data_version: "v",
  meta: { ...GRID, proj4: "p" },
  arrays: { elevation: new ArrayBuffer(0), slopeP90: new ArrayBuffer(0), slopeMax: new ArrayBuffer(0), flags: new ArrayBuffer(0), ti: null, commHab: new ArrayBuffer(0) },
});

describe("deliverGrid", () => {
  it("posts LOAD_GRID once and resolves when the worker answers GRID_LOADED for that request", async () => {
    const { client, posted, answer, listeners } = clientDouble();
    const done = deliverGrid(client, request());
    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe("LOAD_GRID");
    answer({ type: "GRID_LOADED", request_id: "someone-else", site_id: "mock_site", data_version: "v" });
    answer({ type: "GRID_LOADED", request_id: "req-grid", site_id: "mock_site", data_version: "v" });
    await expect(done).resolves.toBeUndefined();
    expect(listeners(), "the listener is removed").toBe(0);
  });

  it("an ERROR for the request is a BootError carrying the worker's code and message", async () => {
    const { client, answer, listeners } = clientDouble();
    const done = deliverGrid(client, request());
    answer({ type: "ERROR", request_id: "req-grid", code: "INVALID_INPUT", message: "slopeP90 buffer byte length (3) does not match" });
    await expect(done).rejects.toMatchObject({ problem: { code: "GRID_REJECTED" }, message: expect.stringContaining("slopeP90 buffer byte length") });
    expect(listeners()).toBe(0);
  });

  it("a worker that never answers fails with GRID_TIMEOUT instead of hanging the boot", async () => {
    vi.useFakeTimers();
    try {
      const { client, listeners } = clientDouble();
      const done = deliverGrid(client, request(), { timeoutMs: 1000 });
      const assertion = expect(done).rejects.toMatchObject({ problem: { code: "GRID_TIMEOUT" } });
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(listeners()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
