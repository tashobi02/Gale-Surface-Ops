/// <reference types="node" />
/**
 * Which site and scenario the harness runs on (FD-198).
 *
 * Default: the F4 `mock_site` with the Hab Core's fake scenario. `E2E_SITE=gale_boxwork` uses the real site and
 * `scenarios/storm-sol4190` when their files exist; otherwise the run reports "skipped: bundle absent" and exits 0.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export const REAL_SITE = "gale_boxwork";
export const REAL_SCENARIO = "storm-sol4190";

export const e2eSite = (): string => process.env.E2E_SITE ?? "mock_site";

/** Why the requested bundle cannot run, or null when it can (or when the F4 default is requested). */
export function bundleAbsentReason(repoRoot: string): string | null {
  if (e2eSite() !== REAL_SITE) return null;
  const files = [
    join(repoRoot, "data", "sites", REAL_SITE, "site-manifest.json"),
    join(repoRoot, "data", "sites", REAL_SITE, "grid"),
    join(repoRoot, "data", "sites", REAL_SITE, "tiles"),
    join(repoRoot, "scenarios", REAL_SCENARIO, "scenario.json"),
  ];
  const missing = files.filter((f) => !existsSync(f));
  return missing.length > 0 ? `bundle absent (${REAL_SITE}: ${missing.map((m) => m.slice(repoRoot.length + 1)).join(", ")})` : null;
}

/** Site id of the throwaway site below; it matches the app's `^[a-z0-9_]+$` allowlist (FD-086). */
export const NO_MANIFEST_SITE = "e2e_no_manifest";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * Runs `fn` while `data/sites/e2e_no_manifest/` exists: a copy of the F4 `mock_site` whose `site-manifest.json` has been
 * deleted, so the Hab Core answers 404 for exactly that file (SCR-00, 03 §D "Boot asset failure"; T14.04). The folder is
 * removed afterwards, also when `fn` throws.
 */
export async function withManifestlessSite<T>(fn: (siteId: string, manifestPath: string) => Promise<T>): Promise<T> {
  const dir = join(REPO_ROOT, "data", "sites", NO_MANIFEST_SITE);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(REPO_ROOT, "data", "sites", "mock_site"), dir, { recursive: true });
  rmSync(join(dir, "site-manifest.json"));
  try {
    return await fn(NO_MANIFEST_SITE, `sites/${NO_MANIFEST_SITE}/site-manifest.json`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
