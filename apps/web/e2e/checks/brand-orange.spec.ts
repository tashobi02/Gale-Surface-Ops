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
import { openOpsFixture } from "../lib/opsFixture";
import { routeHashesInMode } from "../lib/offline";
import { e2eSite } from "../lib/siteBundle";

const tokens = readFileSync(join(import.meta.dirname, "..", "..", "src", "ui", "styles", "tokens.css"), "utf8");

function primitive(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!m) throw new Error(`tokens.css has no --${name} hex primitive; update brand-orange.spec.ts`);
  return m[1].toUpperCase();
}

const ORANGE = [primitive("signal"), primitive("signal-ink")];

async function orangeHits(page: Page): Promise<string[]> {
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
  // One page visits every OPS and HUD route in the router table in turn (about 4 s each): the list grows with each package,
  // so the budget is per route, not the 60 s default.
  const hashes = routeHashesInMode(["ops", "hud"]);
  test.setTimeout(Math.max(60_000, hashes.length * 12_000));
  expect(hashes.length).toBeGreaterThan(0);
  const hits: string[] = [];

  for (const hash of hashes) {
    await page.goto("about:blank");
    await page.goto(`/?site=${e2eSite()}${hash}`);
    // A route that never goes idle must name itself in the failure, not eat the whole test budget.
    const recent: string[] = [];
    const record = (r: { method(): string; url(): string }): void => { recent.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); };
    page.on("request", record);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch((error: Error) => { throw new Error(`${hash}: no network idle in 15 s; last requests: ${recent.slice(-8).join(" | ")} (${error.message.split("\n")[0]})`); });
    page.off("request", record);
    const found = await orangeHits(page);
    for (const f of found) hits.push(`${hash}: ${f}`);
  }

  expect(hits, "brand orange in an OPS or HUD route").toEqual([]);
});


test("brand-orange: ops loaded, paused and alerting states use no brand orange (package 19)", async ({ context }) => {
  for (const state of ["loaded", "paused", "alerting"] as const) {
    const page = await context.newPage();
    try {
      await openOpsFixture(page, state);
      expect(await orangeHits(page), state).toEqual([]);
    } finally { await page.close(); }
  }
});
