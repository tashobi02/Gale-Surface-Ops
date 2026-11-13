/**
 * The site's routing grid, read from the bundle the Hab Core serves (package 28, T07.15).
 *
 * The `toggles` check compares what the point inspector shows with the grid cell the manifest describes. The expected
 * values are computed here from the bundle's own binaries (05 §E.1 index, 02 §D.1 sampling), not written into the
 * check: a value the check repeats is a value it cannot catch.
 *
 * Everything is projected metres (Mars CRS IAU_2015:49900); never EPSG:3857, WGS84 or `ol/sphere` (02 §C.4.2).
 */
import type { APIRequestContext } from "@playwright/test";

export interface SiteGridMeta {
  cell_m: number;
  origin_m: [number, number];
  width: number;
  height: number;
  row_order: string;
  elevation_asset?: string;
  slope_p90_asset?: string;
  ti_asset?: string;
}

export interface SiteManifest {
  grid: SiteGridMeta;
  layers?: { layer_id: string; provenance: string; source_ids: string[] }[];
  sources?: { source_id: string }[];
}

/** The grid cell of a point in projected metres, 05 §E.1: `i = floor((origin_y − y)/cell)`, `j = floor((x − origin_x)/cell)`. */
export function gridCellOf(meta: SiteGridMeta, x_m: number, y_m: number): { i: number; j: number } {
  return {
    i: Math.floor((meta.origin_m[1] - y_m) / meta.cell_m),
    j: Math.floor((x_m - meta.origin_m[0]) / meta.cell_m),
  };
}

/** The centre of a cell in projected metres, 05 §E.1 (the inverse of {@link gridCellOf}). */
export function gridCellCentre(meta: SiteGridMeta, i: number, j: number): { x_m: number; y_m: number } {
  return {
    x_m: meta.origin_m[0] + (j + 0.5) * meta.cell_m,
    y_m: meta.origin_m[1] - (i + 0.5) * meta.cell_m,
  };
}

/** Row-major offset of a cell, north up (05 §C RoutingGrid). */
export function gridOffset(meta: SiteGridMeta, i: number, j: number): number {
  return i * meta.width + j;
}

/** The manifest of a site, as the Hab Core serves it. */
export async function fetchManifest(request: APIRequestContext, site: string): Promise<SiteManifest> {
  const response = await request.get(`/sites/${site}/site-manifest.json`);
  if (!response.ok()) throw new Error(`the manifest of ${site} answers ${response.status()}`);
  return (await response.json()) as SiteManifest;
}

/** The site's elevation grid: `f32` values, row-major, north up (05 §C). */
export async function fetchElevation(request: APIRequestContext, site: string, meta: SiteGridMeta): Promise<Float32Array> {
  const response = await request.get(`/sites/${site}/grid/elevation.f32`);
  if (!response.ok()) throw new Error(`the elevation grid of ${site} answers ${response.status()}`);
  const buffer = new Float32Array(await response.body());
  return buffer;
}

/** The site's slope (P90) grid: `u8` values, degrees × 4, 255 for no data (05 §C). */
export async function fetchSlopeP90(request: APIRequestContext, site: string): Promise<Uint8Array> {
  const response = await request.get(`/sites/${site}/grid/slope_p90.u8`);
  if (!response.ok()) throw new Error(`the slope grid of ${site} answers ${response.status()}`);
  return new Uint8Array(await response.body());
}

/** The site's flag grid: one `u8` bitfield per cell (05 §C Flag bits). */
export async function fetchFlags(request: APIRequestContext, site: string): Promise<Uint8Array> {
  const response = await request.get(`/sites/${site}/grid/flags.u8`);
  if (!response.ok()) throw new Error(`the flag grid of ${site} answers ${response.status()}`);
  return new Uint8Array(await response.body());
}

/** The slope in degrees of a `u8` cell value, or null for the 255 no-data code (05 §C). */
export function slopeDegOf(raw: number): number | null {
  return raw === 255 ? null : raw / 4;
}

/**
 * The elevation at a point, bilinearly between cell centres (02 §D.1, `interpolateElevation`): the same interpolation
 * the worker runs, so the check compares like with like.
 */
export function interpolateElevation(meta: SiteGridMeta, elevation: Float32Array, x_m: number, y_m: number): number {
  const u = (x_m - meta.origin_m[0]) / meta.cell_m - 0.5;
  const v = (meta.origin_m[1] - y_m) / meta.cell_m - 0.5;
  const j0 = Math.max(0, Math.min(meta.width - 1, Math.floor(u)));
  const j1 = Math.max(0, Math.min(meta.width - 1, j0 + 1));
  const i0 = Math.max(0, Math.min(meta.height - 1, Math.floor(v)));
  const i1 = Math.max(0, Math.min(meta.height - 1, i0 + 1));
  const fx = j0 === j1 ? 0 : Math.max(0, Math.min(1, u - j0));
  const fy = i0 === i1 ? 0 : Math.max(0, Math.min(1, v - i0));
  const z00 = elevation[i0 * meta.width + j0]!;
  const z01 = elevation[i0 * meta.width + j1]!;
  const z10 = elevation[i1 * meta.width + j0]!;
  const z11 = elevation[i1 * meta.width + j1]!;
  return (1 - fx) * (1 - fy) * z00 + fx * (1 - fy) * z01 + (1 - fx) * fy * z10 + fx * fy * z11;
}
