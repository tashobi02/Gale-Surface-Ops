/**
 * Check `toggles` (replaces T07.15). The 300 ms part is enabled by package 08; the inspector part is enabled by package 28.
 * Each SCR-03 toggle repaints within 300 ms (`performance.now()` around the click until the map's next `postrender`, through
 * `window.__onNextPostrender`, which SCR-02 installs only with `?debug=1`); inspector values equal the grid cell read from
 * the manifest grid (05 §E.1 index) at three points (package 28: the inspector's selectors are package 07 and 08's `data-slot`s).
 *
 * The inspector part (T07.15) compares the popover with the site's own grid: the expected elevation is the bilinear
 * interpolation of the bundle's `elevation.f32` (02 §D.1) and the expected slope is the `slope_p90.u8` byte of the cell,
 * decoded as degrees × 4 (05 §C). The expected values are read from the bundle at run time, never written into this
 * file, so the check fails when the app and the bundle disagree.
 */
import { expect, test } from "@playwright/test";
import { fetchElevation, fetchFlags, fetchManifest, fetchSlopeP90, gridCellCentre, gridCellOf, gridOffset, interpolateElevation, slopeDegOf, type SiteGridMeta } from "../lib/siteGrid";

const REPAINT_BUDGET_MS = 300;
const INSPECTOR_POINTS = 3;
/** The inspector prints elevation and slope to one decimal (the popover's own format). */
const DISPLAY_DECIMALS = 1;
/** What the app shows for a value the backend did not supply (FR-15). */
const UNAVAILABLE_TEXT = "—";

/** One cell the check inspects, and what kind of cell it is. */
interface ChosenCell {
  i: number;
  j: number;
  kind: "sloped" | "flat" | "no-data";
}

/**
 * Three cells of the grid, picked from the bundle's own bytes: one with a slope above zero, one with a slope of zero
 * and one the bundle marks as no data. The check therefore exercises a measured value, a zero value and the honest
 * "—" state, whatever the site bundle happens to contain.
 *
 * A measured cell must have a measured neighbourhood: the elevation is interpolated bilinearly (02 §D.1), so a no-data
 * neighbour would make the whole sample no data and the cell would show "—" instead of a number.
 */
function chooseCells(meta: SiteGridMeta, slope: Uint8Array, flags: Uint8Array): ChosenCell[] {
  const cells: ChosenCell[] = [];
  const measured = (i: number, j: number): boolean => {
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const offset = gridOffset(meta, i + di, j + dj);
        if (slope[offset] === 255 || (flags[offset]! & 1) !== 0) return false;
      }
    }
    return true;
  };
  const pick = (kind: ChosenCell["kind"], test: (offset: number) => boolean, needsNeighbourhood: boolean): void => {
    // A measured cell needs a measured neighbourhood, so it is taken from the interior; a no-data cell may sit at the
    // edge of the grid, where a bundle keeps its uncovered strip.
    const from = needsNeighbourhood ? 2 : 0;
    for (let i = from; i < meta.height - from; i += 1) {
      for (let j = from; j < meta.width - from; j += 1) {
        const offset = gridOffset(meta, i, j);
        if (!test(offset)) continue;
        if (needsNeighbourhood && !measured(i, j)) continue;
        cells.push({ i, j, kind });
        return;
      }
    }
  };
  // 05 §C: 255 is the slope grid's no-data code; the flags byte carries the NO_DATA bit (bit 0).
  pick("sloped", (offset) => slope[offset] !== 255 && slope[offset]! > 0, true);
  pick("flat", (offset) => slope[offset] !== 255 && slope[offset] === 0, true);
  pick("no-data", (offset) => slope[offset] === 255 || (flags[offset]! & 1) !== 0, false);
  return cells;
}

test("toggles: every layer toggle repaints within 300 ms (package 08)", async ({ page }) => {
  await page.goto("/?site=mock_site&debug=1#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const enabled = '[data-drawer="left"] [data-layer-id] [role="switch"]:not([disabled])';
  const count = await page.locator(enabled).count();
  expect(count, "the layers panel has switches").toBeGreaterThan(0);
  // Every switch is pressed twice (on, then off): both directions repaint within the budget.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      const ms = await page.evaluate(
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
      );
      expect(ms, `switch ${i}, press ${pass + 1}`).toBeLessThanOrEqual(REPAINT_BUDGET_MS);
    }
  }
});

