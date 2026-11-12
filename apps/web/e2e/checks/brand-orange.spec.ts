/// <reference types="node" />
/**
 * Check `brand-orange` (04 §A.3, CLAUDE.md §2): brand orange never appears in an OPS or HUD route, except the logo mark
 * (which no OPS or HUD route has today; the first one that adds it states its own selector here).
 *
 * The primitives are read from tokens.css (`--signal`, `--signal-ink`), so a retuned orange is still caught. A route counts as
 * OPS or HUD by the router's mode table.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeHashesInMode } from "../lib/offline";

const tokens = readFileSync(join(import.meta.dirname, "..", "..", "src", "ui", "styles", "tokens.css"), "utf8");

function primitive(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!m) throw new Error(`tokens.css has no --${name} hex primitive; update brand-orange.spec.ts`);
  return m[1].toUpperCase();
}

const ORANGE = [primitive("signal"), primitive("signal-ink")];

test("brand-orange: no computed colour equals a brand-orange primitive in any OPS or HUD route", async ({ page }) => {
  const hashes = [...new Set([...routeHashesInMode(["ops", "hud"]), "#/presenter"])];
  expect(hashes.length).toBeGreaterThan(0);
  const hits: string[] = [];

  for (const hash of hashes) {
    await page.goto("about:blank");
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    if (hash === "#/presenter") await expect(page.locator('[data-screen="SCR-19"]')).toBeVisible();
    const found = await page.evaluate((orange) => {
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
    for (const f of found) hits.push(`${hash}: ${f}`);
  }

  expect(hits, "brand orange in an OPS or HUD route").toEqual([]);
});
