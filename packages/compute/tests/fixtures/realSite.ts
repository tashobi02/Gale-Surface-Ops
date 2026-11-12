/**
 * Real-site loading for the package-24 checks and benchmarks (T05.28, T05b.05, T05b.20; BD-03).
 *
 * Reads `data/sites/gale_boxwork/` straight from disk with the manifest's own asset paths, so a test or bench sees
 * the arrays a browser or the Hab Core would. Nothing here is science: it only loads, crops and describes the machine.
 * Callers skip with a printed reason when `hasRealBundle` is false (clean clone, no SSD).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoadedGridMeta, RoutingGrid } from "@marswalk/protocol";
import { loadGrid, type LoadedGrid } from "../../src/grid";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "../../../..");
export const REAL_SITE_DIR = path.join(ROOT, "data/sites/gale_boxwork");
export const REAL_MANIFEST_PATH = path.join(REAL_SITE_DIR, "site-manifest.json");
/** F5 (T03.21, BD-54): ten seeded cells read back from the bundle arrays by `make_real_grid_cells.py`. */
export const F5_PATH = path.join(ROOT, "pipeline/tests/fixtures/real-grid-cells.json");

export const hasRealBundle = fs.existsSync(REAL_MANIFEST_PATH) && fs.existsSync(path.join(REAL_SITE_DIR, "grid/elevation.f32"));

export interface RealManifest {
  data_version: string;
  grid: RoutingGrid;
  crs: { proj4: string };
  default_start: { x_m: number; y_m: number };
  hab_candidates: { candidate_id: string; rank: number; hab_mast: { x_m: number; y_m: number; height_m: number } }[];
  assets: { asset_id: string; path: string }[];
}

export function readManifest(siteDir: string = REAL_SITE_DIR): RealManifest {
  return JSON.parse(fs.readFileSync(path.join(siteDir, "site-manifest.json"), "utf8")) as RealManifest;
}

function arrayBufferOf(file: string): ArrayBuffer {
  const raw = fs.readFileSync(file);
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

/** Load a site's grid arrays from a site directory using its site-manifest.json. */
export function loadSiteGrid(siteDir: string): LoadedGrid {
  const manifest = readManifest(siteDir);
  const meta: LoadedGridMeta = { ...manifest.grid, proj4: manifest.crs.proj4 };
  const assets = new Map(manifest.assets.map((a) => [a.asset_id, a.path]));
  const file = (assetId: string | undefined, fallback: string): string => path.join(siteDir, assets.get(assetId ?? "") ?? fallback);
  const optional = (assetId: string | undefined, fallback: string): ArrayBuffer | undefined => {
    const p = file(assetId, fallback);
    return fs.existsSync(p) ? arrayBufferOf(p) : undefined;
  };
  return loadGrid(meta, {
    elevation: arrayBufferOf(file(meta.elevation_asset, "grid/elevation.f32")),
    slopeP90: arrayBufferOf(file(meta.slope_p90_asset, "grid/slope_p90.u8")),
    slopeMax: arrayBufferOf(file(meta.slope_max_asset, "grid/slope_max.u8")),
    flags: arrayBufferOf(file(meta.flags_asset, "grid/flags.u8")),
    ti: optional(meta.ti_asset, "grid/ti_100m.f32"),
    commHab: optional(meta.comm_hab_asset, "grid/comm_hab.u8") ?? new ArrayBuffer(meta.width * meta.height),
  });
}

/** A `width` x `height` window of a grid whose top-left cell is (row0, col0). TI is dropped (it is on a 100 m lattice). */
export function cropGrid(grid: LoadedGrid, row0: number, col0: number, width: number, height: number): LoadedGrid {
  const { width: W, height: H, cell_m, origin_m } = grid.meta;
  if (row0 < 0 || col0 < 0 || row0 + height > H || col0 + width > W) throw new RangeError("crop window outside the grid");
  const pick = <T extends Float32Array | Uint8Array>(src: T): T => {
    const out = new (src.constructor as new (n: number) => T)(width * height);
    for (let r = 0; r < height; r++) out.set(src.subarray((row0 + r) * W + col0, (row0 + r) * W + col0 + width), r * width);
    return out;
  };
  return {
    meta: { ...grid.meta, width, height, origin_m: [origin_m[0] + col0 * cell_m, origin_m[1] - row0 * cell_m] },
    elevation: pick(grid.elevation),
    slopeP90: pick(grid.slopeP90),
    slopeMax: pick(grid.slopeMax),
    flags: pick(grid.flags),
    commHab: pick(grid.commHab),
  };
}

/** Seeded PRNG (Mulberry32) for reproducible point generation. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The BD-03 machine line: CPU brand, cores, memory, OS and Node, beside every timing. */
export function machineLine(): string {
  let brand = cpus()[0]?.model ?? "unknown CPU";
  if (platform() === "darwin") {
    try {
      brand = execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim() || brand;
    } catch {
      /* keep os.cpus() */
    }
  }
  return `${brand}, ${cpus().length} cores, ${(totalmem() / 2 ** 30).toFixed(0)} GiB RAM, ${platform()} ${release()}, node ${process.version}`;
}

export function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}
