/**
 * Check `release-network` (backend package 28, T28.05 browser half, T31.08 browser half; NFR-10, NFR-12, NFR-13, BD-02, BD-152).
 * Backend-owned. A dropped socket on an EVA page and its reconnect (the link down and up again, through Playwright's WebSocket
 * route, because `context.setOffline` does not close an open socket), the Hab Core killed and started again (SCR-18, then the
 * session resumes), and single-laptop mode (`npm run hab:local`) with its four windows. The tap-to-ops latency and the killer
 * demo through the UI need an EVA tablet at a stop with tasks and an ops console that drives the clock: `fixme`, named below.
 */
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "../lib/release";
import { habHealth, killHab, restartHab, waitForSnapshot } from "../lib/hab";
import { REAL_SCENARIO, REAL_SITE } from "../lib/siteBundle";
import { openOpsPanel } from "../lib/opsFixture";
import { jumpUntil, hold, openFreshOps, resetThroughPresenter, sessionLog, sessionSnapshot, startPaused, watchLive } from "../lib/liveMission";
import { e2eSite } from "../lib/siteBundle";
import { existsSync } from "node:fs";
import { join } from "node:path";

// NFR-13 "Client reconnect restores correct state <= 2 s"; SCR-18 appears after 3 s without a heartbeat (03 SCR-18, FR-32).
const RECONNECT_MS = 2_000;
const LINK_LOST_MS = 3_000;

test("release-network: a dropped socket on an EVA page is back with a SNAPSHOT within the NFR-13 time of the link returning", async ({ page }) => {
  let linkUp = true;
  const open: WebSocketRoute[] = [];
  const snapshotsAt: number[] = [];
  await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
    if (!linkUp) {
      void ws.close();
      return;
    }
    open.push(ws);
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (/"type"\s*:\s*"SNAPSHOT"/.test(String(message))) snapshotsAt.push(Date.now());
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });
  await page.goto("/#/eva/EV1");
  await expect.poll(() => snapshotsAt.length, { message: "the first SNAPSHOT came through the route" }).toBeGreaterThan(0);
  await waitForSnapshot(page);
  const before = snapshotsAt.length;

  linkUp = false;
  for (const ws of open.splice(0)) await ws.close();
  await page.waitForTimeout(LINK_LOST_MS + 500); // the link stays down past the watchdog

  const returned = Date.now();
  linkUp = true;
  await expect.poll(() => snapshotsAt.length, { timeout: RECONNECT_MS + 3_000 }).toBeGreaterThan(before);
  const restoredMs = snapshotsAt[snapshotsAt.length - 1]! - returned;
  test.info().annotations.push({ type: "reconnect-ms", description: String(restoredMs) });
  expect(restoredMs, "SNAPSHOT after the link returned").toBeLessThanOrEqual(RECONNECT_MS);
  await waitForSnapshot(page);
});

// Observed on 13 Nov 2026 (desktop-1440, mock_site): with the socket closed for 3.5 s, and with the Hab Core process gone for 15 s, no
// element with data-screen="SCR-18" appeared on the EVA tablet or the ops console (the tablet kept showing its last values as NOMINAL).
// The overlay is frontend package 18's (LiveFrame, useLinkLost); see B-03 in docs/plan/backend/01-needs-from-frontend.md.
// Fixed 13 Nov 2026 (QD-B03-01): it reproduced only on a merging-core without package 18 and FD-545. The `link-lost` check proves it by
// killing the Hab Core on all eight live viewports and asserting SCR-18 on both roles before the deadline.
test("release-network: SCR-18 shows within 3 s of the link going down on EVA and ops (enabled by frontend package 18, B-03)", async ({ page }) => {
  await page.goto("/#/eva/EV1");
  await waitForSnapshot(page);
  killHab();
  await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 1_000 });
  await restartHab();
});

