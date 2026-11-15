/**
 * Site validation (T14.03, 05 §E.3–E.4; docs/contracts/site-validation.md).
 * Required assets are probed locally at boot. Development builds additionally hash every
 * available asset using Web Crypto; a tile-root checksum covers its C9 index.json.
 * Missing optional assets remain unavailable without preventing routing (FR-16).
 */
import type { Site } from "@marswalk/protocol";
import type { BootProblem } from "../ui/context";
import { isSafeRelativePath } from "./loadSite";

/** 05 §E.4 and the shipped manifest schema use major version 1. */
export const SITE_SCHEMA_MAJOR = "1";

export interface SiteValidationOptions {
  dev?: boolean;
  fetchImpl?: (url: string, options?: RequestInit) => Promise<Response>;
  subtle?: Pick<SubtleCrypto, "digest">;
  /** Removes the failed optional asset from the loaded lookup, keeping the manifest intact. */
  onUnavailableAsset?: (assetId: string) => void;
}

export async function validateSite(site: Site, options: SiteValidationOptions = {}): Promise<BootProblem[]> {
  const manifest = `sites/${site.site_id}/site-manifest.json`;
  if (!/^[a-z0-9_]+$/.test(site.site_id)) {
    return [{ code: "INVALID_SITE_ID", message: "The site id must name a local site folder" }];
  }
  if (!/^\d+\.\d+\.\d+$/.test(site.schema_version) || site.schema_version.split(".")[0] !== SITE_SCHEMA_MAJOR) {
    return [{ code: "SCHEMA_MAJOR_MISMATCH", message: `Site schema ${site.schema_version} is not supported; this app requires major ${SITE_SCHEMA_MAJOR}`, missingFile: manifest }];
  }

  const required = new Set([
    site.grid.elevation_asset, site.grid.slope_p90_asset, site.grid.slope_max_asset,
    site.grid.flags_asset, site.grid.comm_hab_asset, site.pois_asset, site.traverse_asset,
    ...site.layers.filter(layer => !layer.optional).map(layer => layer.asset_id),
  ]);
  const assets = new Map(site.assets.map(asset => [asset.asset_id, asset]));
  const sources = new Set(site.sources.map(source => source.source_id));
  const layers = new Set(site.layers.map(layer => layer.layer_id));
  const problems: BootProblem[] = [];
  for (const layer of site.layers) {
    for (const id of layer.source_ids) {
      if (!sources.has(id)) problems.push({ code: "REFERENCE_UNRESOLVED", message: `Layer ${layer.layer_id} names source ${id}, which is not listed in the manifest`, missingFile: manifest });
    }
    for (const id of layer.derived_from ?? []) {
      if (!layers.has(id)) problems.push({ code: "REFERENCE_UNRESOLVED", message: `Layer ${layer.layer_id} derives from ${id}, which is not listed in the manifest`, missingFile: manifest });
    }
    if (!assets.has(layer.asset_id) && layer.optional) options.onUnavailableAsset?.(layer.asset_id);
  }
  for (const candidate of site.hab_candidates ?? []) {
    required.add(candidate.comm_hab_asset);
    for (const id of candidate.source_ids) {
      if (!sources.has(id)) problems.push({ code: "REFERENCE_UNRESOLVED", message: `Hab candidate ${candidate.candidate_id} names source ${id}, which is not listed in the manifest`, missingFile: manifest });
    }
  }
  for (const constant of site.env_constants) {
    if (!sources.has(constant.source_id)) problems.push({ code: "REFERENCE_UNRESOLVED", message: `Environmental constant ${constant.const_id} names source ${constant.source_id}, which is not listed in the manifest`, missingFile: manifest });
  }
  for (const id of required) {
    if (!assets.has(id)) problems.push({ code: "ASSET_UNRESOLVED", message: `Required asset ${id} is not listed in the site manifest`, missingFile: manifest });
  }
  if (assets.size !== site.assets.length) problems.push({ code: "ASSET_ID_DUPLICATE", message: "The site manifest repeats an asset id", missingFile: manifest });
  for (const asset of site.assets) {
    if (!isSafeRelativePath(asset.path)) problems.push({ code: "ASSET_PATH_INVALID", message: `Asset ${asset.asset_id} must have a relative path inside the local site folder`, missingFile: manifest });
  }
  // No transport call is made before the entire manifest's local paths have passed validation.
  if (problems.length) return problems;

  const dev = options.dev ?? import.meta.env.DEV;
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  const unavailable = (id: string, problem: BootProblem): void => {
    if (required.has(id)) problems.push(problem);
    else options.onUnavailableAsset?.(id);
  };
  for (const asset of site.assets) {
    // BD-83: optional assets are not probed in production; their normal loaders report availability.
    if (!dev && !required.has(asset.asset_id)) continue;
    const path = asset.path + (asset.format === "tiles" ? "/index.json" : "");
    const url = `sites/${site.site_id}/${path}`;
    try {
      const response = await fetchImpl(url, { method: dev ? "GET" : "HEAD", redirect: "error" });
      if (!response.ok) {
        unavailable(asset.asset_id, { code: "ASSET_MISSING", message: `Asset could not be loaded: ${url} (HTTP ${response.status})`, missingFile: url });
        continue;
      }
      if (!dev) continue;
      if (!subtle) {
        problems.push({ code: "CHECKSUM_UNAVAILABLE", message: "Development asset verification requires Web Crypto on localhost or a secure origin", missingFile: url });
        continue;
      }
      const bytes = await response.arrayBuffer();
      const hash = await subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== asset.sha256.toLowerCase()) {
        unavailable(asset.asset_id, { code: "ASSET_CHECKSUM_MISMATCH", message: `Asset checksum does not match the manifest: ${url}`, missingFile: url });
      }
    } catch (error) {
      unavailable(asset.asset_id, { code: "ASSET_LOAD_FAILED", message: `Asset could not be loaded: ${url}`, missingFile: url, details: error });
    }
  }
  return problems;
}
