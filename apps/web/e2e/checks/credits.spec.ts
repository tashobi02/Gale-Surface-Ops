/**
 * Check `credits` (replaces T16.05). Enabled by package 31.
 * Every manifest DataSource and every image credit appears in SCR-09 and in `README.md`.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("credits: every DataSource and image credit is in SCR-09 and README.md", async ({ page, request }) => {
  const site = process.env.E2E_SITE ?? "mock_site";
  const manifest = (await (await request.get(`/sites/${site}/site-manifest.json`)).json()) as { sources: { source_id: string; title: string; credit: string }[]; pois_asset: string; assets: { asset_id: string; path: string }[] };
  const readme = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "README.md"), "utf8");
  const poisPath = manifest.assets.find((asset) => asset.asset_id === manifest.pois_asset)?.path;
  expect(poisPath).toBeTruthy();
  const pois = (await (await request.get(`/sites/${site}/${poisPath}`)).json()) as { features: { properties: { image_credit?: string } }[] };
  await page.goto(`/?site=${site}#/sources`);
  await page.waitForLoadState("networkidle");
  const screen = await page.locator("body").innerText();
  for (const s of manifest.sources) {
    expect(screen, `${s.source_id} missing from SCR-09`).toContain(s.title);
    expect(readme, `${s.source_id} missing from README.md`).toContain(s.title);
    expect(screen, `${s.source_id} credit missing from SCR-09`).toContain(s.credit);
    expect(readme, `${s.source_id} credit missing from README.md`).toContain(s.credit);
  }
  for (const { properties } of pois.features) {
    if (!properties.image_credit) continue;
    expect(readme).toContain(properties.image_credit);
    expect(screen).toContain(properties.image_credit);
  }
});

// SCR-09 needs the scenario files, not the site's radiation background constants.
test("SCR-09 lists the ParamSets and the replay source (N-30 closed)", async ({ page }) => {
  await page.goto(`/?site=${process.env.E2E_SITE ?? "mock_site"}#/sources`);
  await expect(page.locator('[data-screen="SCR-09"] [data-slot="param-entry"]')).not.toHaveCount(0);
  await expect(page.locator('[data-screen="SCR-09"] [data-slot="replay-entry"]')).not.toHaveCount(0);
});