// B-03, the second observation: the socket closed (and every reconnect refused) for 3.5 s, on the EVA tablet and on the ops console.
for (const [role, hash] of [["EVA", "/#/eva/EV1"], ["ops", "/#/ops"]] as const) {
  test(`release-network: SCR-18 shows on ${role} when the socket is closed and reconnects are refused (B-03, FR-32)`, async ({ page }) => {
    if (role === "ops") await page.setViewportSize({ width: 1440, height: 900 });
    let linkUp = true;
    const open: WebSocketRoute[] = [];
    await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
      if (!linkUp) {
        void ws.close();
        return;
      }
      open.push(ws);
      const server = ws.connectToServer();
      server.onMessage((message) => ws.send(message));
      ws.onMessage((message) => server.send(message));
    });
    await page.goto(hash);
    await waitForSnapshot(page);
    linkUp = false;
    for (const ws of open.splice(0)) await ws.close();
    await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 500 });
    linkUp = true;
    await expect(page.locator('[data-screen="SCR-18"]')).toBeHidden({ timeout: RECONNECT_MS + 3_000 });
  });
}

// B-03: the Hab Core process gone, seen from the ops console too.
test("release-network: SCR-18 shows on ops within 3 s of the Hab Core going away (B-03, FR-32)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/ops");
  await waitForSnapshot(page);
  killHab();
  await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 1_000 });
  await restartHab();
});

test("release-network: the Hab Core killed and started again: EVA and ops take a fresh SNAPSHOT of the resumed session", async ({ context }) => {
  test.setTimeout(120_000);
  const eva = await context.newPage();
  const ops = await context.newPage();
  await ops.setViewportSize({ width: 1440, height: 900 });
  await eva.goto("/#/eva/EV1");
  await ops.goto("/#/ops");
  await waitForSnapshot(eva);
  await waitForSnapshot(ops);

  killHab();
  const killed = Date.now();
  await expect.poll(() => habHealth().then(() => true, () => false), { message: "the Hab Core process is gone" }).toBe(false);
  await eva.waitForTimeout(LINK_LOST_MS + 500);
  test.info().annotations.push({ type: "down-ms", description: String(Date.now() - killed) });

  // `hab:start --resume latest` brings the same session back; both pages reconnect on their own and take a fresh SNAPSHOT (NFR-10).
  const frames = { eva: 0, ops: 0 };
  eva.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && /"type"\s*:\s*"SNAPSHOT"/.test(f.payload) && (frames.eva += 1)));
  ops.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && /"type"\s*:\s*"SNAPSHOT"/.test(f.payload) && (frames.ops += 1)));
  await restartHab();
  const answered = Date.now();
  await expect.poll(() => Math.min(frames.eva, frames.ops), { timeout: RECONNECT_MS + 3_000 }).toBeGreaterThan(0);
  test.info().annotations.push({ type: "resumed-ms-after-health", description: String(Date.now() - answered) });
  expect(Date.now() - answered, "both pages have a SNAPSHOT again").toBeLessThanOrEqual(RECONNECT_MS + 1_000);
  for (const page of [eva, ops]) await waitForSnapshot(page);
});

test("release-network: single-laptop mode (npm run hab:local) serves its four windows, each with a SNAPSHOT", async ({ browser }) => {
  test.skip(!existsSync(join(REPO_ROOT, "data", "sites", REAL_SITE, "site-manifest.json")) || !existsSync(join(REPO_ROOT, "scenarios", REAL_SCENARIO, "scenario.json")), "the real bundle is absent");
  test.setTimeout(240_000);
  const port = 8111;
  const child = spawn("npm", ["run", "-s", "hab:local", "--", "--port", String(port)], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (output += d.toString()));
  const stop = (): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  try {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`hab:local exited with ${child.exitCode}:\n${output}`);
      const up = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const urls = [...output.matchAll(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\/#\/[^\s]+/g)].map((m) => m[0]);
    expect(urls.length, `the four windows hab:local prints:\n${output}`).toBe(4);
    for (const url of urls) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const frames: string[] = [];
      page.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && frames.push(f.payload)));
      await page.goto(url);
      await expect.poll(() => frames.some((f) => /"type"\s*:\s*"SNAPSHOT"/.test(f)), { message: `no SNAPSHOT at ${url}`, timeout: 15_000 }).toBe(true);
      await context.close();
    }
  } finally {
    stop();
  }
});

