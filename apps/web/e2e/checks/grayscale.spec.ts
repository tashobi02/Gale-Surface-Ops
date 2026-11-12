/**
 * Check `grayscale` (T13.05 grayscale check, U-41, UT-4; 04 §A.3 "status recognisable in grayscale", FD-020).
 *
 * The five statuses are rendered with the app's real stylesheet (tokens, patterns) using the markup `renderStatusIcon`
 * builds (class names, glyphs and words come from `statusIcon.ts` itself). Each icon is screenshotted with its word hidden,
 * reduced to Rec. 709 luma, and compared pairwise. Each also keeps its word and its shape in the DOM.
 *
 * `MIN_LUMA_DELTA` is a floor, not a perceptual threshold: 1 means "not identical in grayscale at 8-bit resolution", the
 * claim FD-020 makes for the advisory/unknown pair. A stricter floor needs a spec number first.
 */
import { expect, test } from "@playwright/test";
import { STATUS_GLYPHS, STATUS_WORDS, normalizeStatusClass, type ExtendedStatus } from "../../src/ui/components/statusIcon";
import { expectDistinct, lumaSignatures } from "../lib/grayscale";

const MIN_LUMA_DELTA = 1;
const STATUSES: ExtendedStatus[] = ["warning", "caution", "advisory", "nominal", "unknown"];

for (const mode of ["ops", "brief"] as const) {
  test(`grayscale: warning, caution, advisory, nominal and unknown are pairwise distinct (${mode})`, async ({ page }) => {
    await page.goto("/#/join");
    await page.waitForLoadState("networkidle");
    // Same markup as renderStatusIcon (statusIcon.ts): container, glyph, word.
    await page.evaluate(
      ({ statuses, glyphs, words, classes, htmlMode }) => {
        document.documentElement.dataset.mode = htmlMode;
        const host = document.createElement("div");
        host.id = "grayscale-sample";
        host.style.cssText = "position:fixed;inset:0 auto auto 0;z-index:99999;display:flex;gap:16px;padding:16px;background:var(--panel, #fff)";
        for (const s of statuses) {
          const el = document.createElement("span");
          el.id = `sample-${s}`;
          el.className = `status-indicator status-${s} status-${classes[s]}`;
          el.dataset.status = s;
          const glyph = document.createElement("span");
          glyph.className = "status-glyph";
          glyph.setAttribute("aria-hidden", "true");
          glyph.textContent = glyphs[s];
          const label = document.createElement("span");
          label.className = "status-label";
          label.textContent = words[s];
          el.append(glyph, label);
          host.append(el);
        }
        document.body.append(host);
      },
      {
        statuses: STATUSES,
        glyphs: STATUS_GLYPHS,
        words: STATUS_WORDS,
        classes: Object.fromEntries(STATUSES.map((s) => [s, normalizeStatusClass(s)])),
        htmlMode: mode,
      },
    );

    // Shape and word are present for every status, so colour is never the only cue (04 §A.3 #2).
    for (const s of STATUSES) {
      await expect(page.locator(`#sample-${s} .status-glyph`)).toHaveText(STATUS_GLYPHS[s]);
      await expect(page.locator(`#sample-${s} .status-label`)).toHaveText(STATUS_WORDS[s]);
    }
    expect(new Set(STATUSES.map((s) => STATUS_WORDS[s])).size).toBe(STATUSES.length);

    // Hide the words: what is left is shape, pattern and fill, which is what a grayscale screenshot must still tell apart.
    // (CSSOM, not a <style> element: the app's CSP refuses inline style elements, NFR-08.)
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("#grayscale-sample .status-label"))) el.style.visibility = "hidden";
    });
    const named = Object.fromEntries(STATUSES.map((s) => [s, page.locator(`#sample-${s}`)]));
    expectDistinct(await lumaSignatures(page, named), MIN_LUMA_DELTA);
  });
}
