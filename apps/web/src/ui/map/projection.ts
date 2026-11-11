/**
 * Mars projection and custom tile grid registration (02 §B, 02 §C.1; C9 contract; FR-01, D-03).
 *
 * Implements T02.02:
 * - Registers site.crs.proj4 with proj4js using a Mars-specific code (never EPSG:3857 or EPSG:4326).
 *   Only that one definition is added to proj4. `ol/proj/proj4` `register()` is deliberately not used: it
 *   builds transforms between every pair of proj4 definitions, which would create a Mars <-> EPSG:4326 /
 *   EPSG:3857 path (02 §C.1 "Never"). The OpenLayers Projection is added directly and has no transforms;
 *   the sources and the view share it, so none is needed.
 * - Creates an OpenLayers Projection in metres bounded by aoi.extent_m. Its worldExtent is in degrees
 *   (OpenLayers: longitude/latitude), so it is aoi.bbox_geo, not the metre extent.
 * - Sets point resolution to identity (1 projected metre = 1 ground metre at the standard parallel),
 *   preventing OpenLayers from estimating point resolution via Earth-radius geodesics (02 §C.4.2). The
 *   identity is within 1e-3 of the true scale over the whole AOI (checked in tests/ui/projection.test.ts).
 * - Builds custom OpenLayers TileGrid instances from manifest tile_grid configurations.
 */

import proj4 from "proj4";
import { addProjection, get as getProjection, Projection } from "ol/proj.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import type { Site, TileGrid as TileGridSpec } from "@marswalk/protocol";

/** The parts of a Site the projection needs (05 Site: id, working projection, AOI extent). */
export type MarsProjectionSite = Pick<Site, "site_id" | "crs" | "aoi">;

/**
 * Returns the authority:code identifier for a site's local working projection.
 * Always Mars-specific; never EPSG:3857 or EPSG:4326 (02 §C.1).
 */
export function getMarsProjectionCode(siteOrId: MarsProjectionSite | string): string {
  const siteId = typeof siteOrId === "string" ? siteOrId : siteOrId.site_id;
  return `MARS_LOCAL:${siteId}`;
}

/**
 * Registers a site's local working projection with proj4 and OpenLayers.
 *
 * @param site Site manifest entity providing crs.proj4 and aoi.extent_m.
 * @returns Configured OpenLayers Projection instance in metres.
 */
export function registerMarsProjection(site: MarsProjectionSite): Projection {
  const code = getMarsProjectionCode(site);

  // 1. Register with proj4js using the exact manifest string byte-for-byte, under the Mars code only.
  proj4.defs(code, site.crs.proj4);

  // 2. Construct the OpenLayers Projection with local metric properties and add it without any transforms.
  // Point resolution is set directly to nominal resolution to avoid Earth-sphere conversions (02 §C.4.2).
  const projection = new Projection({
    code,
    extent: site.aoi.extent_m,
    units: "m",
    metersPerUnit: 1,
    worldExtent: site.aoi.bbox_geo,
    getPointResolution: (resolution: number): number => resolution,
  });

  addProjection(projection);

  return projection;
}

/**
 * The site's registered working projection, registering it first when it is not yet (several modules need it, and
 * the first one to run must not leave the others with a second, different Projection object).
 */
export function ensureMarsProjection(site: MarsProjectionSite): Projection {
  return getProjection(getMarsProjectionCode(site)) ?? registerMarsProjection(site);
}

/**
 * Planetocentric latitude and east-positive longitude (degrees, longitude in [0, 360)) of a point in the site's
 * working projection, by inverting the registered manifest `+proj=eqc` string on the Mars sphere (02 §C.1).
 * Throws when the site's projection was not registered with `registerMarsProjection`.
 */
export function projectedToLatLonE(
  siteOrId: MarsProjectionSite | string,
  x_m: number,
  y_m: number,
): { lat: number; lon_e: number } {
  const code = getMarsProjectionCode(siteOrId);
  if (!(code in proj4.defs)) {
    throw new Error(`Mars projection ${code} is not registered; call registerMarsProjection first`);
  }
  // The manifest string has no datum, so proj4 applies no datum shift: this is the plain eqc inverse.
  const [lon, lat] = proj4(code).inverse([x_m, y_m]);
  return { lat, lon_e: ((lon % 360) + 360) % 360 };
}

/**
 * Builds an OpenLayers TileGrid from a manifest tile_grid specification (C9 contract).
 *
 * @param tileGridSpec Manifest tile_grid specification.
 * @param extent Optional coverage in working-projection metres (the AOI): OpenLayers then requests no tile outside it.
 * @returns OpenLayers TileGrid configured with origin, resolutions, and tile size.
 */
export function createTileGrid(tileGridSpec: TileGridSpec, extent?: [number, number, number, number]): TileGrid {
  return new TileGrid({
    origin: tileGridSpec.origin_m,
    resolutions: tileGridSpec.resolutions_m,
    tileSize: tileGridSpec.tile_size_px,
    ...(extent ? { extent } : {}),
  });
}
