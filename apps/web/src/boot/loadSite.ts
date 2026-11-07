/**
 * Site loading: fetch manifest, parse, build O(1) lookup maps and load POIs (02 §E.1, 05 §E.1, 03 §D).
 * Implemented by T07.02 (FR-01, FR-16).
 */
import type {
  Asset,
  DataSource,
  Layer,
  POIFeature,
  Site,
} from "@marswalk/protocol";
import {
  URL_PARAMS,
  type BootProblem,
  type LoadedSite,
} from "../ui/context";

/**
 * Boot error raised when required site assets fail to fetch or parse (03 §D).
 */
export class BootError extends Error {
  readonly problem: BootProblem;

  constructor(problem: BootProblem) {
    super(problem.message);
    this.name = "BootError";
    this.problem = problem;
  }
}

/** Default site id when neither parameter nor ?site= is specified. */
export const DEFAULT_SITE_ID = "mock_site";

/**
 * Load a site manifest and associated POIs relative to the app base.
 * Builds lookup maps for layers, sources, assets, and POIs for O(1) access (05 §E.1).
 */
export async function loadSite(siteId?: string): Promise<LoadedSite> {
  let id = siteId;
  if (!id && typeof window !== "undefined" && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const paramSite = params.get(URL_PARAMS.SITE);
    if (paramSite) id = paramSite;
  }
  if (!id) {
    id = DEFAULT_SITE_ID;
  }

  const manifestPath = `sites/${id}/site-manifest.json`;
  let site: Site;

  try {
    const res = await fetch(manifestPath);
    if (!res.ok) {
      throw new BootError({
        code: "MANIFEST_NOT_FOUND",
        message: `Failed to fetch site manifest: ${manifestPath} (${res.status} ${res.statusText})`,
        missingFile: manifestPath,
      });
    }
    site = (await res.json()) as Site;
  } catch (err) {
    if (err instanceof BootError) throw err;
    throw new BootError({
      code: "MANIFEST_LOAD_FAILED",
      message: `Failed to parse site manifest: ${manifestPath}`,
      missingFile: manifestPath,
      details: err,
    });
  }

  // Build lookup maps (05 §E.1)
  const layers = new Map<string, Layer>();
  for (const layer of site.layers ?? []) {
    layers.set(layer.layer_id, layer);
  }

  const sources = new Map<string, DataSource>();
  for (const source of site.sources ?? []) {
    sources.set(source.source_id, source);
  }

  const assets = new Map<string, Asset>();
  for (const asset of site.assets ?? []) {
    // Resolve asset path relative to the site folder (05 §C Asset path)
    const resolvedPath = `sites/${id}/${asset.path}`;
    assets.set(asset.asset_id, {
      ...asset,
      path: resolvedPath,
    });
  }

  const pois = new Map<string, POIFeature>();

  // Fetch POIs from pois_asset if declared (02 §E.1)
  if (site.pois_asset) {
    const poiAsset = assets.get(site.pois_asset);
    const poiPath = poiAsset ? poiAsset.path : `sites/${id}/vectors/pois.geojson`;

    try {
      const poiRes = await fetch(poiPath);
      if (!poiRes.ok) {
        throw new BootError({
          code: "POI_ASSET_NOT_FOUND",
          message: `Failed to fetch POI asset: ${poiPath} (${poiRes.status} ${poiRes.statusText})`,
          missingFile: poiPath,
        });
      }
      const poiGeoJson = (await poiRes.json()) as {
        type: string;
        features: POIFeature[];
      };
      if (Array.isArray(poiGeoJson.features)) {
        for (const feat of poiGeoJson.features) {
          if (feat.properties?.poi_id) {
            pois.set(feat.properties.poi_id, feat);
          }
        }
      }
    } catch (err) {
      if (err instanceof BootError) throw err;
      throw new BootError({
        code: "POI_LOAD_FAILED",
        message: `Failed to parse POI asset: ${poiPath}`,
        missingFile: poiPath,
        details: err,
      });
    }
  }

  return {
    site,
    layers,
    sources,
    assets,
    pois,
  };
}
