/**
 * Check `ops-no-terminal` (replaces T25.08). Enabled by package 29.
 * The ops UI alone: load the scenario, start the EVA, speed 60x, raise an alert, approve an option, end, then the report. The test
 * never calls the API directly; `sendAsOps` only clicks ops-console controls.
 * The F4 fake scenario supplies the synthetic storm and real options. SCR-11 starts the library storm itself (N-200, BD-165); utility-rover
 * dispatch additionally needs the real bundle.
 */
import { expect, test } from "@playwright/test";
import { UTILITY_ROVER, openOpsFixture, openOpsPanel } from "../lib/opsFixture";
import { hold, jumpUntil, openFreshOps, resetThroughPresenter, sessionLog, sessionSnapshot, startPaused } from "../lib/liveMission";
import { e2eSite, REAL_SITE } from "../lib/siteBundle";

test("ops-no-terminal: load, start, storm, acknowledge, approve and end at SCR-17 using only SCR-11 (N-200)", async ({ context }) => {
  test.setTimeout(180_000);
  const { ops, wire } = await openFreshOps(context);
  try {
    await startPaused(ops, wire);
    // N-200 (BD-165): SCR-11 starts the library storm itself; the presenter is not needed.
    await wire.command("START_EVENT", () => ops.getByRole("button", { name: "Start storm", exact: true }).click());
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "ALERT_RAISED" && e.data.code === "RADIATION_ALERT"), "the scenario's storm raises its radiation alert");
    await openOpsPanel(ops, "mission");
    await expect(ops.getByRole("radio").first()).toBeVisible();
    const raised = wire.events().find((e) => e.kind === "ALERT_RAISED" && e.data.code === "RADIATION_ALERT")!;
    await wire.command("ACK_ALERT", () => ops.getByRole("button", { name: `Acknowledge alert: ${raised.data.message}`, exact: true }).click());
    const option = ops.locator('[role="radio"][data-option-kind="ABORT_TO_HAB"]');
    await expect(option).toHaveCount(1);
    await option.click();
    await wire.command("APPROVE_OPTION", () => hold(ops, ops.getByRole("button", { name: /Approve option/ })));
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "EVA_ENDED"), "EVA_ENDED reaches the ops console");
    await expect(ops).toHaveURL(/#\/report/);
    await expect(ops.locator('[data-screen="SCR-17"]')).toBeVisible();
    await expect(ops.locator('[data-slot="report-status"]')).toHaveCount(0);
    expect((await sessionSnapshot(ops)).session.status).toBe("ENDED");
    const log = await sessionLog(ops);
    for (const kind of ["EVA_STARTED", "ALERT_RAISED", "OPTIONS_PROPOSED", "ALERT_ACKED", "PLAN_REVISED", "EVA_ENDED"]) {
      expect(log.some((e) => e.kind === kind), kind).toBe(true);
    }
    expect(wire.commands.map((c) => c.kind)).toContain("JUMP_NEXT_EVENT");
    expect(wire.commands.filter((c) => c.kind === "APPROVE_OPTION")).toHaveLength(1);
  } finally { await ops.close(); await resetThroughPresenter(context); }
});


test("ops-no-terminal: the available console-only load, start, speed and event steps end at the live report", async ({ context }) => {
  test.setTimeout(180_000);
  const { ops, wire } = await openFreshOps(context);
  try {
    await startPaused(ops, wire);
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "EVA_ENDED"), "the unstormed EVA reaches its natural end");
    await expect(ops).toHaveURL(/#\/report/);
    await expect(ops.locator('[data-screen="SCR-17"]')).toBeVisible();
    await expect(ops.locator('[data-slot="report-status"]')).toHaveCount(0);
    expect((await sessionSnapshot(ops)).session.status).toBe("ENDED");
    const events = await sessionLog(ops);
    expect(events.some((e) => e.kind === "EVA_STARTED")).toBe(true);
    expect(events.some((e) => e.kind === "EVA_ENDED")).toBe(true);
    expect(wire.commands.filter((c) => c.kind === "LOAD_SCENARIO")).toHaveLength(1);
    expect(wire.commands.filter((c) => c.kind === "START_EVA")).toHaveLength(1);
    expect(wire.commands.some((c) => c.kind === "JUMP_NEXT_EVENT")).toBe(true);
  } finally { await ops.close(); await resetThroughPresenter(context); }
});


test("ops-no-terminal: approve step holds and sends one option (package 20)", async ({ page }) => {
  const { commands } = await openOpsFixture(page, "alerting");
  const option = page.getByRole("radio").first();
  await expect(option).toBeVisible();
  const approve = page.getByRole("button", { name: /Approve option/ });
  await approve.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.up("Space");
  expect(commands).toEqual([]);
  await page.keyboard.down("Space");
  await page.waitForTimeout(850);
  await page.keyboard.up("Space");
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]?.kind).toBe("APPROVE_OPTION");
  expect(commands[0]?.args.option_id).toBeTruthy();
});

