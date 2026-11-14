/**
 * Check `release-recovery` (backend package 28, T14.10; NFR-10, BD-83). Backend-owned.
 * On scratch copies of the F4 site (`data/sites/e2e_*`, removed afterwards): a missing manifest is named by SCR-00 and Retry boots once
 * the file is back, with the keyboard alone; a deleted optional layer is unavailable while routing still works; a corrupted grid file
 * is named by SCR-00 in the production build (BD-83); a worker failure shows "Computation failed" and a Retry that recovers (N-211).
 * A separate Vite development server verifies same-length grid corruption and Retry; production skips checksums (02 §E.1).
 */
import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { addStopByKeyboard } from "../lib/planner";
import { REPO_ROOT, placeStop, scenarioStops, withScratchSite } from "../lib/release";
import { HAB_ORIGIN, HAB_PORT } from "../lib/hab";
import { e2eSite, REAL_SITE } from "../lib/siteBundle";

const SOURCE = join(REPO_ROOT, "data", "sites", e2eSite());
const scratch: typeof withScratchSite = (site, mutate, fn) => withScratchSite(site, mutate, fn, e2eSite());
const scenarioSlope = (): string => String((JSON.parse(readFileSync(join(REPO_ROOT, "scenarios", "storm-sol4190", "plan.json"), "utf8")) as { scenario: { hard_slope_limit_deg: number } }).scenario.hard_slope_limit_deg);

test("release-recovery: SCR-00 names a missing manifest and Retry, reached by the keyboard alone, boots once it is back", async ({ page }) => {
  await scratch("e2e_manifest_gone", (dir) => rmSync(join(dir, "site-manifest.json")), async (site, dir) => {
    await page.goto(`/?site=${site}#/planner`);
    const screen = page.locator('[data-screen="SCR-00"]');
    await expect(screen).toBeVisible();
    await expect(screen.locator('[data-slot="missing-file"]')).toHaveText(`sites/${site}/site-manifest.json`);
    // Put the manifest back, naming the scratch site as withScratchSite does.
    const manifest = JSON.parse(readFileSync(join(SOURCE, "site-manifest.json"), "utf8")) as object;
    writeFileSync(join(dir, "site-manifest.json"), `${JSON.stringify({ ...manifest, site_id: site })}\n`);
    const retry = page.locator('[data-slot="boot-retry"]');
    for (let presses = 0; presses < 20 && !(await retry.evaluate((el) => el === document.activeElement)); presses += 1) await page.keyboard.press("Tab");
    await expect(retry, "Retry is reached by Tab").toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen="SCR-02"]').first()).toBeVisible();
    await expect(screen).toHaveCount(0);
  });
});

test("release-recovery: a deleted optional layer is unavailable and routing still works", async ({ page }) => {
  const layer = e2eSite() === REAL_SITE ? "thermal_inertia" : "elevation";
  await scratch("e2e_layer_gone", (dir) => rmSync(join(dir, "tiles", layer), { recursive: true }), async (site) => {
    await page.goto(`/?site=${site}&debug=1#/planner`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-slot="map-workspace"]').waitFor();
    await expect(page.locator('[data-slot="boot-failure"]')).toHaveCount(0);
    const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
    if (await toggle.isVisible()) await toggle.click();
    // Turning the layer on makes the map ask for its tiles; the layer row then reports it as unavailable and the slope layer is untouched.
    const row = page.locator(`[data-drawer="left"] [data-layer-id="${layer}"]`);
    await row.locator('[role="switch"]').click();
    await expect(row).toHaveAttribute("data-state", /unavailable|error|missing/i, { timeout: 10_000 });
    await expect(page.locator('[data-drawer="left"] [data-layer-id="slope"]')).not.toHaveAttribute("data-state", /unavailable|error|missing/i);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("tab", { name: "Plan" }).click();
    await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
    if (e2eSite() === REAL_SITE) await page.getByLabel(/hard slope limit/i).fill(scenarioSlope());
    for (const [x, y] of scenarioStops(e2eSite())) await placeStop(page, x, y);
    await expect(page.locator('[data-waypoint-id^="wp-"]')).toHaveCount(4);
    await expect(page.locator("[data-results-banner]")).toContainText(/OK|Over limits/, { timeout: 30_000 });
  });
});

