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
  const m = new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(read("tokens.css"));
  if (!m) throw new Error(`tokens.css has no ${name} hex value`);
  return m[1];
}

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

function luminance([r8, g8, b8]: Rgb): number {
  const [r, g, b] = [r8, g8, b8].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two colours. */
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const contrast = (a: string, b: string): number => ratio(toRgb(a), toRgb(b));

/**
 * Worst case under the pill's pattern: the black `rgba(0,0,0,a)` stripes or dots of the `.status-<name>` rule in
 * patterns.css composited over the fill. Layers that cross (the cross-hatch has two) darken by 1 - (1 - a)^layers.
 */
function patternedContrast(status: string, fill: string): number {
  const rule = new RegExp(`(?:^|\\n)(?:\\.status-[a-z]+,\\s*)*\\.status-${status}(?:,\\s*\\.status-[a-z]+)*\\s*\\{([^}]*)\\}`).exec(
    read("patterns.css"),
  );
  expect(rule, `.status-${status} rule`).not.toBeNull();
  const body = rule![1];
  const alpha = /rgba\(0,\s*0,\s*0,\s*([0-9.]+)\)/.exec(body);
  const layers = (body.match(/-gradient\(/g) ?? []).length;
  if (!alpha || layers === 0) return contrast(token("--ink"), fill);
  const darken = 1 - (1 - Number(alpha[1])) ** layers;
  const base = toRgb(fill);
  const composited = base.map((v) => v * (1 - darken)) as Rgb;
  return ratio(toRgb(token("--ink")), composited);
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

  // The pills also draw black stripes or dots (patterns.css), which darken the fill under the ink. Measured at the
  // worst case (full stripe coverage), every patterned HUD pill falls below the 7 : 1 floor, and the cross-hatched
  // warning pill below 4.5 : 1. The solid nominal pill is unaffected. Each is a known failure that needs the same
  // 04 spec change (HUD pill ink #000000 or lighter fills, or a lighter pattern alpha); `it.fails` keeps them visible.
  it("patterns: the solid nominal HUD pill is unaffected by a pattern and keeps 7 : 1", () => {
    expect(patternedContrast("nominal", token("--hud-nominal"))).toBeGreaterThanOrEqual(7);
  });

  for (const [status, fill] of [
    ["caution", "--hud-caution"],
    ["warning", "--hud-warning"],
    ["advisory", "--hud-advisory"],
    ["unknown", "--hud-text-2"],
  ] as const) {
    it.fails(`patterns: patterned HUD ${status} pill, pattern composited over ${fill}, reaches 7 : 1 (TODO(decision): 04 spec change)`, () => {
      expect(patternedContrast(status, token(fill))).toBeGreaterThanOrEqual(7);
    });
  }

  it.fails("patterns: patterned HUD warning pill reaches 4.5 : 1 (NFR-04 text floor; TODO(decision): 04 spec change)", () => {
    expect(patternedContrast("warning", token("--hud-warning"))).toBeGreaterThanOrEqual(4.5);
  });

  it("patterns: the HUD warning gap is still at least 4.5 : 1 (NFR-04 text floor) and the stylesheet names the decision", () => {
    expect(contrast(token("--ink"), token("--hud-warning"))).toBeGreaterThanOrEqual(4.5);
    expect(read("patterns.css")).toMatch(/TODO\(decision\)[^*]*HUD[^*]*(warning|7 ?: ?1)/is);
  });
});

describe("tokens: values 04 does not define are flagged for a spec change, not edited", () => {
  it("--results-height-narrow and --selection-width carry a TODO(decision) naming 04", () => {
    const css = read("tokens.css");
    const narrow = css.split("\n").find((l) => l.includes("--results-height-narrow:"));
    const selection = css.split("\n").find((l) => l.includes("--selection-width:"));
    expect(narrow).toBeDefined();
    expect(selection).toBeDefined();
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
