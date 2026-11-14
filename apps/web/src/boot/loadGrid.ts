/**
 * Grid delivery to the worker (docs/specs/02 §E.1, §E.2; 05 §C RoutingGrid, §E.3; BD-40; T07.08).
 *
 * After the site has loaded the boot fetches the routing-grid files the manifest names (same origin, the asset `url`s
 * `loadSite` built), wraps them as the `LOAD_GRID` request of packages/protocol/src/worker.ts and posts it from the main
 * thread; the worker answers `GRID_LOADED` or `ERROR`. Until then the real worker answers `GRID_NOT_LOADED`.
 *
 * - The six arrays are the compute names (`slopeP90`, `slopeMax`, `commHab`, as `loadGrid` takes them). The request is
 *   posted with the buffers in the transfer list (ui/workerClient.ts), so they are moved, not copied.
 * - `meta` is the manifest `grid` plus `crs.proj4` byte for byte (05 §E.3; BD-45): the worker parses its projection origin
 *   from that one string.
 * - A grid file the manifest lists but the site does not serve is a BootError naming the file (03 §D "Boot asset
 *   failure"), as is a file the manifest does not list at all. The thermal-inertia file is the one optional array (05
 *   §E.6): no `ti_asset`, or a file that is not served, sends `ti: null` and routing runs without it (FD-229).
 */
import type { LoadGridRequest, WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import type { LoadedSite, WorkerClient } from "../ui/context";
import { BootError } from "./loadSite";
import { sha256HexBytes } from "../export/sha256";

/** How long the boot waits for GRID_LOADED before it reports GRID_TIMEOUT (FD-229). */
export const GRID_DELIVERY_TIMEOUT_MS = 30_000;

type Fetch = (url: string) => Promise<Response>;

async function fetchBuffer(site: LoadedSite, assetId: string, fetchImpl: Fetch, verifyChecksum: boolean): Promise<ArrayBuffer> {
  const asset = site.assets.get(assetId);
  if (!asset) {
    throw new BootError({
      code: "GRID_ASSET_UNRESOLVED",
      message: `Manifest names grid asset ${JSON.stringify(assetId)}, but no asset has that id`,
      missingFile: `sites/${site.site.site_id}/site-manifest.json`,
    });
  }
  let response: Response;
  try {
    response = await fetchImpl(asset.url);
  } catch (error) {
    throw new BootError({ code: "GRID_ASSET_LOAD_FAILED", message: `Failed to fetch grid file: ${asset.url}`, missingFile: asset.url, details: error });
  }
  if (!response.ok) {
    throw new BootError({
      code: "GRID_ASSET_NOT_FOUND",
      message: `Failed to fetch grid file: ${asset.url} (${response.status} ${response.statusText})`,
      missingFile: asset.url,
    });
  }
  const buffer = await response.arrayBuffer();
  if (verifyChecksum && sha256HexBytes(new Uint8Array(buffer)) !== asset.sha256.toLowerCase()) {
    throw new BootError({ code: "GRID_CHECKSUM_MISMATCH", message: `Grid file checksum does not match the manifest: ${asset.url}`, missingFile: asset.url });
  }
  return buffer;
}

/** Fetch the grid files and build the LOAD_GRID request. Throws BootError. */
export async function buildGridRequest(site: LoadedSite, requestId: string, fetchImpl: Fetch = (url) => fetch(url), verifyChecksum = false): Promise<LoadGridRequest> {
  const grid = site.site.grid;
  const optionalTi = async (): Promise<ArrayBuffer | null> => {
    if (!grid.ti_asset) return null;
    try {
      return await fetchBuffer(site, grid.ti_asset, fetchImpl, verifyChecksum);
    } catch (error) {
      if (error instanceof BootError && error.problem.code === "GRID_CHECKSUM_MISMATCH") throw error;
      return null;
    }
  };
  const [elevation, slopeP90, slopeMax, flags, commHab, ti] = await Promise.all([
    fetchBuffer(site, grid.elevation_asset, fetchImpl, verifyChecksum),
    fetchBuffer(site, grid.slope_p90_asset, fetchImpl, verifyChecksum),
    fetchBuffer(site, grid.slope_max_asset, fetchImpl, verifyChecksum),
    fetchBuffer(site, grid.flags_asset, fetchImpl, verifyChecksum),
    fetchBuffer(site, grid.comm_hab_asset, fetchImpl, verifyChecksum),
    optionalTi(),
  ]);
  return {
    type: "LOAD_GRID",
    request_id: requestId,
    site_id: site.site.site_id,
    data_version: site.site.data_version,
    meta: { ...grid, proj4: site.site.crs.proj4 },
    arrays: { elevation, slopeP90, slopeMax, flags, ti, commHab },
  };
}

/** Post LOAD_GRID and wait for the worker's answer to it. Resolves on GRID_LOADED; rejects with a BootError otherwise. */
export function deliverGrid(client: WorkerClient, request: LoadGridRequest, options: { timeoutMs?: number } = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? GRID_DELIVERY_TIMEOUT_MS;
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = client.onMessage((message: WorkerResponse) => {
      if (message.request_id !== request.request_id) return;
      if (message.type === "GRID_LOADED") {
        finish();
        resolve();
      } else if (message.type === "ERROR") {
        finish();
        reject(new BootError({ code: "GRID_REJECTED", message: `The compute worker rejected the routing grid (${message.code}): ${message.message}` }));
      }
    });
    function finish(): void {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    }
    timer = setTimeout(() => {
      finish();
      reject(new BootError({ code: "GRID_TIMEOUT", message: `The compute worker did not confirm the routing grid within ${timeoutMs} ms` }));
    }, timeoutMs);
    try {
      client.postMessage(request as WorkerRequest);
    } catch (error) {
      finish();
      reject(new BootError({ code: "GRID_REJECTED", message: `The routing grid could not be sent to the compute worker: ${error instanceof Error ? error.message : String(error)}` }));
    }
  });
}

/** The boot step: build the request (fresh id) and deliver it. */
export async function loadGridIntoWorker(site: LoadedSite, client: WorkerClient): Promise<void> {
  const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);
  await deliverGrid(client, await buildGridRequest(site, `grid-${id}`, (url) => fetch(url), import.meta.env.DEV));
}
