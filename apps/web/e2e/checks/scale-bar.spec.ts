/**
 * Check `scale-bar` (replaces T02.04).
 * The scale line's metres per pixel equals the view resolution within 1 %. With `E2E_SITE=gale_boxwork` the T01.03 reference
 * crater, measured on the map between two rim points in projected metres, matches its DEM-measured size within 2 % at every
 * level where it is visible; on F4 only the resolution check runs (feasibility/dem-quality.md, FD-105).
 * The spike page exposes `window.__spike` (resolution, setZoom, setCenter, pixelOf); it is built only when `MARSWALK_SPIKE=1`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RESOLUTION_TOLERANCE = 0.01;
const CRATER_TOLERANCE = 0.02;

/** The repo root: the check reads the T01.03 reference feature and the site manifest from the tree, not from a constant. */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface SpikeHook {
  levels(): number;
  resolution(): number;
  setZoom(z: number): void;
  setCenter(x_m: number, y_m: number): void;
  pixelOf(x_m: number, y_m: number): [number, number] | null;
}

/**
 * The reference feature from `docs/ops/feasibility/dem-quality.md` (T01.03). Nothing here is written out by hand: the two rim
 * endpoints and the DEM-measured length are read from that document, which is the only place the data lead recorded them.
 */
interface ReferenceFeature {
  /** The rim endpoints in the source raster's own CRS (the `E ..., N ...` the document records). */
  west: { e: number; n: number };
  east: { e: number; n: number };
  /** The DEM-measured length in the working projection, metres. */
  length_m: number;
}

/** Parse the reference feature out of the feasibility document. Throws when the document no longer holds it. */
function readReferenceFeature(): ReferenceFeature {
  const doc = readFileSync(join(repoRoot, "docs/ops/feasibility/dem-quality.md"), "utf8");
  const rim = (label: string): { e: number; n: number } => {
    const line = doc.split("\n").find(row => row.startsWith(`| ${label} |`));
    if (!line) throw new Error(`dem-quality.md has no "${label}" row`);
    // The document writes the negative sign as U+2212 (minus sign), not a hyphen.
    const match = /E\s+(-?[\d.]+),\s*N\s+([−-]?[\d.]+)/.exec(line);
    if (!match) throw new Error(`dem-quality.md's "${label}" row has no "E ..., N ..." pair: ${line}`);
    return { e: Number(match[1]), n: Number(match[2].replace("−", "-")) };
  };
  const lengthLine = doc.split("\n").find(row => row.startsWith("| Length, working projection |"));
  if (!lengthLine) throw new Error("dem-quality.md has no 'Length, working projection' row");
  const length = /([\d.]+)\s*m/.exec(lengthLine);
  if (!length) throw new Error(`dem-quality.md's working-projection length is not a number of metres: ${lengthLine}`);
  return { west: rim("West rim"), east: rim("East rim"), length_m: Number(length[1]) };
}

/** The site's own CRS and AOI, from the served bundle's manifest. */
interface SiteCrs {
  proj4: string;
  radius_m: number;
  lon_0_deg: number;
  lat_0_deg: number;
  lat_ts_deg: number;
  extent_m: [number, number, number, number];
}

function readSiteCrs(siteId: string): SiteCrs {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "data/sites", siteId, "site-manifest.json"), "utf8")) as {
    crs: { proj4: string };
    aoi: { extent_m: [number, number, number, number] };
  };
  const proj4 = manifest.crs.proj4;
  const number = (key: string): number => {
    const match = new RegExp(`\\+${key}=(-?[\\d.]+)`).exec(proj4);
    if (!match) throw new Error(`the site's proj4 has no +${key}: ${proj4}`);
    return Number(match[1]);
  };
  const radius = /R=([\d.]+)/.exec(proj4);
  if (!radius) throw new Error(`the site's proj4 has no +R: ${proj4}`);
  return {
    proj4,
    radius_m: Number(radius[1]),
    lon_0_deg: number("lon_0"),
    lat_0_deg: number("lat_0"),
    lat_ts_deg: number("lat_ts"),
    extent_m: manifest.aoi.extent_m,
  };
}

/**
 * The source raster's own CRS (T01.03's `E, N` metres): the USGS Mars products are equirectangular on the same sphere with
 * `lat_ts=0` and `lon_0=0`, so `E = R·λ` and `N = R·φ`. The radius is the site's own `+R`, so the two share one sphere.
 */
