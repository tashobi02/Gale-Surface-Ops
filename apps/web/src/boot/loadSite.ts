/**
 * Site loading: fetch manifest, validate its shape, build O(1) lookup maps and load POIs (02 §E.1, 05 §E.1, 03 §D).
 * Implemented by T07.02 (FR-01, FR-16).
 *
 * - The site id comes from the argument, `?site=` or the default, and must match `^[a-z0-9_]+$` (the C2 `site_id`
 *   pattern), so it can never leave the `sites/` folder.
 * - The manifest is parsed into a `Site` only after `parseSiteManifest` checks the fields boot relies on (the C2
 *   required keys, ids, the AOI, tile grids, asset paths). Schema-major and SHA-256 checks stay with `validateSite`
 *   (T14.03); any failure is a `BootError` naming the file or the field (03 §D "Boot asset failure").
 * - `Asset.path` stays as the manifest has it; the fetchable address is the separate `url` (C10 v2 `LoadedAsset`).
 * - POIs come from the asset `pois_asset` names; a missing or unknown `pois_asset` is a BootProblem, never a
 *   guessed path.
 */
import type { DataSource, Layer, POIFeature, Site } from "@marswalk/protocol";
import { URL_PARAMS, type BootProblem, type LoadedAsset, type LoadedSite } from "../ui/context";

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

/**
 * Site id used when neither the argument nor `?site=` gives one: the real site, D-01 (FD-086). `?site=mock_site` loads the
 * F4 fixture for tests and the harness. A missing bundle is SCR-00 naming the manifest path.
 */
export const DEFAULT_SITE_ID = "gale_boxwork";

/** The C2 `site_id` pattern (05 §C Site): the only ids `?site=` may name. */
export const SITE_ID_PATTERN = /^[a-z0-9_]+$/;

/** Top-level keys the C2 schema requires (schemas/site-manifest.schema.json; checked against it in the tests). */
export const SITE_REQUIRED_KEYS = [
  "schema_version",
  "site_id",
  "name",
  "body",
  "data_version",
  "crs",
  "aoi",
  "default_start",
  "layers",
  "sources",
  "grid",
  "env_constants",
  "pois_asset",
  "traverse_asset",
  "assets",
] as const;

/**
 * The site id to load: `explicit`, else `?site=` in `search`, else the default. Throws a BootError (code
 * `INVALID_SITE_ID`) for an id outside `^[a-z0-9_]+$`; an empty `?site=` counts as absent.
 */
