/**
 * Harness self-tests (frontend plan 01, step 1): each helper must be able to fail before a product check relies on it.
 * These run green before any product check and need only a blank page, no Hab Core data.
 */
import { expect, test } from "@playwright/test";
import { ratio, toRgb } from "../../tests/ui/wcag";
import { contrastFailures, expectContrast, textSamples } from "../lib/contrast";
import { boxes, expectGaps, expectSameBoxes, expectTargetSize, gapBetween, targets } from "../lib/geometry";
import { SIGNATURE_SIDE, expectDistinct, lumaDelta, lumaSignatures } from "../lib/grayscale";
import { expectLocalAssetsOk, expectNoExternal, guardNetwork } from "../lib/offline";
import { countPdfPages, pdfPages } from "../lib/print";
import { axeScan } from "../lib/a11y";
import { planHash } from "../lib/fakeScenario";
import { unlabelledNumbers } from "../lib/provenance";

const LIMITS = { text: 4.5, large: 3, hud: 7 };

test("offline guard blocks and reports an external request", async ({ page }) => {
  const guard = await guardNetwork(page);
  await page.setContent('<img id="x" src="https://example.invalid/pixel.png" alt="">');
  await page.waitForLoadState("load");
  expect(guard.blocked).toEqual(["https://example.invalid/pixel.png"]);
  expect(() => expectNoExternal(guard)).toThrow(/example\.invalid\/pixel\.png/);
});

test("offline guard lets a page with no external request pass", async ({ page }) => {
  const guard = await guardNetwork(page);
  await page.setContent("<p>local only</p>");
  expect(() => expectNoExternal(guard)).not.toThrow();
  expect(() => expectLocalAssetsOk(guard)).not.toThrow();
});

test("contrast helper fails a 4.4:1 pair", async ({ page }) => {
  // #787878 on white is 4.42:1, just under the 4.5:1 AA limit for normal text.
  expect(ratio(toRgb("#787878"), toRgb("#FFFFFF"))).toBeGreaterThan(4.4);
  expect(ratio(toRgb("#787878"), toRgb("#FFFFFF"))).toBeLessThan(4.5);
  await page.setContent('<body style="background:#fff"><p style="color:#787878;font:16px sans-serif">Low contrast sample</p></body>');
  await expect(expectContrast(page, LIMITS)).rejects.toThrow(/4\.4\d? < 4\.5 "Low contrast sample"/);

  // The same pair passes as large text (3:1) and a darker pair passes as normal text.
  await page.setContent('<body style="background:#fff"><p style="color:#787878;font:700 24px sans-serif">Large sample</p></body>');
  await expect(expectContrast(page, LIMITS)).resolves.toBe(1);
  await page.setContent('<body style="background:#fff"><p style="color:#595959;font:16px sans-serif">Dark enough</p></body>');
  await expect(expectContrast(page, LIMITS)).resolves.toBe(1);
});

test("contrast helper composites a translucent background and applies the HUD limit", async ({ page }) => {
  await page.setContent(
    '<html data-mode="hud"><body style="background:#000"><div style="background:rgba(255,255,255,0.5);padding:4px">' +
      '<span style="color:#fff;font:16px sans-serif">White on grey</span></div></body></html>',
  );
  const { mode, samples } = await textSamples(page);
  expect(mode).toBe("hud");
  expect(samples).toHaveLength(1);
  // 50 % white over black is mid grey (about 128); white on it is well under 7:1.
  expect(samples[0].bg[0]).toBeGreaterThan(120);
  expect(samples[0].bg[0]).toBeLessThan(135);
  expect(contrastFailures(mode, samples, LIMITS)).toHaveLength(1);
});

test("pdfPages counts two pages", async ({ page }) => {
  await page.setContent(
    '<body style="margin:0"><div style="page-break-after:always">page one</div><div>page two</div></body>',
  );
  await expect.poll(() => pdfPages(page, { format: "A4" })).toBe(2);
  expect(await pdfPages(page, { format: "Letter", margin: "12mm" })).toBe(2);
  await page.setContent("<body><p>one page</p></body>");
  expect(await pdfPages(page, { format: "A4" })).toBe(1);
  // `/Type /Pages` tree nodes are not counted as pages.
  expect(countPdfPages(Buffer.from("<< /Type /Pages /Count 1 >> << /Type /Page >>", "latin1"))).toBe(1);
});

