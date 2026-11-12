/// <reference types="node" />
/**
 * Check `brand-orange` (04 §A.3, CLAUDE.md §2): brand orange never appears in an OPS or HUD route, except the logo mark
 * (which no OPS or HUD route has today; the first one that adds it states its own selector here).
 *
 * The primitives are read from tokens.css (`--signal`, `--signal-ink`), so a retuned orange is still caught. A route counts as
 * OPS or HUD by the router's mode table.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeHashesInMode } from "../lib/offline";
import { openSetupFixture, type SetupFixtureState } from "../lib/setupFixture";

const tokens = readFileSync(join(import.meta.dirname, "..", "..", "src", "ui", "styles", "tokens.css"), "utf8");

function primitive(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!m) throw new Error(`tokens.css has no --${name} hex primitive; update brand-orange.spec.ts`);
  return m[1].toUpperCase();
}

const ORANGE = [primitive("signal"), primitive("signal-ink")];

/** Every computed colour on the page that equals a brand-orange primitive, as `tag#id.property=hex`. */
async function findOrange(page: Page): Promise<string[]> {
  return page.evaluate((orange) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const hex = (css: string): string => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      if (d[3] === 0) return "";
      return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    };
    const props = [
      "color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
      "outlineColor", "textDecorationColor", "caretColor", "fill", "stroke",
    ] as const;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      for (const prop of props) {
        const value = style[prop];
        if (!value || value === "none") continue;
        const h = hex(value);
        if (h && orange.includes(h)) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${prop}=${h}`);
      }
    }
    return out;
  }, ORANGE);
}

test("brand-orange: no computed colour equals a brand-orange primitive in any OPS or HUD route", async ({ page }) => {
  const hashes = [...new Set([...routeHashesInMode(["ops", "hud"]), "#/presenter", "#/setup"])];
  expect(hashes.length).toBeGreaterThan(0);
  const hits: string[] = [];

  for (const hash of hashes) {
    await page.goto("about:blank");
    await page.goto(`${hash === "#/setup" || hash === "#/presenter" ? "/?site=mock_site" : "/"}${hash}`);
    await page.waitForLoadState("networkidle");
    if (hash === "#/presenter") await expect(page.locator('[data-screen="SCR-19"]')).toBeVisible();
    if (hash === "#/setup") {
      await expect(page.locator('[data-screen="SCR-20"]')).toBeVisible();
      await expect(page.locator('.setup-state')).toHaveText(/^(Ready|Locked)/);
      await expect(page.getByRole("heading", { name: "Mission settings", exact: true })).toBeVisible();
    }
    const found = await findOrange(page);
    for (const f of found) hits.push(`${hash}: ${f}`);
  }

  expect(hits, "brand orange in an OPS or HUD route").toEqual([]);
});

// Package 24: SCR-20 in each state, from the fixture (candidate cards, settings, the Computing note, the rejection, Locked).
test("brand-orange: none in the SCR-20 mission setup states (package 24)", async ({ page }) => {
  const hits: string[] = [];
  for (const state of ["ready", "computing", "rejected", "locked"] as SetupFixtureState[]) {
    const fixture = await openSetupFixture(page, state);
    if (state === "computing" || state === "rejected") await page.getByRole("button", { name: "Select MOCK alternative" }).click();
    if (state === "computing") await expect(page.locator(".setup-state")).toHaveText(/^Computing haven fields/);
    if (state === "rejected") await expect(page.getByRole("alert")).toBeVisible();
    for (const found of await findOrange(page)) hits.push(`${state}: ${found}`);
    fixture.answer();
  }
  expect(hits, "brand orange in SCR-20").toEqual([]);
});
