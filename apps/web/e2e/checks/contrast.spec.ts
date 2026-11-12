/**
 * Check `contrast` (T13.12 / NFR-04 measurement): BRIEF and OPS text >= 4.5 : 1 (large >= 3), HUD >= 7 : 1, measured on
 * the rendered page in real Chromium. Patterned pills are measured against their fill colour only; `patterns.test.ts` owns the
 * pattern search (FD-155). Non-text contrast (3 : 1) is enabled by package 03 with the tokens. Package 08 adds the planner with
 * the layers panel (text) and the rendered slope overlay (non-text, FD-019).
 */
import { expect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { expectContrast } from "../lib/contrast";
import { ratio, toRgb } from "../../tests/ui/wcag";
import { waitForSnapshot } from "../lib/hab";
import { routeFixtureRecording } from "../lib/replayFixture";
import { populatedReport } from "../../tests/fixtures/postEvaReport";

const LIMITS = { text: 4.5, large: 3, hud: 7 };

// Routes that render real content today. Each later package adds its own route here when it builds the screen.
// `pending` marks a route the harness already measures as failing: the defect is the named package's to fix, and that package
// removes the `pending` entry. The numbers below are what this check printed on 12 Nov 2026 (F4 site, fake scenario).
const ROUTES: { hash: string; live: boolean; pending?: string }[] = [
  { hash: "#/join", live: false },
  { hash: "#/hud/EV1", live: true },
  { hash: "#/ops", live: true },
  { hash: "#/eva/EV1", live: true },
  { hash: "#/report", live: false },
  // Package 27: the replay (fixture recording until N-81) and SCR-17 populated (3 alerts, 6 stops, a trace).
  { hash: "#/replay", live: false },
  { hash: "#/report?populated", live: false },
];

for (const { hash, live, pending } of ROUTES) {
  const run = async ({ page }: { page: Page }): Promise<void> => {
    if (hash === "#/replay") await routeFixtureRecording(page);
    if (hash === "#/report?populated") {
      const body = JSON.stringify(populatedReport());
      await page.route("**/api/report", (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
    }
    await page.goto(`/${hash.replace("?populated", "")}`);
    await page.waitForLoadState("networkidle");
    if (live) await waitForSnapshot(page);
    if (hash === "#/replay") await page.locator('[data-slot="replay-banner"]').waitFor();
    if (hash === "#/report?populated") await page.locator('[data-slot="report-trace"]').waitFor();
    const measured = await expectContrast(page, LIMITS);
    expect(measured, "no text was measured").toBeGreaterThan(0);
  };
  const title = `contrast: text on ${hash} meets the limit of its mode`;
  if (pending) test.fixme(`${title} (enabled by ${pending})`, run);
  else test(title, run);
}

// Package 08 (FD-019): the planner on the F4 site with the slope overlay on. Text first, then the rendered tiles.
const PLANNER = "/?site=mock_site#/planner";

async function planner(page: Page): Promise<void> {
  await page.goto(PLANNER);
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
}

test("contrast: text on #/planner with the layers panel open meets the limit of its mode (package 08)", async ({ page }) => {
  await planner(page);
  await page.locator('[data-layer-id="slope"] [role="switch"]').click();
  await page.waitForLoadState("networkidle");
  const measured = await expectContrast(page, LIMITS);
  expect(measured, "no text was measured").toBeGreaterThan(0);
});

/** An 8-bit grayscale PNG of `size` x `size` pixels, the left half `left`, the right half `right` (C9 §4 slope data: degrees x 4). */
function slopePng(size: number, left: number, right: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer): number => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  const rows = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) rows[y * (size + 1) + 1 + x] = x < size / 2 ? left : right;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

test("contrast: the rendered slope overlay keeps 3 : 1 against the map background wherever it is opaque (non-text, FD-019)", async ({ page }) => {
  // The F4 slope tiles are flat (0 degrees) and carry nothing to colour, so the test serves its own slope data from the same
  // origin: 20 degrees (80) on the left half of every tile, 12 degrees (48) on the right. With the scenario defaults (caution 10,
  // hard 15) the left is over limit (hatched, opaque stripes) and the right is caution. The decode, the classification and the
  // canvas draw are the app's own, in real Chromium.
  const tile = slopePng(256, 80, 48);
  await page.route("**/sites/mock_site/tiles/slope/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: tile }));
  await planner(page);
  // Only the slope overlay on the canvas: the other map layers are switched off first.
  for (const id of ["traverse", "pois", "ez"]) await page.locator(`[data-layer-id="${id}"] [role="switch"]`).click();
  await page.locator('[data-layer-id="slope"] [role="switch"]').click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const drawn = await page.evaluate(() => {
    const void_ = getComputedStyle(document.documentElement).getPropertyValue("--void").trim();
    const opaque: [number, number, number][] = [];
    let translucent = 0;
    for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>(".ol-viewport canvas"))) {
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 255) opaque.push([data[i], data[i + 1], data[i + 2]]);
        else if (data[i + 3] > 0) translucent += 1;
      }
    }
    return { void_, opaque: opaque.slice(0, 5000), opaqueCount: opaque.length, translucent };
  });
  expect(drawn.opaqueCount, "the over-limit hatch drew no opaque pixel: the slope tiles did not render").toBeGreaterThan(0);
  expect(drawn.translucent, "the class fill drew nothing").toBeGreaterThan(0);
  const background = toRgb(drawn.void_);
  for (const rgb of drawn.opaque) expect(ratio(rgb, background), `colour ${rgb.join(",")}`).toBeGreaterThanOrEqual(3);
});

// Package 18: the route palette also owns SCR-14, full map and SCR-18.
test("contrast: EVA high contrast carries through options, map and transport loss", async ({ page }) => {
  const { openSurfaceFixture, surfaceSnapshot } = await import("../lib/surfaceFixture");
  const fixture = await openSurfaceFixture(page, "eva");
  try {
    await page.getByRole("button", { name: "Toggle high contrast" }).click();
    await page.getByRole("button", { name: "Open full-screen map" }).click();
    await expect(page.locator('[data-fullmap]')).toHaveAttribute('data-map-status', 'ready');
    expect(await page.locator('[data-fullmap]').evaluate((el) => getComputedStyle(el).getPropertyValue('--text-2').trim())).toBe('#fff');
    await expectContrast(page, { text: 7, large: 7, hud: 7 });
    const warning = surfaceSnapshot("alerting-with-options");
    warning.options[0]!.violations = ["HAVEN_TIME_EXCEEDED"];
    fixture.send(warning);
    await expect(page.locator('[data-screen="SCR-14"]')).toBeVisible();
    expect(await page.locator('[data-screen="SCR-14"]').evaluate((el) => getComputedStyle(el).getPropertyValue('--text-2').trim())).toBe('#fff');
    await expectContrast(page, { text: 7, large: 7, hud: 7 });
    fixture.stop();
    await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: 3500 });
    expect(await page.locator('[data-screen="SCR-18"]').evaluate((el) => getComputedStyle(el).getPropertyValue('--text-2').trim())).toBe('#fff');
    expect(await page.locator('[data-screen="SCR-18"]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
    await expectContrast(page, { text: 7, large: 7, hud: 7 });
  } finally { fixture.dispose(); }
});