export function resolveSiteId(search: string, explicit?: string): string {
  const fromUrl = new URLSearchParams(search).get(URL_PARAMS.SITE);
  const id = explicit ?? (fromUrl ? fromUrl : DEFAULT_SITE_ID);
  if (!SITE_ID_PATTERN.test(id)) {
    throw new BootError({
      code: "INVALID_SITE_ID",
      message: `Site id ${JSON.stringify(id)} is not allowed; it must match ${SITE_ID_PATTERN.source}`,
    });
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNumberTuple = (value: unknown, length: number): boolean =>
  Array.isArray(value) && value.length === length && value.every(isFiniteNumber);

/** True when a manifest path stays inside the site folder: relative, no `..` segment, no scheme. */
export function isSafeRelativePath(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path);
    return decoded.length > 0 && decoded.trim() === decoded &&
      !decoded.startsWith("/") && !decoded.includes("\\") &&
      // URL parsers remove tabs/newlines before resolving ".."; trailing whitespace is stripped too.
      !/[\u0000-\u001f\u007f]/.test(decoded) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(decoded) && !/[?#]/.test(decoded) &&
      !decoded.split("/").some(part => part === ".." || part === "." || part === "");
  } catch {
    return false;
  }
}

/** Every problem found in a manifest, as `path: what is wrong`. Empty means the fields boot relies on are present. */
function manifestProblems(json: unknown): string[] {
  if (!isRecord(json)) return ["manifest: not a JSON object"];
  const problems: string[] = [];
  const need = (ok: boolean, path: string, expected: string): void => {
    if (!ok) problems.push(`${path}: ${expected}`);
  };

  for (const key of SITE_REQUIRED_KEYS) need(key in json, key, "required, missing");

  if ("schema_version" in json) need(isString(json.schema_version) && /^\d+\.\d+\.\d+$/.test(json.schema_version), "schema_version", "a SemVer string");
  if ("site_id" in json) need(isString(json.site_id) && SITE_ID_PATTERN.test(json.site_id), "site_id", `a string matching ${SITE_ID_PATTERN.source}`);
  if ("name" in json) need(isNonEmptyString(json.name), "name", "a non-empty string");
  if ("body" in json) need(json.body === "mars", "body", 'the string "mars"');
  if ("data_version" in json) need(isNonEmptyString(json.data_version), "data_version", "a non-empty string");
  if ("pois_asset" in json) need(isNonEmptyString(json.pois_asset), "pois_asset", "an asset id (string)");
  if ("traverse_asset" in json) need(isNonEmptyString(json.traverse_asset), "traverse_asset", "an asset id (string)");

  if ("crs" in json) {
    const crs = json.crs;
    need(isRecord(crs) && isNonEmptyString(crs.proj4), "crs.proj4", "a non-empty string");
    need(isRecord(crs) && isNonEmptyString(crs.base), "crs.base", "a non-empty string");
  }
  if ("aoi" in json) {
    const aoi = json.aoi;
    need(isRecord(aoi) && isNumberTuple(aoi.extent_m, 4), "aoi.extent_m", "four finite numbers");
    need(isRecord(aoi) && isNumberTuple(aoi.bbox_geo, 4), "aoi.bbox_geo", "four finite numbers");
  }
  if ("default_start" in json) {
    const start = json.default_start;
    need(isRecord(start) && isFiniteNumber(start.x_m) && isFiniteNumber(start.y_m), "default_start", "{x_m, y_m} finite numbers");
    need(isRecord(start) && isString(start.label), "default_start.label", "a string");
  }
  if ("grid" in json) need(isRecord(json.grid), "grid", "an object");
  if ("env_constants" in json) need(Array.isArray(json.env_constants), "env_constants", "an array");

  /** An array of records whose `idKey` is a unique non-empty string. */
  const collection = (key: "layers" | "sources" | "assets", idKey: string, check?: (item: Record<string, unknown>, at: string) => void): void => {
    if (!(key in json)) return;
    const items = json[key];
    if (!Array.isArray(items)) {
      problems.push(`${key}: an array`);
      return;
    }
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const at = `${key}[${index}]`;
      if (!isRecord(item)) {
        problems.push(`${at}: an object`);
        return;
      }
      const id = item[idKey];
      if (!isNonEmptyString(id)) {
        problems.push(`${at}.${idKey}: a non-empty string`);
        return;
      }
      if (seen.has(id)) problems.push(`${at}.${idKey}: duplicate id ${JSON.stringify(id)}`);
      seen.add(id);
      check?.(item, at);
    });
  };

  collection("layers", "layer_id", (layer, at) => {
    need(isNonEmptyString(layer.kind), `${at}.kind`, "a non-empty string");
    if (layer.kind === "raster_tiles") {
      const grid = layer.tile_grid;
      const valid =
        isRecord(grid) &&
        isNumberTuple(grid.origin_m, 2) &&
        Array.isArray(grid.resolutions_m) &&
        grid.resolutions_m.length > 0 &&
        grid.resolutions_m.every((r) => isFiniteNumber(r) && r > 0) &&
        isFiniteNumber(grid.tile_size_px) &&
        grid.tile_size_px > 0 &&
        isNonEmptyString(grid.format);
      need(valid, `${at}.tile_grid`, "origin_m [x, y], non-empty positive resolutions_m, tile_size_px > 0, format");
    }
  });
  collection("sources", "source_id");
  collection("assets", "asset_id", (asset, at) => {
    need(isString(asset.path) && isSafeRelativePath(asset.path), `${at}.path`, "a relative path inside the site folder (no leading /, no .., no scheme)");
  });

  return problems;
}

/**
 * Check that `json` has the shape of a `Site` for the fields boot relies on and return it typed. Throws a BootError
 * (code `MANIFEST_INVALID`) listing every problem. Not a full C2 validation: schema version and checksums are
 * `validateSite` (T14.03).
 */
export function parseSiteManifest(json: unknown): Site {
  assertSite(json);
  return json;
}

