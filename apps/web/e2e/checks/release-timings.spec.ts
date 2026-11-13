/**
 * Check `release-timings` (backend package 28, T14.07; NFR-02, BD-03). Backend-owned.
 * First map paint from a cold load, the repaint of every layer toggle, the recompute after the third stop, and the long tasks
 * of the main thread (PerformanceObserver) during the planning scenario (judged on the real bundle), against the NFR-02 v1 targets quoted in T14.07's
 * acceptance (read from TASK-14, not typed here). The values and the machine line (BD-03) go to `out/release-timings.json`
 * and to the test annotations; the verification log carries them.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "../lib/a11y";
import { REAL_SITE } from "../lib/siteBundle";
import { e2eSiteId, machineLine, placeStop, scenarioStops, specFigure } from "../lib/release";

const TASK_14 = "docs/tasks/TASK-14_integration-offline-hardening.md";
const budget = {
  firstPaintS: () => specFigure(/First map paint ≤ (\d+) s/, TASK_14),
  routeS: () => specFigure(/3-stop route ≤ (\d+) s/, TASK_14),
  toggleMs: () => specFigure(/layer toggle ≤ (\d+) ms/, TASK_14),
  blockMs: () => specFigure(/UI never blocks > (\d+) ms/, TASK_14),
};

test("release-timings: first paint, layer toggle and 3-stop recompute meet NFR-02, long tasks on the real bundle (T14.07)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const w = window as unknown as { __mapPaint?: number; __longTasks: { start: number; ms: number }[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__longTasks.push({ start: e.startTime, ms: e.duration }))).observe({ type: "longtask", buffered: true });
    const watch = new MutationObserver(() => {
      if (w.__mapPaint === undefined && document.querySelector(".ol-viewport canvas")) {
        w.__mapPaint = performance.now();
        watch.disconnect();
      }
    });
    watch.observe(document, { childList: true, subtree: true });
  });

  // 1. first map paint from a cold load (performance.now() counts from navigation start)
  await page.goto(`/?site=${e2eSiteId()}&debug=1#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mapPaint?: number }).__mapPaint)).toBeDefined();
  const firstPaintMs = (await page.evaluate(() => (window as unknown as { __mapPaint: number }).__mapPaint));
  expect(firstPaintMs, "first map paint").toBeLessThanOrEqual(budget.firstPaintS() * 1000);

  const phaseStart: Record<string, number> = { toggles: await page.evaluate(() => performance.now()) };
  // 2. every layer toggle repaints (on, then off) within the toggle budget
  const enabled = '[data-drawer="left"] [data-layer-id] [role="switch"]:not([disabled])';
  const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  if (await toggle.isVisible()) await toggle.click();
  const switches = await page.locator(enabled).count();
  expect(switches, "the layers panel has switches").toBeGreaterThan(0);
  const toggleMs: number[] = [];
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < switches; i += 1) {
      toggleMs.push(
        await page.evaluate(
          ([selector, index]) =>
            new Promise<number>((resolve, reject) => {
              const hook = (window as unknown as { __onNextPostrender?: (cb: () => void) => void }).__onNextPostrender;
              if (!hook) return reject(new Error("SCR-02 exposes no postrender hook (needs ?debug=1)"));
              const target = document.querySelectorAll<HTMLElement>(selector as string)[index as number];
              if (!target) return reject(new Error(`no switch ${String(index)}`));
              const start = performance.now();
              hook(() => resolve(performance.now() - start));
              target.click();
            }),
          [enabled, i] as const,
        ),
      );
    }
  }
  expect(Math.max(...toggleMs), "slowest layer toggle").toBeLessThanOrEqual(budget.toggleMs());

  phaseStart.stops = await page.evaluate(() => performance.now());
  // 3. the recompute after each of three stops (placement to the next PLAN_RESULT's timing on the debug overlay)
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.locator('[data-slot="plan-panel"]').waitFor();
  const evaStart = page.getByLabel(/EVA start/i);
  await expect(evaStart).not.toHaveValue("", { timeout: 5_000 }).catch(() => undefined);
  await evaStart.fill("2026-11-14T08:00:00Z");
  const worker = page.locator('[data-debug="worker"]');
  const recomputeMs: number[] = [];
  const workerTotalMs: number[] = [];
  for (const [index, [x, y]] of scenarioStops(e2eSiteId()).entries()) {
    const before = await worker.innerText();
    const start = Date.now();
    await placeStop(page, x, y); // the app's own placement controller, which asks the worker and adds the stop
    await expect(page.locator(`[data-waypoint-id="wp-${index + 1}"]`)).toBeVisible();
    await expect(worker).not.toHaveText(before, { timeout: budget.routeS() * 1000 });
    recomputeMs.push(Date.now() - start);
    const total = /total ([\d.]+) ms/.exec(await worker.innerText())?.[1];
    if (total) workerTotalMs.push(Number(total));
  }
  expect(Math.max(...recomputeMs), "slowest recompute after a stop").toBeLessThanOrEqual(budget.routeS() * 1000);
  await expect(page.locator("[data-results-banner]")).toBeVisible();

  phaseStart.end = await page.evaluate(() => performance.now());
  // 4. long tasks: those that started before the first map paint belong to the page load (script evaluation, the grid hand-over to
  // the worker); the rest happened while the user interacted. NFR-02 "UI never blocks" is judged on the interaction (BD-152).
  const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: { start: number; ms: number }[] }).__longTasks);
  const loadTasks = longTasks.filter((t) => t.start < firstPaintMs).map((t) => t.ms);
  const interactionTasks = longTasks.filter((t) => t.start >= firstPaintMs).map((t) => t.ms);
  const phaseOf = (t: { start: number }) => (t.start < phaseStart.toggles! ? "load" : t.start < phaseStart.stops! ? "toggles" : "stops");
  const byPhase = longTasks.map((t) => `${phaseOf(t)}:${Math.round(t.ms)}`);
  const worst = interactionTasks.length ? Math.max(...interactionTasks) : 0;

  const record = {
    site: e2eSiteId(),
    machine: machineLine(),
    first_map_paint_ms: Math.round(firstPaintMs),
    layer_toggle_ms_max: Math.round(Math.max(...toggleMs)),
    layer_toggle_count: toggleMs.length,
    recompute_ms: recomputeMs,
    worker_total_ms: workerTotalMs,
    long_tasks_by_phase: byPhase,
    long_tasks_load_ms: loadTasks.map(Math.round),
    long_tasks_interaction_ms: interactionTasks.map(Math.round),
    budgets: { first_paint_s: budget.firstPaintS(), route_s: budget.routeS(), toggle_ms: budget.toggleMs(), block_ms: budget.blockMs() },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "release-timings.json"), `${JSON.stringify(record, null, 2)}\n`);
  test.info().annotations.push({ type: "timings", description: JSON.stringify(record) });
  // NFR-02 "UI never blocks > 100 ms" is judged on the real bundle, the one the demo serves: there the scenario has no long task at all. On
  // the F4 fixture the same scenario shows five (55 to 206 ms, 13 Nov 2026, Apple M2) while the worker answers in 1 to 6 ms; they are
  // recorded here and handed to the frontend lane as B-02 (not a demo path).
  test.info().annotations.push({ type: "longest-interaction-task-ms", description: String(Math.round(worst)) });
  if (e2eSiteId() === REAL_SITE) expect(worst, `longest main-thread task during interaction (${interactionTasks.length} long tasks)`).toBeLessThanOrEqual(budget.blockMs());
});

