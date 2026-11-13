/// <reference types="node" />
/**
 * Helpers that BREAK a primary path of the planner and let the degraded path prove itself (package 33; FD-193).
 *
 * Nothing here fakes a success: a helper only makes the primary route fail (a refused tile pyramid, a canvas export that throws, a
 * worker that has no handler) or supplies what the F4 site lacks (an ortho layer, a pipeline PNG). The checks then assert that the
 * fallback appears, says so in words with a shape, and keeps every request on localhost.
 */
import type { Page, Route } from "@playwright/test";
import { deflateSync } from "node:zlib";

const SITE = "mock_site";
const MANIFEST = `**/sites/${SITE}/site-manifest.json`;

type Json = Record<string, unknown>;
interface ManifestLayer extends Json { layer_id: string; category: string; default_visible: boolean }
interface ManifestAsset extends Json { asset_id: string }
interface Manifest extends Json { layers: ManifestLayer[]; assets: ManifestAsset[] }

/** Serves the F4 manifest after `edit` changed it; every other file comes from the Hab Core untouched. */
export async function editManifest(page: Page, edit: (manifest: Manifest) => void): Promise<void> {
  await page.route(MANIFEST, async (route: Route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as Manifest;
    edit(manifest);
    await route.fulfill({ response, json: manifest });
  });
}

/**
 * The F4 site has no ortho basemap. Its elevation tile set stands in for one (category `optical`, drawn at once), which is the
 * layer FD-101 lets fall back to its own coarsest tile.
 */
export const asOrtho = (page: Page): Promise<void> =>
  editManifest(page, (manifest) => {
    const layer = manifest.layers.find((l) => l.layer_id === "elevation")!;
    layer.category = "optical";
    layer.default_visible = true;
  });

/** What a tile-refusing route saw: the XYZ pyramid it refused, and the one coarsest-level request it let through. */
export interface TileAttempts {
  refused: string[];
  coarsest: string[];
}

const TILE_URL = /\/sites\/mock_site\/tiles\/([a-z_]+)\/(\d+)\/(\d+)\/(\d+)\.png$/;

/**
 * Refuses every tile request of `tileSet` with 404. With `keepCoarsest`, the single coarsest image `0/0/0.png` is answered, but only
 * once the XYZ source has given up: when other tiles were refused first, or when the layer asked for the coarsest tile itself and was
 * refused once already. That request is therefore the ImageStatic stand-in's, never the pyramid's.
 */
export async function failTiles(page: Page, tileSet: string, options: { keepCoarsest: boolean }): Promise<TileAttempts> {
  const attempts: TileAttempts = { refused: [], coarsest: [] };
  await page.route(TILE_URL, async (route) => {
    const url = route.request().url();
    const [, set, z, x, y] = TILE_URL.exec(url)!;
    if (set !== tileSet) return route.fallback();
    const isCoarsest = z === "0" && x === "0" && y === "0";
    if (isCoarsest && options.keepCoarsest) {
      attempts.coarsest.push(url);
      if (attempts.refused.some((u) => !u.endsWith("/0/0/0.png")) || attempts.coarsest.length > 1) return route.fallback();
    }
    attempts.refused.push(url);
    return route.fulfill({ status: 404, contentType: "text/plain", body: "tile refused by the check" });
  });
  return attempts;
}

// ── a PNG, built here (no binary in the repository) ────────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** A solid-colour RGBA PNG of `size` x `size` pixels. */
export function solidPng(size: number, rgba: readonly [number, number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, no filter, no interlace
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The static PNG size the pipeline would write; the resolution the row shows is the AOI width over it. */
export const STATIC_PNG_SIZE = 16;

/**
 * Declares the pipeline's static image for `layerId` in the manifest (`images/<layer_id>.png`, BD-23) and serves a PNG for it, as
 * `pipeline --static-images` would. Returns the list of image requests the page made.
 */
export async function declareStaticImage(page: Page, layerId: string): Promise<string[]> {
  const requested: string[] = [];
  await editManifest(page, (manifest) => {
    manifest.assets.push({
      asset_id: `static-${layerId}`, format: "png", path: `images/${layerId}.png`, sha256: "0".repeat(64), bytes: 1, width: STATIC_PNG_SIZE, height: STATIC_PNG_SIZE,
    });
  });
  await page.route(`**/sites/${SITE}/images/${layerId}.png`, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/png", body: solidPng(STATIC_PNG_SIZE, [64, 160, 200, 255]) });
  });
  return requested;
}

/** Pixels with some opacity in every canvas matching `selector` (a layer that drew nothing counts 0). */
export function paintedPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((css) => {
    let painted = 0;
    for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>(css))) {
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted += 1;
    }
    return painted;
  }, selector);
}

