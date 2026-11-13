/**
 * Check `release-offline` (backend package 28, T14.06; NFR-01, NFR-08, BD-152). Backend-owned.
 * The planning scenario of 01 §E.2, twice in a row, with the WAN unplugged: every request that is not to the harness origin is
 * aborted and counted (`guardNetwork`), and every request seen goes to the harness origin. Loopback stays up because the Hab Core is
 * on it and the map loads its tiles from it on demand (`context.setOffline` would cut those too: BD-152). No console error; both
 * exports carry the same `plan_hash`. Run 1 is kept as the backup
 * recording: a video (`out/release-offline/run-1.webm`) when Playwright's ffmpeg is installed, otherwise one screenshot per step
 * (`out/release-offline/run-1-step-N.png`); both are git-ignored.
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "../lib/a11y";
import { guardNetwork, expectNoExternal } from "../lib/offline";
import { collectCsp, harnessHost, isDebugOverlayConsoleError, recordOrigins, runCoreScenario, watchFaults, withoutDebugOverlayStyle } from "../lib/release";

/** A context that records a video when it can; without the ffmpeg binary Playwright refuses, and the run goes on without one. */
async function recordingContext(browser: Browser, dir: string): Promise<{ context: BrowserContext; video: boolean }> {
  const base = { viewport: { width: 1440, height: 900 } };
  try {
    const context = await browser.newContext({ ...base, recordVideo: { dir, size: { width: 1280, height: 800 } } });
    await (await context.newPage()).close(); // the ffmpeg check happens here
    return { context, video: true };
  } catch (error) {
    if (!/ffmpeg/i.test(String(error))) throw error;
    return { context: await browser.newContext(base), video: false };
  }
}

test("release-offline: the planning scenario runs twice with the Wi-Fi off, local requests only, same plan_hash (T14.06)", async ({ browser }) => {
  test.setTimeout(180_000);
  const dir = join(OUT_DIR, "release-offline");
  mkdirSync(dir, { recursive: true });
  const hashes: string[] = [];
  const exports: unknown[] = [];
  for (const run of [1, 2]) {
    const { context, video } = run === 1 ? await recordingContext(browser, dir) : { context: await browser.newContext({ viewport: { width: 1440, height: 900 } }), video: false };
    const hosts = recordOrigins(context);
    const page = await context.newPage();
    const guard = await guardNetwork(page);
    const faults = await watchFaults(page);
    const result = await runCoreScenario(page);
    if (run === 1 && !video) await page.screenshot({ path: join(dir, "run-1-step-final.png"), fullPage: true });
    await collectCsp(page, faults);
    expectNoExternal(guard);
    const allowed = [`http://${harnessHost()}`, `ws://${harnessHost()}`];
    expect(hosts.filter((h) => !allowed.includes(h)), `run ${run}: requests that did not go to ${harnessHost()}`).toEqual([]);
    // The scenario runs with ?debug=1 (it places stops through the app's placement hook); the overlay's blocked <style> is set aside (B-05).
    expect(withoutDebugOverlayStyle(faults.cspViolations), `run ${run}: CSP violations`).toEqual([]);
    expect(faults.pageErrors, `run ${run}: uncaught page errors`).toEqual([]);
    expect(faults.consoleErrors.filter((m) => !isDebugOverlayConsoleError(m)), `run ${run}: console errors`).toEqual([]);
    hashes.push(result.planHash);
    exports.push(result.exportNormalised);
    writeFileSync(join(dir, `export-run-${run}.json`), result.exportText);
    test.info().annotations.push({ type: `run-${run}-steps`, description: result.steps.join("; ") });
    const recorded = run === 1 && video ? page.video() : null;
    await context.close();
    if (recorded) copyFileSync(await recorded.path(), join(dir, "run-1.webm"));
  }
  expect(hashes[1], "run 2 plan_hash equals run 1").toBe(hashes[0]);
  expect(exports[1], "run 2 export equals run 1 (without run time and timings)").toEqual(exports[0]);
});
