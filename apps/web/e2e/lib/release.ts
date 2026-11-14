/// <reference types="node" />
/**
 * Helpers of the browser release verification (backend package 28; T14.06-T14.10, T28.03, T28.05, T31.08).
 * Backend-owned checks (`checks/release-*.spec.ts`); they reuse the frontend harness helpers and add only what those lack.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem, type } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { HAB_ORIGIN } from "./hab";

export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
export const e2eSiteId = (): string => process.env.E2E_SITE ?? "mock_site";

/** A figure the spec states (02 §F): read from the document, so no number is written in a check. */
export function specFigure(pattern: RegExp, file = "docs/specs/02_Technical_Requirements_Document.md"): number {
  const match = pattern.exec(readFileSync(join(REPO_ROOT, file), "utf8"));
  if (!match) throw new Error(`${file} does not match ${String(pattern)}`);
  return Number(match[1]!.replace(/,/g, ""));
}

/** NFR-09: "JS ≤ 600 KB gzipped (all roles)" and "Site bundle ≤ 250 MB", read from 02 §F. */
export const jsBudgetKb = (): number => specFigure(/NFR-09[^\n]*JS ≤ ([\d,]+) KB gzipped/);
export const bundleBudgetMb = (): number => specFigure(/NFR-09[^\n]*Site bundle ≤ ([\d,]+) MB/);

/** Gzipped size, bytes, of one file (the size a browser downloads, level 9). */
export const gzipBytes = (path: string): number => gzipSync(readFileSync(path), { level: 9 }).length;

/**
 * Three stops at fixed places. The F4 site has a wall of 20-degree cells at x from 0 to 100 m, so its stops are in the column
 * x = -1000 m (passable: `plan-rules`); any other site uses its first three POIs, which the validator proves passable (05 §E.3).
 */
export function scenarioStops(site: string): [number, number][] {
  if (site === "mock_site") return [[-1000, 1000], [-1000, 0], [-1000, -1000]];
  const pois = JSON.parse(readFileSync(join(REPO_ROOT, "data", "sites", site, "vectors", "pois.geojson"), "utf8")) as { features: { geometry: { coordinates: [number, number] } }[] };
  return pois.features.slice(0, 3).map((f) => f.geometry.coordinates);
}

/**
 * Places a stop at exact metres through the app's own placement controller (`window.__tryPlace`, installed by `?debug=1`, the hook
 * `plan-rules` uses). The keyboard crosshair is not exact: it moves with the map's first fit, which depends on layout timing.
 */
export async function placeStop(page: Page, x: number, y: number): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as { __tryPlace?: unknown }).__tryPlace === "function");
  const outcome = await page.evaluate(([px, py]) => (window as unknown as { __tryPlace: (x: number, y: number) => Promise<{ outcome: string }> }).__tryPlace(px!, py!), [x, y]);
  // A POI on a cell over the slope limit is "offered" with the snapped cell (waypointLayer.ts): taking the offer is the user's step.
  if (outcome.outcome === "offered") await page.getByRole("button", { name: "Use snapped position" }).click();
  else expect(outcome.outcome, `placing a stop at ${x}, ${y}`).toBe("placed");
}

/** The result of one pass over the planning scenario of 01 §E.2. */
export interface CoreScenarioResult {
  planHash: string;
  exportText: string;
  /** Plan export with the fields that differ between runs by design removed (`result.computed_utc`, timings). */
  exportNormalised: unknown;
  steps: string[];
}