/**
 * Makes the briefing map's canvas export throw a SecurityError, the way a tainted canvas does: only the `.scr08-map-canvas` context's
 * `drawImage` fails, so the map still renders but cannot be exported (FD-137). Must run before navigation.
 */
export async function failBriefingCanvasExport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...args: unknown[]) => unknown;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const context = getContext.apply(this, args) as CanvasRenderingContext2D | null;
      if (context && args[0] === "2d" && this.classList.contains("scr08-map-canvas")) {
        context.drawImage = () => {
          throw new DOMException("The canvas has been tainted by cross-origin data.", "SecurityError");
        };
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/** `VALIDATE_MANUAL_LEG` requests a page sent to its plan worker (the stub below records them). */
export interface ManualLegRequest {
  type: "VALIDATE_MANUAL_LEG";
  request_id: string;
  plan_revision: number;
  from: string;
  to: string;
  vertices: [number, number][];
  scenario: Record<string, unknown>;
}

/**
 * Stands in for the backend of N-25 in the page: a `Worker` that records `VALIDATE_MANUAL_LEG` and answers it with a
 * `MANUAL_LEG_RESULT` built from the drawn vertices (fixed stub metrics; the page must show them as the worker's, never compute them).
 * Every other message goes to the real worker. Must run before navigation. Read the requests with `manualLegRequests`.
 */
export async function stubManualLegWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const sent: unknown[] = [];
    (window as unknown as { __manualLegRequests: unknown[] }).__manualLegRequests = sent;
    window.Worker = class extends Native {
      override postMessage(message: unknown, ...rest: unknown[]): void {
        const request = message as { type?: string; request_id: string; plan_revision: number; from: string; to: string; vertices: [number, number][] };
        if (request?.type !== "VALIDATE_MANUAL_LEG") return (super.postMessage as (...a: unknown[]) => void)(message, ...rest);
        sent.push(request);
        let along = 0;
        const dist_m = request.vertices.map((v, i) => (along += i === 0 ? 0 : Math.hypot(v[0] - request.vertices[i - 1]![0], v[1] - request.vertices[i - 1]![1])));
        const data = {
          type: "MANUAL_LEG_RESULT", request_id: request.request_id, plan_revision: request.plan_revision,
          leg: {
            from: request.from, to: request.to, status: "OK", distance_m: along, walk_time_min: 21.5, climb_m: 3, descent_m: 1, max_slope_deg: 4.2,
            geometry: request.vertices, cell_path_length: request.vertices.length,
            profile: { dist_m, elev_m: request.vertices.map((_, i) => 100 + i), slope_class: request.vertices.map(() => "ok") },
          },
          warnings: [],
        };
        setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data })), 0);
      }
    } as typeof Worker;
  });
}

export const manualLegRequests = (page: Page): Promise<ManualLegRequest[]> =>
  page.evaluate(() => (window as unknown as { __manualLegRequests?: ManualLegRequest[] }).__manualLegRequests ?? []);

/**
 * The worker finds no route anywhere: every `COMPUTE_PLAN` is answered with a PARTIAL result whose legs are all NO_ROUTE (02 §E.2:
 * any NO_ROUTE leg means status PARTIAL and totals null). Other messages reach the real worker. Must run before navigation.
 */
export async function answerPlansWithNoRoute(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      override postMessage(message: unknown, ...rest: unknown[]): void {
        const request = message as { type?: string; request_id: string; plan_revision: number; scenario: { loop?: boolean }; waypoints: { id: string }[] };
        if (request?.type !== "COMPUTE_PLAN") return (super.postMessage as (...a: unknown[]) => void)(message, ...rest);
        const stops = request.waypoints;
        const pairs = stops.slice(1).map((stop, i) => [stops[i]!.id, stop.id] as const);
        if (request.scenario.loop && stops.length > 1) pairs.push([stops[stops.length - 1]!.id, stops[0]!.id]);
        const data = {
          type: "PLAN_RESULT", request_id: request.request_id, plan_revision: request.plan_revision, status: "PARTIAL",
          legs: pairs.map(([from, to]) => ({ from, to, status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" })),
          totals: null, stops_timeline: [], warnings: [], computed_utc: "2026-11-14T08:00:00Z", timing_ms: { routing: 1, estimates: 0 },
        };
        setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data })), 0);
      }
    } as typeof Worker;
  });
}
