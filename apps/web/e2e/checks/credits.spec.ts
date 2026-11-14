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
test("SCR-09 lists the ParamSets and the replay source (N-30 closed)", async ({ page, request }) => {
  const response = await request.get("/api/scenario-meta");
  expect(response.ok()).toBeTruthy();
  const metadata = await response.json() as {
    param_sets: { param_set_id: string; title: string; provenance: string; source_ids: string[]; values: Record<string, unknown> }[];
    dose_series: { source_id: string; title: string | null };
  };
  expect(metadata.param_sets.length).toBeGreaterThan(0);
  expect(metadata.dose_series.source_id).toBeTruthy();
  expect(metadata.dose_series.title).toBeTruthy();
  await page.goto(`/?site=${process.env.E2E_SITE ?? "mock_site"}#/sources`);
  const params = page.locator('[data-screen="SCR-09"] [data-slot="param-entry"]');
  await expect(params.first()).toBeVisible();
  await expect(params).toHaveCount(metadata.param_sets.length);
  for (const param of metadata.param_sets) {
    const row = params.and(page.locator(`[data-param-id="${param.param_set_id}"]`));
    await expect(row).toContainText(param.title);
    await expect(row).toHaveAttribute("data-provenance", param.provenance);
    await expect(row).toHaveAttribute("data-source", param.source_ids[0] ?? "unavailable:param-set-source");
    for (const [key, value] of Object.entries(param.values)) {
      const field = row.locator("span").filter({ hasText: `${key}: ${String(value)}` });
      await expect(field).toHaveAttribute("data-provenance", param.provenance);
      await expect(field).toHaveAttribute("data-source", param.source_ids[0] ?? "unavailable:param-set-source");
    }
  }
  const replay = page.locator('[data-screen="SCR-09"] [data-slot="replay-entry"]');
  await expect(replay).toHaveCount(1);
  await expect(replay).toHaveText(metadata.dose_series.title!);
  await expect(replay).toHaveAttribute("data-source", metadata.dose_series.source_id);
  await expect(replay).toHaveAttribute("data-provenance", "replayed");
});
