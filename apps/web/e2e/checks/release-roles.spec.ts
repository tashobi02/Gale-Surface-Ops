/**
 * Check `release-roles` (backend package 28, T28.03; NFR-03, NFR-08, BD-02). Backend-owned.
 * Each live role view (ops, setup, presenter, both EVA tablets, both HUDs, Earth) opens in the project it runs on (the
 * Playwright device descriptors of the matrix: BD-02) and its WebSocket receives a SNAPSHOT from the Hab Core, with no CSP violation
 * (`connect-src 'self'`). One page per role at a time, because a role is held by one connection (newest wins).
 */
import { expect, test } from "@playwright/test";
import { collectCsp, e2eSiteId, watchFaults } from "../lib/release";

const LIVE_ROLES: { name: string; hash: string }[] = [
  { name: "ops", hash: "#/ops" },
  { name: "setup", hash: "#/setup" },
  { name: "presenter", hash: "#/presenter" },
  { name: "eva:EV1", hash: "#/eva/EV1" },
  { name: "eva:EV2", hash: "#/eva/EV2" },
  { name: "hud:EV1", hash: "#/hud/EV1" },
  { name: "hud:EV2", hash: "#/hud/EV2" },
  { name: "earth", hash: "#/earth" },
];

for (const role of LIVE_ROLES) {
  test(`release-roles: ${role.name} opens and receives a SNAPSHOT`, async ({ page }, info) => {
    const frames: string[] = [];
    page.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && frames.push(f.payload)));
    const faults = await watchFaults(page);
    await page.goto(`/?site=${e2eSiteId()}${role.hash}`);
    await expect.poll(() => frames.some((f) => /"type"\s*:\s*"SNAPSHOT"/.test(f)), { message: `${role.name} received no SNAPSHOT on ${info.project.name}`, timeout: 10_000 }).toBe(true);
    // The ops console and the setup screen name a minimum width and show "Use a larger screen" below it (SCR-11): that is the correct
    // view for a phone or a portrait tablet, and the width it names must be above this project's.
    const tooNarrow = page.getByRole("heading", { name: "Use a larger screen" });
    if (await tooNarrow.isVisible()) {
      const minimum = Number(/at least (\d+) px/.exec(await page.locator("main").innerText())?.[1]);
      expect(page.viewportSize()!.width, `${role.name} says it needs ${minimum} px`).toBeLessThan(minimum);
    } else {
      await page.waitForSelector("[data-provenance]", { state: "attached", timeout: 10_000 });
    }
    await collectCsp(page, faults);
    expect(faults.cspViolations, "CSP violations").toEqual([]);
    expect(faults.pageErrors, "uncaught page errors").toEqual([]);
  });
}
