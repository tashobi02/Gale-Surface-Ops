/// <reference types="node" />
/**
 * axe scan in real Chromium, so axe evaluates colour contrast (FD-151; resolves the jsdom `TODO(verify)` of TASK-13).
 *
 * `axeScan` fails on any `serious` or `critical` violation and always writes the full result to `out/axe-<route>.json`.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OUT_DIR = join(import.meta.dirname, "..", "out");

export type HtmlMode = "brief" | "ops" | "hud" | "print";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"] as const;
const BLOCKING = new Set(["serious", "critical"]);

export interface AxeOptions {
  /** `<html data-mode>` the page must be in; guards against scanning a route in the wrong mode. */
  mode: HtmlMode;
  /** Name for `out/axe-<route>.json`; letters, digits, `-` and `_` only after sanitising. */
  route: string;
  /**
   * CSS selector of the one region to scan. A scan of the whole planner walks the SCR-05 profile chart (about 17,000 nodes, 16 to
   * 22 s); a state that only changes one panel scans that panel (about 1 s). Omit it to scan the page.
   */
  include?: string;
}

export interface AxeSummary {
  violations: number;
  blocking: number;
}

export async function axeScan(page: Page, options: AxeOptions): Promise<AxeSummary> {
  const mode = await page.evaluate(() => document.documentElement.dataset.mode ?? null);
  if (mode !== options.mode) throw new Error(`axeScan(${options.route}): page is in mode ${String(mode)}, expected ${options.mode}`);

  const builder = new AxeBuilder({ page }).withTags([...AXE_TAGS]);
  if (options.include) builder.include(options.include);
  const result = await builder.analyze();
  mkdirSync(OUT_DIR, { recursive: true });
  const name = options.route.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "root";
  writeFileSync(join(OUT_DIR, `axe-${name}.json`), `${JSON.stringify(result, null, 2)}\n`);

  const blocking = result.violations.filter((v) => v.impact && BLOCKING.has(v.impact));
  if (blocking.length > 0) {
    const lines = blocking.map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s), first: ${v.nodes[0]?.target.join(" ")})`);
    throw new Error(`axe: ${blocking.length} serious/critical violation(s) on ${options.route}:\n${lines.join("\n")}`);
  }
  return { violations: result.violations.length, blocking: blocking.length };
}
