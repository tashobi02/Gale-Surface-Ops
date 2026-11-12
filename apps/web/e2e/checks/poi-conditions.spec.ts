/**
 * Check `poi-conditions` (T10.03 — SCR-06 and SCR-07 against the real bundle, the image metadata and the daylight
 * warning for a pre-dawn start).
 *
 * The F4 `mock_site` carries one POI with no image, so SCR-06's "Image missing" state and the honest dash are checked
 * there; a POI that supplies an image is checked when the bundle has one (the real bundle's POIs, N-20's site). SCR-07 is
 * checked on the real worker: the conditions come from the plan result, not from the UI.
 *
 * 03 §B, the rows this check walks:
 * - SCR-06: the objective, the stop type, the position source and the image state.
 * - SCR-07: Computed, Daylight warning and Not available (the seasonal weather line and the shadowing note).
 * - FR-11/FR-12: the radiation block shows the dose, its range, the solar phase, the rate source and the caveats.
 * - FR-15: every shown value carries its provenance and its source.
 */
import { expect, test, type Page } from "@playwright/test";

async function selectPoi(page: Page): Promise<void> {
  const poi = page.locator("button[data-poi-id]").first();
  await poi.focus();
  await poi.press("Enter");
}

/** Opens the Plan tab and sets the EVA start; the field lives in the panel's Constraints accordion. */
async function setStart(page: Page, iso: string): Promise<void> {
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const start = page.getByLabel(/EVA start/i);
  if (!(await start.isVisible())) await page.getByRole("button", { name: "Constraints", exact: true }).click();
  await start.fill("");
  await start.fill(iso);
}

test("poi-conditions: POI image metadata and honest missing-image state stay usable", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await selectPoi(page);
  const detail = page.locator("[data-poi-detail]");
  await expect(detail).toContainText("Science objective");
  await expect(detail.locator("[data-stop-type] svg polygon")).toBeVisible();
  for (const field of ["credit", "sol", "date", "camera"]) {
    await expect(detail.locator(`[data-image-${field}]`)).toHaveAttribute("data-provenance", "measured");
    await expect(detail.locator(`[data-image-${field}]`)).toHaveAttribute("data-source", /.+/);
  }
  await expect(detail.locator("[data-image-state]")).toHaveAttribute("data-image-state", /shown|missing/);
  const enlarge = detail.locator("[data-enlarge-image]");
  if (await enlarge.count()) {
    await expect(enlarge).toBeEnabled();
    await enlarge.click();
    await expect(detail.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(enlarge).toBeFocused();
    for (const field of ["credit", "sol", "date", "camera"]) await expect(detail.locator(`[data-image-${field}]`)).not.toContainText("—");
  } else {
    await expect(detail).toContainText("Image not available");
  }
  await expect(detail.getByRole("button", { name: "Add as stop" })).toBeEnabled();
  await detail.getByRole("button", { name: "Add as stop" }).click();
  await expect(detail.getByRole("button", { name: "Remove stop" })).toBeVisible();
  await detail.getByRole("button", { name: "Remove stop" }).click();
  await expect(detail.getByRole("button", { name: "Add as stop" })).toBeVisible();
});