function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      if (key === "computed_utc" || key === "timing_ms") continue; // the genuine time and timing of a run (BD-50)
      out[key] = normalise((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Steps of 01 §E.2 that the planner supports on the F4 site by key presses and clicks: 1 (Start planning), 2 (two layer toggles),
 * 4 (three stops), 7 (EVA start), 8 (briefing card with Export), 9 (Sources & methods). Steps 3, 5 and 6 (POI detail, the drag onto
 * a steep slope, the slope limit) are `plan-rules` and `poi-conditions` of the frontend harness.
 */
export async function runCoreScenario(page: Page, site = e2eSiteId()): Promise<CoreScenarioResult> {
  const steps: string[] = [];
  // The keyboard pans animate unless the user prefers reduced motion (keyboard.ts); an animated pan finishes at a time that
  // depends on the machine, so a stop placed during it lands on a different cell each run. Reduced motion makes it exact.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?site=${site}&debug=1#/`);
  await page.waitForLoadState("networkidle");
  await page.getByText(/Start planning/).first().click();
  await expect(page).toHaveURL(/#\/planner/);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  steps.push("1 start planning");

  const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  if (await toggle.isVisible()) await toggle.click();
  const switches = page.locator('[data-drawer="left"] [data-layer-id] [role="switch"]:not([disabled])');
  const pressed = Math.min(2, await switches.count());
  for (let i = 0; i < pressed; i += 1) await switches.nth(i).click();
  expect(pressed, "the layers panel has switches").toBeGreaterThan(0);
  steps.push(`2 toggled ${pressed} layers`);

  await page.getByRole("tab", { name: "Plan" }).click();
  await page.locator('[data-slot="plan-panel"]').waitFor();
  // SCR-04 fills the field from the Hab Core's session when it is still empty (scr04PlanPanel.tsx); wait for that answer first, or it
  // arrives after the typed value and replaces it.
  const evaStart = page.getByLabel(/EVA start/i);
  await expect(evaStart).not.toHaveValue("", { timeout: 5_000 }).catch(() => undefined);
  await evaStart.fill("2026-11-14T08:00:00Z");
  await expect(evaStart).toHaveValue("2026-11-14T08:00:00Z");
  steps.push("7 EVA start set");
  for (const [x, y] of scenarioStops(site)) await placeStop(page, x, y);
  await expect(page.locator('[data-waypoint-id="wp-3"]')).toBeVisible();
  await expect(page.locator("[data-results-banner]")).toBeVisible();
  steps.push("4 three stops, route computed");

  await page.locator('[data-slot="briefing"]').click();
  await expect(page).toHaveURL(/#\/briefing/);
  const hashText = await page.locator("[data-plan-hash]").innerText();
  const shown = /([0-9a-f]{8,64})/.exec(hashText)?.[1];
  expect(shown, `plan hash in "${hashText}"`).toBeTruthy();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export plan JSON" }).click()]);
  const exportText = readFileSync((await download.path())!, "utf8");
  const exported = JSON.parse(exportText) as { plan_hash: string; scenario: { eva_start_utc: string } };
  expect(exported.scenario.eva_start_utc, "the export carries the EVA start that was typed").toBe("2026-11-14T08:00:00Z");
  const planHash = exported.plan_hash;
  expect(planHash, "the export's plan_hash (05: 12 hex characters of the SHA-256)").toMatch(/^[0-9a-f]{12}$/);
  expect(planHash.startsWith(shown!), "the card shows the start of the export's plan_hash").toBe(true);
  steps.push("8 briefing card and export");

  await page.evaluate(() => { window.location.hash = "#/sources"; });
  await expect(page.locator('[data-screen="SCR-09"] h1')).toContainText("What each value is");
  steps.push("9 sources and methods");
  return { planHash, exportText, exportNormalised: normalise(JSON.parse(exportText)), steps };
}

/** Console errors and CSP violations a page reports; start before navigating. */
export interface PageFaults {
  consoleErrors: string[];
  cspViolations: string[];
  pageErrors: string[];
}

export async function watchFaults(page: Page): Promise<PageFaults> {
  const faults: PageFaults = { consoleErrors: [], cspViolations: [], pageErrors: [] };
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => m.type() === "error" && faults.consoleErrors.push(m.text()));
  page.on("pageerror", (e) => faults.pageErrors.push(e.message));
  return faults;
}

/** Collect the CSP violations the page recorded since `watchFaults`. */
export async function collectCsp(page: Page, faults: PageFaults): Promise<void> {
  const seen = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
  faults.cspViolations.push(...seen);
}

/** Every request of the context goes to the Hab Core: host and port of the harness origin (NFR-01). */
export function recordOrigins(context: BrowserContext): string[] {
  const hosts: string[] = [];
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ws:" || u.protocol === "wss:") hosts.push(`${u.protocol}//${u.host}`);
  });
  return hosts;
}

export const harnessHost = (): string => new URL(HAB_ORIGIN).host;

/** Machine line for timings (BD-03). */
export function machineLine(): string {
  const cpu = cpus();
  return `${cpu[0]?.model ?? "unknown cpu"}, ${cpu.length} cores, ${Math.round(totalmem() / 2 ** 30)} GiB RAM, ${type()} ${release()}, Node ${process.version}`;
}

/**
 * Runs `fn` while `data/sites/<siteId>/` is a copy of `sourceSite` that `mutate` has changed (T14.10). The Hab Core serves the
 * folder at `/sites/<siteId>/`; it is removed afterwards, also when `fn` throws. `siteId` matches the app's `^[a-z0-9_]+$` allowlist.
 */
export async function withScratchSite<T>(siteId: string, mutate: (dir: string) => void, fn: (siteId: string, dir: string) => Promise<T>, sourceSite = "mock_site"): Promise<T> {
  const dir = join(REPO_ROOT, "data", "sites", siteId);
  rmSync(dir, { recursive: true, force: true });
  // Dereference linked data into the scratch copy: fault injection must never mutate the source bundle.
  cpSync(join(REPO_ROOT, "data", "sites", sourceSite), dir, { recursive: true, dereference: true });
  // The app refuses a manifest whose site_id is not the one asked for (SITE_ID_MISMATCH), so the copy names itself.
  const manifestPath = join(dir, "site-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { site_id: string };
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, site_id: siteId })}\n`);
  try {
    mutate(dir);
    return await fn(siteId, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The first POI of the site as a stop (01 §E.2 step 4): a fixed place, so every device produces the same plan. Returns the export. */
export async function addPoiStopAndExport(page: Page, site = e2eSiteId()): Promise<{ planHash: string; exportNormalised: unknown }> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("about:blank"); // a fresh document: the same URL again would only be a hash navigation that keeps the old state
  await page.goto(`/?site=${site}#/planner`);
  // The planner restores the last computed plan from localStorage (T18.07), so a device that ran a bigger scenario before this call
  // would export that bigger plan and the device matrix would compare different plans. The export must start from the same inputs on
  // every device, so the stored plan is cleared and the planner is loaded again. The clear has to run on the app's own origin: on
  // `about:blank` the storage belongs to an opaque origin and the app's own entries are untouched.
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* Storage is optional. */ } });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  // At 390 px the site name and the data-version chip of the top bar used to lie over the "Layers · Plan" button and take its pointer
  // events (B-04). Fixed 13 Nov 2026 (FD-425): the top bar wraps, the labels truncate and the coach marks move clear of the drawer, so
  // the toggle is clicked normally and the `force` is kept only as a fallback.
  const phone = (page.viewportSize()?.width ?? 1440) < 768;
  if (await toggle.isVisible()) await toggle.click({ force: phone });
  await page.getByRole("tab", { name: "Plan" }).click();
  const evaStart = page.getByLabel(/EVA start/i);
  await expect(evaStart).not.toHaveValue("", { timeout: 5_000 }).catch(() => undefined);
  await evaStart.fill("2026-11-14T08:00:00Z");
  await expect(evaStart).toHaveValue("2026-11-14T08:00:00Z");
  const poi = page.locator("button[data-poi-id]").first();
  await poi.focus();
  await poi.press("Enter");
  await page.getByRole("region", { name: "POI detail", exact: true }).getByRole("button", { name: "Add as stop" }).click();
  // One-drawer layouts (tablet, phone) close the Plan tab when the POI detail opens; the stops list is there.
  const left = page.locator('[data-drawer="left"]');
  if (await left.isHidden()) await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click({ force: phone });
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(page.locator('[data-waypoint-id="wp-1"]')).toBeVisible();
  await expect(page.locator("[data-results-banner]")).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#/briefing"; });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export plan JSON" }).click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, "utf8")) as { plan_hash: string };
  return { planHash: exported.plan_hash, exportNormalised: normalise(exported) };
}

/**
 * The `?debug=1` overlay renders an inline <style> element, which the policy blocks (B-05, frontend). Scenarios that need the debug
 * placement hook set exactly that report aside; any other violation still counts. `release-csp` has the `fixme` for the overlay itself.
 */
export const withoutDebugOverlayStyle = (violations: readonly string[]): string[] => violations.filter((v) => v !== "style-src-elem inline");
export const isDebugOverlayConsoleError = (message: string): boolean => message.startsWith("Applying inline style violates");
