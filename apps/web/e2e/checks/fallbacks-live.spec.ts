/** Package 34: break primary paths and retain honest safety controls (FD-193, FD-500–504). */
import { expect, test } from "@playwright/test";
import { LINK_LOST_AFTER_MS, type ServerMessage } from "@marswalk/protocol";
import { openSurfaceFixture, surfaceSnapshot } from "../lib/surfaceFixture";
import { openOpsFixture } from "../lib/opsFixture";
import { asOrtho } from "../lib/fallbacks";
import { readFileSync } from "node:fs";

const messages = JSON.parse(readFileSync(new URL("../../tests/fixtures/ws/radiation-alert.json", import.meta.url), "utf8")) as ServerMessage[];

// The F4 mock site declares no optical basemap, so these checks give it one (its elevation tiles, as package 33 does) and then break
// that basemap from outside the app. A site without an ortho is a complete map, not a failed one (FD-505).
const TILE = /\/sites\/mock_site\/tiles\/elevation\/\d+\/\d+\/\d+\.png(\?.*)?$/;

test("fallbacks-live: a refused ortho leaves text navigation, ACK and held abort usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asOrtho(page);
  const refused: string[] = [];
  await page.route(TILE, route => { refused.push(route.request().url()); return route.abort(); });
  const commands: { kind: string; args: Record<string, unknown> }[] = [];
  const fixture = await openSurfaceFixture(page, "eva", surfaceSnapshot("alerting"), commands);
  try {
    const fallback = page.locator('[data-fallback="hud-only"]');
    await expect(fallback).toBeVisible();
    expect(refused.length).toBeGreaterThan(0); // the primary path was really asked for its tiles and refused
    await expect(fallback).toContainText("Map unavailable — HUD only");
    await expect(fallback.locator('[data-status="unknown"]')).toBeVisible();
    await expect(fallback.locator('[data-unavailable="true"]')).toHaveAttribute("data-source", "unavailable:site.map");
    await expect(page.locator('[data-slot="map-canvas"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open full-screen map" })).toHaveCount(0);
    await expect(page.locator('[data-slot="haven"] .value')).not.toHaveText("—");
    await page.getByRole("button", { name: "Acknowledge alert", exact: true }).click();
    const abort = page.getByRole("button", { name: /Abort to hab/i });
    await abort.focus();
    await page.keyboard.down("Space");
    await expect.poll(() => commands.map(c => c.kind)).toContain("ABORT"); // 04 §D.3: deliberate hold
    await page.keyboard.up("Space");
    await expect.poll(() => commands.map(c => c.kind)).toContain("ACK_ALERT");
    await expect.poll(() => commands.map(c => c.kind)).toContain("ABORT");
  } finally { fixture.dispose(); }
});

test("fallbacks-live: the same ortho with its tiles served keeps the mini-map and FULL MAP (the primary path is unchanged)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asOrtho(page);
  let served = 0;
  page.on("response", response => { if (TILE.test(response.url()) && response.ok()) served += 1; });
  const fixture = await openSurfaceFixture(page, "eva");
  try {
    await expect.poll(() => served).toBeGreaterThan(0);
    await page.waitForTimeout(LINK_LOST_AFTER_MS + 500); // the first tile cancelled the watchdog: it must not fire later
    await expect(page.locator('[data-fallback="hud-only"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="map-canvas"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Open full-screen map" }).click();
    await expect(page.locator("[data-fullmap]")).toHaveAttribute("data-map-status", "ready");
  } finally { fixture.dispose(); }
});

test("fallbacks-live: one lost ortho tile among served ones is not a failed map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asOrtho(page);
  const refused: string[] = [];
  let served = 0;
  await page.route(TILE, route => {
    if (refused.length > 0) return route.fallback();
    refused.push(route.request().url());
    return route.fulfill({ status: 404, contentType: "text/plain", body: "one tile refused by the check" });
  });
  page.on("response", response => { if (TILE.test(response.url()) && response.ok()) served += 1; });
  const fixture = await openSurfaceFixture(page, "eva");
  try {
    await expect.poll(() => refused.length).toBe(1);
    await expect.poll(() => served).toBeGreaterThan(0);
    await page.waitForTimeout(LINK_LOST_AFTER_MS + 500);
    await expect(page.locator('[data-fallback="hud-only"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open full-screen map" })).toBeVisible();
  } finally { fixture.dispose(); }
});

test("fallbacks-live: keys-only clock survives blocked pointer events and keeps acknowledgement", async ({ page }) => {
  // A pointer failure is real browser input loss, not a mocked command callback.
  await page.addInitScript(() => {
    for (const event of ["pointerdown", "pointerup", "click"]) document.addEventListener(event, e => { if (!e.isTrusted) return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
  });
  const { commands } = await openOpsFixture(page, "alerting", { clockKeys: true });
  await expect(page.locator('[data-fallback="clock-keys"]')).toContainText("Space");
  await expect(page.getByRole("button", { name: "Set speed to 10x", exact: true })).toHaveCount(0);
  for (const key of ["2", "Space", "n", "k"]) await page.keyboard.press(key);
  await expect.poll(() => commands.map(c => c.kind)).toEqual(["SET_CLOCK", "SET_CLOCK", "JUMP_NEXT_EVENT", "ACK_ALERT"]);
  expect(commands[0]!.args).toEqual({ speed: 10 });
});

test("fallbacks-live: denied task authoring becomes view-only and still receives crew progress", async ({ page }) => {
  const { commands, snapshot, send } = await openOpsFixture(page, "running", { denyTask: true });
  await page.getByRole("button", { name: "Add task for EV1", exact: true }).click();
  await page.getByRole("textbox", { name: "Enter task description", exact: true }).fill("Observe terrain");
  await page.getByRole("button", { name: "ADD TASK", exact: true }).click();
  await expect(page.locator('[data-fallback="tasks-view-only"]').first()).toContainText("View only");
  await expect(page.getByRole("button", { name: "Add task for EV1", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("task-progress-EV1")).toContainText("TOTAL");
  expect(commands.filter(c => c.kind === "ADD_STOP_TASK")).toHaveLength(1);
  const alert = messages.find(message => message.type === "EVENT");
  if (!alert || alert.type !== "EVENT") throw new Error("committed alert fixture required");
  snapshot.seq += 1;
  snapshot.tasks = snapshot.tasks.map(task => ({ ...task, state: "DONE" }));
  snapshot.alerts = [{ ...alert.event.data, raised_seq: alert.seq, acked_seq: null, cleared_seq: null, acked_by: null }] as typeof snapshot.alerts;
  send(snapshot);
  const total = snapshot.tasks.filter(task => task.crew_id === "EV1" || task.crew_id === null).length;
  await expect(page.getByTestId("task-progress-EV1")).toContainText(`TOTAL ${total}/${total}`);
  await page.keyboard.press("k");
  await expect.poll(() => commands.map(c => c.kind)).toContain("ACK_ALERT");
});

test("fallbacks-live: report 500 and unavailable log terminate with labelled absence and retry", async ({ page }) => {
  await page.route("**/api/report", route => route.fulfill({ status: 500, body: '{"error":"report unavailable"}' }));
  await page.route("**/api/log", route => route.fulfill({ status: 500, body: "log unavailable" }));
  await page.goto("/?site=mock_site#/report");
  const fallback = page.locator('[data-fallback="report-log"]');
  await expect(fallback).toContainText("Log unavailable");
  await expect(fallback.locator('[data-unavailable="true"]').first()).toHaveText("—");
  await expect(page.locator('[data-slot="report-retry"]')).toBeEnabled();
  await expect(fallback.getByRole("button", { name: "← BACK", exact: true })).toBeEnabled();
});

test("fallbacks-live: stale snapshot with no options retains ACK and abort without a map", async ({ page }) => {
  await page.route("**/sites/**/site-manifest.json", route => route.abort());
  const snapshot = surfaceSnapshot("alerting");
  snapshot.options = [];
  snapshot.crew.forEach(member => { member.stale = true; member.linked = false; });
  const commands: { kind: string; args: Record<string, unknown> }[] = [];
  const fixture = await openSurfaceFixture(page, "eva", snapshot, commands);
  try {
    await expect(page.locator('[data-fallback="hud-only"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Acknowledge alert", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Abort to hab/i })).toBeEnabled();
    await expect(page.locator('[data-slot="haven"]')).toContainText("STALE");
    await expect(page.locator('[data-screen="SCR-14"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Acknowledge alert", exact: true }).click();
    await page.getByRole("button", { name: /Abort to hab/i }).focus();
    await page.keyboard.down("Space");
    await expect.poll(() => commands.map(c => c.kind)).toContain("ABORT");
    await page.keyboard.up("Space");
    await expect.poll(() => commands.map(command => command.kind)).toContain("ACK_ALERT");
    await expect.poll(() => commands.map(command => command.kind)).toContain("ABORT");
    fixture.stop();
    await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_AFTER_MS * 2 });
  } finally { fixture.dispose(); }
});

test("fallbacks-live: missing replay recording gives a reason and no endless loading", async ({ page }) => {
  await page.route("**/replay/recording.json", route => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/?site=mock_site#/replay");
  await expect(page.getByRole("alert")).toContainText("404");
  await expect(page.locator('[data-replay-state="loading"]')).toHaveCount(0);
});