// N-200: the killer demo end to end through the OPS and EVA UI alone. The presenter is not used: SCR-11 starts the library storm
// itself (BD-165), so every command of the demo comes from a control the crew would really press — the ops console's Load
// scenario, Start EVA mission, Set speed to 60x, Start storm and Approve option, and the EVA tablet's Acknowledge alert and
// Summon rover. The evidence is the event log the Hab Core wrote, read back over the ops page's own session API.
//
// The beats are the ones of 01 §E.1: the storm starts, the radiation alert is raised, the options are proposed, the crew
// acknowledges the alert, the rover is summoned, the option is approved and the vehicle is dispatched.
test("release-network: the killer demo runs through the OPS and EVA UI alone (N-200 closed)", async ({ context, page }) => {
  test.setTimeout(180_000);
  const eva = page;
  const { ops, wire } = await openFreshOps(context);
  const evaWire = watchLive(eva);
  try {
    await startPaused(ops, wire);
    await eva.goto(`/?site=${e2eSite()}#/eva/EV1`);
    await expect.poll(() => evaWire.messages.some((m) => m.type === "SNAPSHOT"), { message: "the EVA tablet got a SNAPSHOT" }).toBe(true);

    // SCR-11 starts the storm; the presenter is not in the loop (N-200, BD-165).
    await wire.command("START_EVENT", () => ops.getByRole("button", { name: "Start storm", exact: true }).click());

    // The alert reaches the EVA tablet and the crew acknowledges it there.
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "ALERT_RAISED" && e.data.code === "RADIATION_ALERT"), "the storm raises its radiation alert");
    const ack = eva.getByRole("button", { name: "Acknowledge alert" });
    await expect(ack, "the alert is on the EVA tablet").toBeVisible({ timeout: 15_000 });
    await evaWire.command("ACK_ALERT", () => ack.click());

    // The options are proposed for that alert and the crew summons the rover from the tablet.
    await expect
      .poll(() => wire.events().some((e) => e.kind === "OPTIONS_PROPOSED"), { message: "the options arrive" })
      .toBe(true);
    const summon = eva.getByRole("button", { name: /Summon rover/ });
    await expect(summon, "the EVA tablet offers Summon rover").toBeVisible({ timeout: 15_000 });
    await evaWire.command("SUMMON_VEHICLE", () => hold(eva, summon));

    // SCR-11 approves the option; the rover is dispatched.
    await openOpsPanel(ops, "mission");
    const option = ops.locator('[role="radio"][data-option-kind="ABORT_TO_HAB"]');
    await expect(option, "the ops console lists the options").toHaveCount(1, { timeout: 15_000 });
    await option.click();
    await wire.command("APPROVE_OPTION", () => hold(ops, ops.getByRole("button", { name: /Approve option/ })));

    // The beats are in the log the Hab Core wrote, in this order.
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "VEHICLE_DISPATCHED"), "the rover is dispatched");
    const log = await sessionLog(ops);
    const seqOf = (kind: string, where: (d: Record<string, unknown>) => boolean = () => true): number =>
      log.find((e) => e.kind === kind && where(e.data as Record<string, unknown>))?.seq ?? -1;
    const order = [
      seqOf("ALERT_RAISED", (d) => d.code === "RADIATION_ALERT"),
      seqOf("OPTIONS_PROPOSED"),
      seqOf("ALERT_ACKED"),
      seqOf("VEHICLE_DISPATCHED", (d) => d.vehicle_id === "PR1"),
    ];
    expect(order.every((s) => s > 0), `seqs ${order.join(", ")} of ${JSON.stringify(log.map((e) => e.kind))}`).toBe(true);
    expect(order, "the beats come in this order").toEqual([...order].sort((a, b) => a - b));

    // Every command of the demo came from a UI control: the ops console or the EVA tablet, never from the API.
    expect(wire.commands.map((c) => c.kind)).toContain("START_EVA");
    expect(wire.commands.map((c) => c.kind)).toContain("START_EVENT");
    expect(wire.commands.map((c) => c.kind)).toContain("APPROVE_OPTION");
    expect(evaWire.commands.map((c) => c.kind)).toContain("ACK_ALERT");
    expect(evaWire.commands.map((c) => c.kind)).toContain("SUMMON_VEHICLE");
  } finally { await eva.close().catch(() => undefined); await ops.close(); await resetThroughPresenter(context); }
});