// Package 28 (T07.15): the inspector shows the values of the grid cell it sampled. Three cells of the F4 grid are
// inspected through the `?debug=1` hook and compared with the bundle's own grids.
test("toggles: inspector values equal the manifest grid cell at three points", async ({ page, request }) => {
  const site = process.env.E2E_SITE ?? "mock_site";
  const manifest = await fetchManifest(request, site);
  const elevation = await fetchElevation(request, site, manifest.grid);
  const slope = await fetchSlopeP90(request, site);
  const flags = await fetchFlags(request, site);

  await page.goto(`/?site=${site}&debug=1#/planner`);
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.waitForFunction(() => typeof (window as unknown as { __inspectAt?: unknown }).__inspectAt === "function");

  const popover = page.getByTestId("inspector-popover");
  // The cells are chosen from the grid the bundle ships, so the check exercises a sloped cell, a flat cell and a
  // no-data cell: a cell where the bundle has no value must show the honest "—" state, not a number.
  const cells = chooseCells(manifest.grid, slope, flags);
  expect(cells.length, "the bundle has a sloped, a flat and a no-data cell").toBe(INSPECTOR_POINTS);

  for (const cell of cells) {
    const centre = gridCellCentre(manifest.grid, cell.i, cell.j);
    // The point must fall in the cell the check claims: the centre formula and the index formula are inverses (05 §E.1).
    expect(gridCellOf(manifest.grid, centre.x_m, centre.y_m), `cell ${cell.i},${cell.j} centre`).toEqual({ i: cell.i, j: cell.j });

    await page.evaluate(([x, y]) => (window as unknown as { __inspectAt: (x: number, y: number) => Promise<unknown> }).__inspectAt(x!, y!), [centre.x_m, centre.y_m]);
    await expect(popover, `the inspector opens at cell ${cell.i},${cell.j}`).toBeVisible();

    const shown = await popover.locator("[data-field]").evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [el.getAttribute("data-field"), el.textContent?.trim() ?? ""])),
    );
    expect(Object.keys(shown), "the inspector shows its fields").toContain("elevation");

    const offset = gridOffset(manifest.grid, cell.i, cell.j);
    const expectedSlope = slopeDegOf(slope[offset]!);
    if (cell.kind === "no-data") {
      // The bundle marks this cell as no data: the inspector must say so, not show a number (FR-15, "—" for a value the
      // backend did not supply).
      expect(shown.slope, `slope at the no-data cell ${cell.i},${cell.j}`).toBe(UNAVAILABLE_TEXT);
      await expect(popover.locator('[data-field="slope"]')).toHaveAttribute("data-unavailable", "true");
      expect(shown.elevation, `elevation at the no-data cell ${cell.i},${cell.j}`).toBe(UNAVAILABLE_TEXT);
      await expect(popover.locator('[data-field="elevation"]')).toHaveAttribute("data-unavailable", "true");
    } else {
      expect(shown.slope, `slope at cell ${cell.i},${cell.j}`).toBe(`${expectedSlope!.toFixed(DISPLAY_DECIMALS)}°`);
      // 02 §D.1: a sample is no data when the elevation cannot be interpolated, when the cell's flag byte says so or
      // when the raw slope byte is the 255 no-data code. Then every value reads "—".
      const expectedElevation = interpolateElevation(manifest.grid, elevation, centre.x_m, centre.y_m);
      const noData = Number.isNaN(expectedElevation) || (flags[offset]! & 1) !== 0 || slope[offset] === 255;
      if (noData) {
        expect(shown.elevation, `elevation at cell ${cell.i},${cell.j}`).toBe(UNAVAILABLE_TEXT);
      } else {
        // The popover prints the elevation to one decimal.
        expect(shown.elevation, `elevation at cell ${cell.i},${cell.j}`).toBe(`${expectedElevation.toFixed(DISPLAY_DECIMALS)} m`);
      }
    }
    // Every displayed value carries its provenance and its source (FR-15).
    for (const field of ["position", "elevation", "slope"]) {
      if (shown[field] === undefined) continue;
      const node = popover.locator(`[data-field="${field}"]`);
      await expect(node, `${field} provenance`).toHaveAttribute("data-provenance", /measured|derived|modelled|assumed/);
      await expect(node, `${field} source`).toHaveAttribute("data-source", /.+/);
    }
  }
});