function assertSite(json: unknown): asserts json is Site {
  const problems = manifestProblems(json);
  if (problems.length > 0) {
    throw new BootError({
      code: "MANIFEST_INVALID",
      message: `Site manifest is invalid: ${problems.join("; ")}`,
      details: problems,
    });
  }
}

/** Fetch a JSON file; failures are BootErrors that name the file. */
async function fetchJson(url: string, codes: { notFound: string; load: string; parse: string }, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new BootError({ code: codes.load, message: `Failed to fetch ${what}: ${url}`, missingFile: url, details: error });
  }
  if (!response.ok) {
    throw new BootError({
      code: codes.notFound,
      message: `Failed to fetch ${what}: ${url} (${response.status} ${response.statusText})`,
      missingFile: url,
    });
  }
  try {
    return await response.json();
  } catch (error) {
    throw new BootError({ code: codes.parse, message: `Failed to parse ${what}: ${url}`, missingFile: url, details: error });
  }
}

/** A GeoJSON Point feature with a `properties.poi_id` (02 §E.1: working-projection metres; 05 §C POI). */
function isPoiFeature(value: unknown): value is POIFeature {
  if (!isRecord(value) || value.type !== "Feature") return false;
  const { geometry, properties } = value;
  return (
    isRecord(geometry) &&
    geometry.type === "Point" &&
    isNumberTuple(geometry.coordinates, 2) &&
    isRecord(properties) &&
    isNonEmptyString(properties.poi_id)
  );
}

/** POI features keyed by `poi_id`; anything that is not a FeatureCollection of POI features is a BootProblem. */
function parsePois(json: unknown, url: string): Map<string, POIFeature> {
  const invalid = (reason: string): BootError =>
    new BootError({ code: "POI_INVALID", message: `POI file ${url} is invalid: ${reason}`, missingFile: url });
  if (!isRecord(json) || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    throw invalid("not a GeoJSON FeatureCollection");
  }
  const pois = new Map<string, POIFeature>();
  json.features.forEach((feature: unknown, index) => {
    if (!isPoiFeature(feature)) throw invalid(`features[${index}] is not a Point feature with properties.poi_id`);
    const id = feature.properties.poi_id;
    if (pois.has(id)) throw invalid(`duplicate poi_id ${JSON.stringify(id)}`);
    pois.set(id, feature);
  });
  return pois;
}

/**
 * Load a site manifest and its POIs relative to the app base and build the lookup maps for layers, sources, assets
 * and POIs (05 §E.1). Throws BootError for every failure.
 */
export async function loadSite(siteId?: string): Promise<LoadedSite> {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const id = resolveSiteId(search, siteId);

  const manifestUrl = `sites/${id}/site-manifest.json`;
  const site = parseSiteManifest(
    await fetchJson(
      manifestUrl,
      { notFound: "MANIFEST_NOT_FOUND", load: "MANIFEST_LOAD_FAILED", parse: "MANIFEST_PARSE_FAILED" },
      "site manifest",
    ),
  );
  if (site.site_id !== id) {
    throw new BootError({
      code: "SITE_ID_MISMATCH",
      message: `Manifest ${manifestUrl} is for site ${JSON.stringify(site.site_id)}, not ${JSON.stringify(id)}`,
      missingFile: manifestUrl,
    });
  }

  const layers = new Map<string, Layer>(site.layers.map((layer) => [layer.layer_id, layer]));
  const sources = new Map<string, DataSource>(site.sources.map((source) => [source.source_id, source]));
  const assets = new Map<string, LoadedAsset>(
    site.assets.map((asset) => [asset.asset_id, { ...asset, url: `sites/${id}/${asset.path}` }]),
  );

  const poiAsset = assets.get(site.pois_asset);
  if (!poiAsset) {
    throw new BootError({
      code: "POI_ASSET_UNRESOLVED",
      message: `Manifest ${manifestUrl} names pois_asset ${JSON.stringify(site.pois_asset)}, but no asset has that id`,
      missingFile: manifestUrl,
    });
  }
  const pois = parsePois(
    await fetchJson(
      poiAsset.url,
      { notFound: "POI_ASSET_NOT_FOUND", load: "POI_LOAD_FAILED", parse: "POI_PARSE_FAILED" },
      "POI asset",
    ),
    poiAsset.url,
  );

  return { site, layers, sources, assets, pois };
}