test("ops-no-terminal: rover step from the vehicle card, target picked on the map, one TASK_ROVER (package 21)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "the ops console needs >= 1024 px");
  const { commands } = await openOpsFixture(page, "running", { vehicles: [UTILITY_ROVER] });
  await openOpsPanel(page, "crew");
  await page.getByRole("button", { name: "Task rover UR1" }).click();
  const dialog = page.locator('[data-screen="SCR-15"]');
  await expect(dialog).toContainText("UR1 /// ROVER TASKING");
  await dialog.locator('[data-task="SCOUT"]').click();
  await dialog.getByRole("button", { name: "Pick on map" }).click();
  await expect(page.locator(".ops-map-slot")).toHaveAttribute("data-picking", "true");
  const canvas = page.locator('[data-slot="ops-map"] [data-slot="map-canvas"]');
  await expect(canvas.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await canvas.click();
  await expect(dialog.locator('[data-field="target"]')).toHaveAttribute("data-source", "ui:map-pick");
  await dialog.locator("[data-action='confirm']").click();
  await expect(dialog.locator("[data-state='queued']")).toContainText("QUEUED");
  expect(commands).toHaveLength(1);
  expect(commands[0]?.kind).toBe("TASK_ROVER");
  expect(commands[0]?.args).toMatchObject({ vehicle_id: "UR1", task: "SCOUT" });
  const target = commands[0]?.args.target as { x_m: number; y_m: number };
  expect(Number.isFinite(target.x_m) && Number.isFinite(target.y_m)).toBe(true);
  // The layer list names relay coverage as not computed: no relay grid without a parked RELAY rover (FD-071).
  await expect(page.locator('[data-layer="relay_coverage"]')).toHaveText(/Relay coverage — not computed/);
});

test("ops-no-terminal: dispatch a rover target using keyboard traversal and map controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "the ops console needs >= 1024 px");
  const { commands } = await openOpsFixture(page, "running", { vehicles: [UTILITY_ROVER] });
  const tabTo = async (locator: import("@playwright/test").Locator) => {
    for (let i = 0; i < 150; i++) {
      if (await locator.evaluate((element) => element === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("Control was not reached by keyboard traversal");
  };
  const crewPanel = page.getByRole("button", { name: "Crew & vehicles", exact: true });
  if (await crewPanel.count() && await crewPanel.getAttribute("aria-expanded") === "false") {
    await tabTo(crewPanel);
    await page.keyboard.press("Enter");
  }
  await tabTo(page.getByRole("button", { name: "Task rover UR1" }));
  await page.keyboard.press("Enter");
  const dialog = page.locator('[data-screen="SCR-15"]');
  await tabTo(dialog.locator('[data-task="SCOUT"]'));
  await page.keyboard.press("Enter");
  await tabTo(dialog.getByRole("button", { name: "Pick on map" }));
  await page.keyboard.press("Enter");
  const viewport = page.locator('[data-slot="map-canvas"] [tabindex="0"]');
  await expect(viewport).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(dialog.locator('[data-field="target"]')).toHaveAttribute("data-source", "ui:map-pick");
  await tabTo(dialog.locator('[data-action="confirm"]'));
  await page.keyboard.press("Enter");
  await expect.poll(() => commands.filter((command) => command.kind === "TASK_ROVER").length).toBe(1);
  expect(commands.find((command) => command.kind === "TASK_ROVER")?.args).toMatchObject({ vehicle_id: "UR1", task: "SCOUT" });
});

test("ops-no-terminal: utility rover dispatch is acknowledged by the real Hab Core", async ({ context }) => {
  test.skip(e2eSite() !== REAL_SITE, "bundle absent (gale_boxwork utility rover scenario; F4 fake scenario has only PR1)");
  const { ops, wire } = await openFreshOps(context);
  try {
    await startPaused(ops, wire);
    await openOpsPanel(ops, "crew");
    const task = ops.getByRole("button", { name: /Task rover/ }).first();
    await expect(task).toBeVisible();
    await task.click();
    await ops.locator('[data-screen="SCR-15"] [data-task="RETURN"]').click();
    await wire.command("TASK_ROVER", () => ops.locator('[data-screen="SCR-15"] [data-action="confirm"]').click());
    await expect(ops.locator('[data-screen="SCR-15"] [data-state="enroute"]')).toBeVisible();
    expect(wire.events().some((e) => e.kind === "VEHICLE_DISPATCHED")).toBe(true);
  } finally { await ops.close(); await resetThroughPresenter(context); }
});
