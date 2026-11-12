/**
 * Check `credits` (replaces T16.05). Enabled by package 31.
 * Every manifest DataSource and every image credit appears in SCR-09 and in `README.md`.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test.fixme("credits: every DataSource and image credit is in SCR-09 and README.md (enabled by package 31)", async ({ page, request }) => {
  const site = process.env.E2E_SITE ?? "mock_site";
  const manifest = (await (await request.get(`/sites/${site}/site-manifest.json`)).json()) as { sources: { source_id: string; title: string }[] };
  const readme = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "README.md"), "utf8");
  await page.goto("/#/sources");
  await page.waitForLoadState("networkidle");
  const screen = await page.locator("body").innerText();
  for (const s of manifest.sources) {
    expect(screen, `${s.source_id} missing from SCR-09`).toContain(s.title);
    expect(readme, `${s.source_id} missing from README.md`).toContain(s.title);
  }
});

// SCR-09 needs the scenario files, not the site's radiation background constants.
test.fixme("needs N-29", async ({ page }) => {
  await page.goto(`/?site=${process.env.E2E_SITE ?? "mock_site"}#/sources`);
  await expect(page.locator('[data-screen="SCR-09"] [data-slot="param-entry"]')).not.toHaveCount(0);
  await expect(page.locator('[data-screen="SCR-09"] [data-slot="replay-entry"]')).not.toHaveCount(0);
});