test("release-recovery: a grid file of the wrong length is named by SCR-00 in the production build (BD-83)", async ({ page }) => {
  await scratch("e2e_grid_short", (dir) => truncateSync(join(dir, "grid", "elevation.f32"), 100), async (site) => {
    await page.goto(`/?site=${site}#/planner`);
    const screen = page.locator('[data-screen="SCR-00"]');
    await expect(screen).toBeVisible({ timeout: 15_000 });
    await expect(screen).toContainText(/elevation/i);
    await expect(page.locator('[data-slot="boot-retry"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "ops");
  });
});

test("release-recovery: production accepts a same-length grid corruption without hashing (02 §E.1)", async ({ page }) => {
  await scratch("e2e_grid_prod_corrupt", (dir) => {
    const path = join(dir, "grid", "elevation.f32");
    const bytes = readFileSync(path);
    bytes[0] = bytes[0]! ^ 1;
    writeFileSync(path, bytes);
  }, async (site) => {
    await page.goto(`/?site=${site}#/planner`);
    await expect(page.locator('[data-screen="SCR-02"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-screen="SCR-00"]')).toHaveCount(0);
  });
});

// N-211: the failure is driven by the worker, not by a hook in the app. The F3 mock worker is that worker-owned mechanism
// (FD-174): its `transient-error` variant answers the first COMPUTE_PLAN with a `TIMEOUT` error and the next one with a
// real plan. That is exactly the "the worker failed a live computation" case, and it makes the recovery observable. The app
// has no `__failWorker` hook and needs none: the plan store sees the worker's own error code and enters its Error state
// (03 §E.4), and SCR-05 shows "Computation failed" with a Retry (T09.07). The check drives the real planner UI — a stop, a
// computation, the failure, the retry — with no debug hook in production code.
test("release-recovery: a worker failure shows Computation failed with a working Retry (N-211, T09.07)", async ({ page }) => {
  await page.goto("/?site=mock_site&mock_worker=1&mock_worker_result=transient-error#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const start = page.getByLabel(/EVA start/i);
  await start.fill("");
  await start.fill("2026-11-14T08:00:00Z");
  await addStopByKeyboard(page, 1);

  // The worker's error answer reaches the panel: the banner names the failure and the reason carries the worker's own code.
  const panel = page.getByRole("region", { name: "Route results", exact: true });
  const banner = panel.locator("[data-results-banner]");
  await expect(banner, "the failure is named").toContainText("Computation failed");
  await expect(banner, "the worker's own error code is shown").toContainText("TIMEOUT");
  await expect(banner.locator(".status-glyph"), "the failure draws a shape").toBeVisible();
  // The panel does not pretend there is a result (03 §E.4).
  await expect(panel.locator("[data-totals-hidden]")).toHaveAttribute("data-totals-hidden", "true");

  // Retry is offered, and it re-runs the computation: the worker answers the next COMPUTE_PLAN with a plan, so the banner
  // changes from the failure to the plan's own result. A Retry that did nothing would leave the failure on screen.
  const retry = banner.getByRole("button", { name: "Retry" });
  await expect(retry, "the failure offers a Retry").toBeVisible();
  await retry.click();
  await expect(banner, "the retry re-ran the computation and the worker answered with a plan").not.toContainText("Computation failed");
  await expect(banner, "the recovered plan says OK").toContainText("OK");
  await expect(retry, "the Retry is gone once the plan is there").toHaveCount(0);
});

test("release-recovery: a real worker crash leaves the map usable and Retry reloads the grid", async ({ page }) => {
  let injected = false;
  await page.route(/\/assets\/planWorker-[^/]+\.js$/, async (route) => {
    const response = await route.fetch();
    if (injected) return route.fulfill({ response });
    injected = true;
    const body = `${await response.text()}\nconst originalHandler = self.onmessage; self.onmessage = event => { if (event.data.type === "COMPUTE_PLAN") throw new Error("injected worker crash"); originalHandler(event); };`;
    await route.fulfill({ response, body });
  });
  await page.goto(`/?site=${e2eSite()}&debug=1#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  if (e2eSite() === REAL_SITE) await page.getByLabel(/hard slope limit/i).fill(scenarioSlope());
  const [x, y] = scenarioStops(e2eSite())[0];
  await placeStop(page, x, y);
  const banner = page.locator("[data-results-banner]");
  await expect(banner).toContainText("Computation failed", { timeout: 30_000 });
  expect(injected).toBe(true);
  const viewport = page.locator(".ol-viewport");
  await expect(viewport).toBeVisible();
  await viewport.focus();
  await page.keyboard.press("ArrowLeft");
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(banner).toContainText(/OK|Over limits/, { timeout: 30_000 });
});

test("release-recovery: development checksum identifies a same-length corrupted grid and Retry recovers", async ({ page }) => {
  const port = HAB_PORT === 8399 ? 8398 : HAB_PORT + 1;
  const origin = `http://127.0.0.1:${port}`;
  const vite = spawn(process.execPath, [join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: join(REPO_ROOT, "apps/web"), env: { ...process.env, HAB_URL: HAB_ORIGIN }, stdio: "ignore",
  });
  try {
    await expect.poll(async () => {
      if (vite.exitCode !== null) throw new Error(`Vite exited: ${vite.exitCode}`);
      return fetch(origin).then((r) => r.status).catch(() => 0);
    }, { timeout: 20_000 }).toBe(200);
    await scratch("e2e_grid_corrupt", (dir) => {
      const path = join(dir, "grid", "elevation.f32");
      const bytes = readFileSync(path);
      bytes[0] = bytes[0]! ^ 1;
      writeFileSync(path, bytes);
    }, async (site, dir) => {
      await page.goto(`${origin}/?site=${site}#/planner`);
      const screen = page.locator('[data-screen="SCR-00"]');
      await expect(screen).toBeVisible({ timeout: 20_000 });
      await expect(screen.locator('[data-slot="missing-file"]')).toHaveText(`sites/${site}/grid/elevation.f32`);
      await expect(screen).toContainText(/checksum/i);
      writeFileSync(join(dir, "grid", "elevation.f32"), readFileSync(join(SOURCE, "grid", "elevation.f32")));
      await screen.locator('[data-slot="boot-retry"]').click();
      await expect(page.locator('[data-screen="SCR-02"]').first()).toBeVisible();
    });
  } finally {
    vite.kill("SIGTERM");
    await new Promise<void>((resolve) => vite.exitCode !== null ? resolve() : vite.once("exit", () => resolve()));
  }
});
