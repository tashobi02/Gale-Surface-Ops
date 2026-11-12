/** Package 25: exercise the real N-07 snapshot, SCR-06 placement and SCR-04 task editor on F4. */
import { expect, type Page } from "@playwright/test";
import type { TaskLibraryEntry } from "@marswalk/protocol";
import { openPlanTab } from "./planner";

export async function openPoiTasks(page: Page) {
  await openPlanTab(page);
  const response = await page.request.get("api/session");
  expect(response.ok()).toBe(true);
  const { task_library: library } = await response.json() as { task_library: TaskLibraryEntry[] };
  const poiId = await page.locator("button[data-poi-id]").first().getAttribute("data-poi-id");
  const suggested = library.filter(task => task.poi_id === poiId);
  expect(suggested.length, "F7 supplies suggested tasks for the F4 POI").toBeGreaterThan(0);
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  const poi = page.locator(`button[data-poi-id="${poiId}"]`);
  await poi.focus();
  await poi.press("Enter");
  const detail = page.getByRole("region", { name: "POI detail", exact: true });
  for (const task of suggested) await expect(detail.getByRole("region", { name: "Suggested tasks" })).toContainText(task.text);
  await detail.getByRole("button", { name: "Add as stop" }).click();
  const left = page.locator('[data-drawer="left"]');
  if (await left.isHidden()) await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const editor = page.locator('[data-waypoint-id="wp-1"] [data-stop-task-editor]');
  await expect(editor.locator("[data-task-text]")).toHaveCount(suggested.length);
  await expect(page.locator('[data-slot="plan-panel"]')).toHaveAttribute("data-plan-state", "editing");
  return { editor, suggested };
}
