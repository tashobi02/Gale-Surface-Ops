/**
 * T13.05 / T13.09 design-system review items that need a 04 spec change first ("change 04 first").
 * The tokens are not edited here: each gap is recorded as a TODO(decision) in the stylesheet and the contrast
 * gap is asserted as a known failure, so it cannot be hidden and cannot be forgotten.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const read = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");

/** Value of a custom property declared in tokens.css (first declaration wins). */
function token(name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(read("tokens.css"));
  if (!m) throw new Error(`tokens.css has no ${name} hex value`);
  return m[1];
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** HUD status pills: `.status-*` text colour is --ink on the HUD status fill (patterns.css, HUD mode in tokens.css). */
const HUD_PILLS = [
  ["nominal", "--hud-nominal"],
  ["caution", "--hud-caution"],
  ["advisory", "--hud-advisory"],
  ["unknown", "--hud-text-2"],
] as const;

describe("patterns: HUD pill ink/fill contrast is documented", () => {
  it("patterns: HUD pill ink/fill contrast is documented (pairs that pass reach >= 7 : 1, 04 §F)", () => {
    const ink = token("--ink");
    for (const [status, fill] of HUD_PILLS) {
      expect(contrast(ink, token(fill)), `${status}: ink on ${fill}`).toBeGreaterThanOrEqual(7);
    }
  });

  // Known failure, kept visible: ink #1A1A1A on --hud-warning #FF6B6B is 6.27 : 1, under the 7 : 1 HUD floor.
  // Needs a 04 spec change first (04 §C.1 HUD table + §F): either a HUD pill ink of #000000 (7.57 : 1) or a lighter
  // hud-warning fill. `it.fails` turns green again, and flags the stale TODO, as soon as the pair reaches 7 : 1.
  it.fails("patterns: HUD warning pill ink/fill reaches 7 : 1 (TODO(decision): 04 spec change, HUD pill ink or hud-warning)", () => {
    expect(contrast(token("--ink"), token("--hud-warning"))).toBeGreaterThanOrEqual(7);
  });

  it("patterns: the HUD warning gap is still at least 4.5 : 1 (NFR-04 text floor) and the stylesheet names the decision", () => {
    expect(contrast(token("--ink"), token("--hud-warning"))).toBeGreaterThanOrEqual(4.5);
    expect(read("patterns.css")).toMatch(/TODO\(decision\)[^*]*HUD[^*]*(warning|7 ?: ?1)/is);
  });
});

describe("tokens: values 04 does not define are flagged for a spec change, not edited", () => {
  it("--results-height-narrow and --selection-width carry a TODO(decision) naming 04", () => {
    const css = read("tokens.css");
    const narrow = css.split("\n").find((l) => l.includes("--results-height-narrow:"))!;
    const selection = css.split("\n").find((l) => l.includes("--selection-width:"))!;
    expect(narrow).toContain("180px");
    expect(selection).toContain("2px");
    const around = (needle: string): string => {
      const i = css.indexOf(needle);
      return css.slice(Math.max(0, i - 400), i + 300);
    };
    expect(around("--results-height-narrow:")).toMatch(/TODO\(decision\)[\s\S]*04 §F/);
    expect(around("--selection-width:")).toMatch(/TODO\(decision\)[\s\S]*04 §C\.5[\s\S]*3 px/);
  });
});