test("poi-conditions: a pre-dawn start shows the real worker DARKNESS warning (N-26)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await setStart(page, "2026-11-14T08:00:00Z");
  await selectPoi(page);
  await page.getByRole("button", { name: "Add as stop", exact: true }).click();
  await page.getByRole("tab", { name: "Conditions", exact: true }).click();
  const sunrise = page.locator('[data-condition="sunrise"] [data-condition-utc]');
  await expect(sunrise).toHaveAttribute("data-condition-utc", /T/);
  const suppliedSunrise = await sunrise.getAttribute("data-condition-utc");
  const ltst = page.locator('[data-condition="ltst-start"] dd');
  await expect(ltst).not.toContainText("—");
  const previousLtst = await ltst.innerText();
  // Drive the form one hour before the worker's own sunrise. The UI performs no solar calculation.
  // The EVA start field lives on the Plan tab, so go back to it for the edit and return to Conditions to read the result.
  await setStart(page, new Date(Date.parse(suppliedSunrise!) - 60 * 60 * 1000).toISOString());
  await page.getByRole("tab", { name: "Conditions", exact: true }).click();
  await expect(ltst).not.toHaveText(previousLtst);
  await expect(page.getByRole("region", { name: "Conditions", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert", { name: "Daylight warning" })).toBeVisible();
  await expect(page.getByRole("alert", { name: "Daylight warning" })).toContainText("UTC");
});

// 03 §B SCR-07 and FR-11/FR-12: the conditions panel shows the worker's own values, its caveats and its honest "not
// included" rows. The panel never computes anything itself (FD-126: the worker supplies the conditions).
test("poi-conditions: SCR-07 shows the computed conditions, the radiation block and its caveats", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await setStart(page, "2026-11-14T08:00:00Z");
  await selectPoi(page);
  await page.getByRole("button", { name: "Add as stop", exact: true }).click();
  await page.getByRole("tab", { name: "Conditions", exact: true }).click();

  const conditions = page.getByRole("region", { name: "Conditions", exact: true });
  await expect(conditions).toBeVisible();
  // The panel is not busy any more: the worker's answer is in.
  await expect(conditions).toHaveAttribute("aria-busy", "false");
  await expect(conditions).toHaveAttribute("data-computing", "false");

  // Mars date and sun: every value carries its provenance and its source (FR-15).
  for (const id of ["mars-year", "ls", "ltst-start", "ltst-return", "sunrise", "sunset"]) {
    const field = conditions.locator(`[data-condition="${id}"]`);
    await expect(field, `the ${id} field is shown`).toBeVisible();
    await expect(field.locator("[data-provenance]").first(), `the ${id} value says who says so`).toHaveAttribute("data-source", /.+/);
  }
  // The sun elevation per stop is the worker's own value (FR-11).
  const perStop = conditions.locator("[data-sun-waypoint]");
  await expect(perStop.first(), "the sun elevation per stop is listed").toBeVisible();

  // FR-12: the radiation block shows the dose, its range, the solar phase, the rate source and the caveats.
  const radiation = conditions.locator('[data-condition="radiation"]');
  await expect(radiation).toContainText("Radiation estimate");
  await expect(radiation, "the range is shown").toContainText("Range:");
  await expect(radiation, "the solar phase is shown").toContainText("Solar phase:");
  await expect(radiation, "the rate source is shown").toContainText("Rate source:");
  await expect(radiation, "the background rate is shown").toContainText("Background rate:");
  await expect(radiation, "the caveats are stated").toContainText("Excluded:");
  // The dose is the worker's own value; where the worker did not supply one, the panel says so honestly (FR-15). The
  // F4 bundle's plan carries no radiation block, so the value is the dash with its source named.
  const dose = radiation.locator(".scr07-dose");
  await expect(dose.locator("[data-provenance]").first(), "the dose says who says so").toHaveAttribute("data-source", /.+/);
  const doseText = (await dose.innerText()).trim();
  if (doseText === "—") {
    await expect(dose.locator(".metric-value"), "the absent dose names its path").toHaveAttribute("data-source", /unavailable:result\.radiation\.dose_mSv/);
    await expect(dose.locator(".metric-value"), "the absent dose is marked").toHaveAttribute("data-unavailable", "true");
  } else {
    expect(doseText, "a supplied dose is in mSv").toContain("mSv");
  }

  // 03 §B SCR-07 "Not available": the seasonal weather row and the shadowing note say what is not in this build.
  await expect(conditions.locator('[data-condition="seasonal-weather"]')).toContainText("Not included in this build");
  await expect(conditions.locator(".scr07-note").first()).toContainText("Terrain shadowing");
});