function sourceToGeographic(crs: SiteCrs, e: number, n: number): { lon_deg: number; lat_deg: number } {
  return { lon_deg: (e / crs.radius_m) * (180 / Math.PI), lat_deg: (n / crs.radius_m) * (180 / Math.PI) };
}

/** The site's projected metres for a geographic point, using the manifest's own `+proj=eqc` parameters. */
function geographicToSite(crs: SiteCrs, point: { lon_deg: number; lat_deg: number }): [number, number] {
  const toRad = Math.PI / 180;
  return [
    crs.radius_m * (point.lon_deg - crs.lon_0_deg) * toRad * Math.cos(crs.lat_ts_deg * toRad),
    crs.radius_m * (point.lat_deg - crs.lat_0_deg) * toRad,
  ];
}

test("scale-bar: scale line equals the view resolution within 1 % at every level", async ({ page }) => {
  // The spike page defaults to the real site (FD-086); the harness site is `mock_site` unless E2E_SITE says otherwise.
  await page.goto(`/spike/?site=${process.env.E2E_SITE ?? "mock_site"}`);
  await page.waitForLoadState("networkidle");
  const levels = await page.evaluate(() => {
    const spike = (window as unknown as { __spike?: { levels(): number } }).__spike;
    if (!spike) throw new Error("spike exposes no __spike hook (was the app built with MARSWALK_SPIKE=1?)");
    return spike.levels();
  });
  expect(levels).toBeGreaterThan(1);
  for (let z = 0; z < levels; z += 1) {
    await page.evaluate((level) => (window as unknown as { __spike: { setZoom(z: number): void } }).__spike.setZoom(level), z);
    // The scale line redraws on the next frame after the view changes, so poll for the render, then assert the tolerance.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLElement>(".ol-scale-line-inner");
            const spike = (window as unknown as { __spike: { resolution(): number } }).__spike;
            if (!el?.textContent?.trim()) return Number.POSITIVE_INFINITY;
            const [value, unit] = el.textContent.trim().split(/\s+/);
            const metres = Number(value) * (unit === "km" ? 1000 : 1);
            const resolution = spike.resolution();
            return Math.abs(metres / el.getBoundingClientRect().width - resolution) / resolution;
          }),
        { message: `level ${z}: scale line vs view resolution`, timeout: 3000 },
      )
      .toBeLessThan(RESOLUTION_TOLERANCE);
  }
});