test("grayscale distinctness fails identical icons", async ({ page }) => {
  await page.setContent(
    '<body style="margin:0;background:#fff">' +
      '<span id="a" style="display:inline-block;width:32px;height:32px;background:#3ddc84"></span>' +
      '<span id="b" style="display:inline-block;width:32px;height:32px;background:#3ddc84"></span>' +
      '<span id="c" style="display:inline-block;width:32px;height:32px;background:#000"></span></body>',
  );
  const same = await lumaSignatures(page, { a: page.locator("#a"), b: page.locator("#b") });
  expect(same.a).toHaveLength(SIGNATURE_SIDE * SIGNATURE_SIDE);
  expect(() => expectDistinct(same, 1)).toThrow(/a \/ b: 0\.00 < 1/);

  const different = await lumaSignatures(page, { a: page.locator("#a"), c: page.locator("#c") });
  expect(() => expectDistinct(different, 1)).not.toThrow();
  expect(lumaDelta(different.a, different.c)).toBeGreaterThan(50);
});

test("grayscale signature ignores hue and keeps luma", async ({ page }) => {
  // Two different hues with the same Rec. 709 luma (#808080 is 128; pure red scaled to 128/0.2126 is out of range, so use
  // a measured pair: rgb(128,128,128) and rgb(0,179,0) have luma 128 and 128.0).
  await page.setContent(
    '<body style="margin:0"><span id="g" style="display:block;width:32px;height:32px;background:rgb(128,128,128)"></span>' +
      '<span id="n" style="display:block;width:32px;height:32px;background:rgb(0,179,0)"></span></body>',
  );
  const sig = await lumaSignatures(page, { g: page.locator("#g"), n: page.locator("#n") });
  expect(lumaDelta(sig.g, sig.n)).toBeLessThan(1);
});

test("geometry helpers detect box drift, small targets and tight gaps", async ({ page }) => {
  await page.setContent(
    '<body style="margin:0"><button id="a" style="position:absolute;left:0;top:0;width:56px;height:56px">A</button>' +
      '<button id="b" style="position:absolute;left:60px;top:0;width:40px;height:56px">B</button></body>',
  );
  const first = await boxes(page, ["#a", "#b", "#missing"]);
  expect(first["#missing"]).toBeNull();
  expect(() => expectSameBoxes({ "#a": first["#a"] }, { "#a": first["#a"] })).not.toThrow();
  expect(() => expectSameBoxes({ "#a": first["#a"] }, { "#a": { ...first["#a"]!, x: first["#a"]!.x + 1 } })).toThrow(/#a\.x/);

  const list = await targets(page);
  expect(list).toHaveLength(2);
  expect(() => expectTargetSize(list, 56)).toThrow(/button#b/);
  expect(() => expectTargetSize(list, 40)).not.toThrow();
  expect(gapBetween(list[0].box, list[1].box)).toBeCloseTo(4, 5);
  expect(() => expectGaps(list, 8)).toThrow(/4\.0 px/);
  expect(() => expectGaps(list, 4)).not.toThrow();
});

test("provenance helper finds numbers with no label and skips identifiers", async ({ page }) => {
  await page.setContent(
    "<body>" +
      '<p id="ok" data-provenance="derived" data-source="t.plan">12 min</p>' +
      '<div data-provenance="derived" data-source="t.plan"><span>nested 7</span></div>' +
      '<p data-identifier>plan 4ab9</p>' +
      "<p>no digits here</p>" +
      "<p>bare 42 m</p></body>",
  );
  const bad = await unlabelledNumbers(page);
  expect(bad.map((b) => b.text)).toEqual(["bare 42 m"]);
});

test("axe scan scope: a violation outside the included region is not reported, one inside it is", async ({ page }) => {
  // An <img> with no alt is a critical image-alt violation; each region holds one control that is fine and, in #bad, that image.
  await page.setContent(
    '<!doctype html><html lang="en" data-mode="ops"><head><title>scope</title></head><body><main>' +
      '<div id="good"><button type="button">Fine</button></div>' +
      '<div id="bad"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div></main></body></html>',
  );
  await expect(axeScan(page, { mode: "ops", route: "harness-scope-page" })).rejects.toThrow(/image-alt/);
  await expect(axeScan(page, { mode: "ops", route: "harness-scope-bad", include: "#bad" })).rejects.toThrow(/image-alt/);
  await expect(axeScan(page, { mode: "ops", route: "harness-scope-good", include: "#good" })).resolves.toMatchObject({ blocking: 0 });
});

test("fake scenario plan hash is the first 12 hex digits of a stable SHA-256", () => {
  const plan = { data_version: "d", scenario: { b: 1, a: [1, { y: 2, x: 1 }] }, waypoints: [] };
  expect(planHash(plan)).toMatch(/^[0-9a-f]{12}$/);
  // Key order does not matter; a changed value does.
  expect(planHash({ waypoints: [], scenario: { a: [1, { x: 1, y: 2 }], b: 1 }, data_version: "d" })).toBe(planHash(plan));
  expect(planHash({ ...plan, data_version: "e" })).not.toBe(planHash(plan));
});