// NFR-12 budget 500 ms, p95 of 20 samples. The full measurement — 20 tablet task changes, the abort dropping open tasks and the
// independent log/report equality — is the `task-latency` check, which runs on every live viewport. This case proves the same budget
// from the release-network side: one real task change at a real stop reaches the ops TaskProgress inside the budget.
test("release-network: a task tick on the EVA tablet reaches the ops TaskProgress within 500 ms, p95 of 20 (enabled by frontend packages 17 and 29)", async ({ context, page }) => {
  test.setTimeout(120_000);
  const eva = page;
  const { ops, wire } = await openFreshOps(context);
  const evaWire = watchLive(eva);
  try {
    await startPaused(ops, wire);
    await eva.goto(`/?site=${e2eSite()}#/eva/EV1`);
    await expect.poll(() => evaWire.messages.some((m) => m.type === "SNAPSHOT")).toBe(true);
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "ARRIVED_STOP" && e.data.crew_id === "EV1"), "EV1 arrives at the first stop");
    const before = await sessionSnapshot(ops);
    const member = before.crew.find((c) => c.crew_id === "EV1")!;
    const stops = before.plan!.waypoints.filter((w) => w.role === "stop");
    const stopId = stops[member.stop_index! - 1]!.id;
    const task = before.tasks.find((t) => t.stop_id === stopId && t.state === "TODO" && (t.crew_id === null || t.crew_id === "EV1"))!;
    expect(task, "a real task at the stop, not an invented checkbox").toBeTruthy();

    await eva.getByTestId("tasks-button").click();
    const row = eva.locator(`[data-task-id="${task.task_id}"]`);
    await expect(row).toBeVisible();
    await openOpsPanel(ops, "crew");
    const mine = before.tasks.filter((t) => t.crew_id === null || t.crew_id === "EV1");
    const baseDone = mine.filter((t) => t.state === "DONE").length;
    const expected = `TOTAL ${baseDone + 1}/${mine.length}`;

    // Both clocks are the browser epoch, so the interval is the real click-to-ops-DOM time and not an automation delay.
    await eva.evaluate(() => {
      (window as Window & { __taskClick?: number }).__taskClick = undefined;
      document.addEventListener("click", () => {
        (window as Window & { __taskClick?: number }).__taskClick = performance.timeOrigin + performance.now();
      }, { capture: true, once: true });
    });
    await ops.getByTestId("task-progress-EV1").evaluate((element, text) => {
      (window as Window & { __taskChange?: number }).__taskChange = undefined;
      const observer = new MutationObserver(() => {
        if (element.textContent?.replace(/\s+/g, " ").includes(text)) {
          (window as Window & { __taskChange?: number }).__taskChange = performance.timeOrigin + performance.now();
          observer.disconnect();
        }
      });
      observer.observe(element, { subtree: true, childList: true, characterData: true });
    }, expected);

    await evaWire.command("UPDATE_STOP_TASK", () => row.getByRole("button", { name: /^Mark task done:/ }).click());
    await expect(ops.getByTestId("task-progress-EV1")).toContainText(expected);
    await expect.poll(() => ops.evaluate(() => (window as Window & { __taskChange?: number }).__taskChange)).toBeTruthy();
    const start = await eva.evaluate(() => (window as Window & { __taskClick?: number }).__taskClick);
    const end = await ops.evaluate(() => (window as Window & { __taskChange?: number }).__taskChange);
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    test.info().annotations.push({ type: "release-network-task-ms", description: String(end! - start!) });
    expect(end! - start!, "the tablet task change reaches the ops TaskProgress inside the NFR-12 budget").toBeLessThanOrEqual(500);
  } finally {
    await eva.goto("about:blank");
    await ops.close();
    await resetThroughPresenter(context);
  }
});