// T02.04 / FR-01 (N-140): the scale bar agrees with the DEM-measured reference crater within 2 % at every tile-grid level
// where the crater is visible. The reference feature and its DEM-measured length come from docs/ops/feasibility/dem-quality.md
// (T01.03); the rim endpoints are converted to site coordinates with the manifest's own CRS, and the on-screen length is
// measured in pixels and converted to metres with the scale line, exactly as T02.04 step 3 says.
test("scale-bar: the reference crater measured on the map matches its DEM size within 2 % at every visible level (T02.04)", async ({ page }) => {
  test.skip(process.env.E2E_SITE !== "gale_boxwork", "needs N-140: the real gale_boxwork bundle (T03.19)");
  const siteId = "gale_boxwork";
  const feature = readReferenceFeature();
  const crs = readSiteCrs(siteId);

  const west = geographicToSite(crs, sourceToGeographic(crs, feature.west.e, feature.west.n));
  const east = geographicToSite(crs, sourceToGeographic(crs, feature.east.e, feature.east.n));

  // The endpoints must be inside the AOI the map serves, or the map cannot show the feature at all.
  const [minX, minY, maxX, maxY] = crs.extent_m;
  for (const [label, point] of [["west", west], ["east", east]] as const) {
    expect(point[0], `the ${label} rim is inside the AOI's x range`).toBeGreaterThanOrEqual(minX);
    expect(point[0], `the ${label} rim is inside the AOI's x range`).toBeLessThanOrEqual(maxX);
    expect(point[1], `the ${label} rim is inside the AOI's y range`).toBeGreaterThanOrEqual(minY);
    expect(point[1], `the ${label} rim is inside the AOI's y range`).toBeLessThanOrEqual(maxY);
  }

  await page.goto(`/spike/?site=${siteId}`);
  await page.waitForLoadState("networkidle");
  const levels = await page.evaluate(() => {
    const spike = (window as unknown as { __spike?: SpikeHook }).__spike;
    if (!spike) throw new Error("spike exposes no __spike hook (was the app built with MARSWALK_SPIKE=1?)");
    return spike.levels();
  });

  const checked: string[] = [];
  const unresolved: string[] = [];
  for (let z = 0; z < levels; z += 1) {
    await page.evaluate((level) => {
      const spike = (window as unknown as { __spike: SpikeHook }).__spike;
      spike.setZoom(level);
    }, z);
    // Centre on the crater so both rims are on screen, then read their pixel positions.
    await page.evaluate(([wx, wy, ex, ey]) => {
      const spike = (window as unknown as { __spike: SpikeHook }).__spike;
      spike.setCenter((wx + ex) / 2, wy);
    }, [west[0], west[1], east[0], east[1]]);
    await page.waitForTimeout(50);

    const measurement = await page.evaluate(([wx, wy, ex, ey]) => {
      const spike = (window as unknown as { __spike: SpikeHook }).__spike;
      const a = spike.pixelOf(wx, wy);
      const b = spike.pixelOf(ex, ey);
      const line = document.querySelector<HTMLElement>(".ol-scale-line-inner");
      if (!a || !b || !line?.textContent?.trim()) return null;
      const [value, unit] = line.textContent.trim().split(/\s+/);
      const pixels = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const resolution = spike.resolution();
      return {
        pixels,
        // T02.04 step 3: the on-screen length is converted to metres with the map's own scale — the view's resolution in
        // metres per pixel, which is the number the scale line reads out. (The line itself is `bar: false`: it shows the
        // distance as text, and its box has no scale, so the label's rounding is checked separately below rather than being
        // multiplied into the measurement.)
        metres: pixels * resolution,
        resolution,
        scaleText: line.textContent.trim(),
        scaleMetres: Number(value) * (unit === "km" ? 1000 : 1),
        scalePixels: line.getBoundingClientRect().width,
      };
    }, [west[0], west[1], east[0], east[1]]);
    if (!measurement) continue;

    // The feature is only measurable where it is actually resolvable on screen. Below a pixel the view cannot show the
    // crater's shape at all, so there is nothing to measure; the level is recorded as unresolved rather than passed.
    if (!Number.isFinite(measurement.pixels) || measurement.pixels < 4) {
      unresolved.push(`level ${z}: ${measurement.pixels.toFixed(2)} px (below one screen pixel of the feature)`);
      continue;
    }

    // The scale line must read out the view's own resolution, to within the rounding of its label. The line names a round
    // number of metres for a fixed bar width, so the label's precision bounds what a reader can measure off it: the line
    // rounds to the nearest 1 m, 10 m, 100 m, 1 km or 5 km, so the tolerance is that rounding.
    const rounding = measurement.scaleMetres >= 1000 ? 500 : measurement.scaleMetres >= 100 ? 50 : measurement.scaleMetres >= 10 ? 5 : 1;
    expect(
      Math.abs(measurement.scaleMetres - measurement.resolution * measurement.scalePixels),
      `level ${z}: the scale line reads "${measurement.scaleText}" but the view is ${measurement.resolution} m/px over ${measurement.scalePixels.toFixed(1)} px`,
    ).toBeLessThanOrEqual(rounding);

    const onScreenMetres = measurement.metres;
    const difference = Math.abs(onScreenMetres - feature.length_m) / feature.length_m;
    expect(
      difference,
      `level ${z}: the crater measures ${onScreenMetres.toFixed(2)} m on the map (${measurement.pixels.toFixed(2)} px at ${measurement.resolution} m/px) against the DEM's ${feature.length_m} m`,
    ).toBeLessThanOrEqual(CRATER_TOLERANCE);
    checked.push(`level ${z}: ${onScreenMetres.toFixed(2)} m (${(difference * 100).toFixed(2)} % off, scale line "${measurement.scaleText}")`);
  }
  // The check is only evidence if it actually measured the feature somewhere.
  expect(checked.length, "the crater was measured at least one level").toBeGreaterThan(0);
  console.log(`scale-bar reference crater (${feature.length_m} m): ${checked.join("; ")}`);
  if (unresolved.length) console.log(`not resolvable on screen: ${unresolved.join("; ")}`);
});
