/**
 * T13.05 / T13.09: HUD status pill contrast (04 §C.1 "HUD status pills", §F) and the design-system values that
 * 04 now defines (decided 2026-11-11, spec-change #213): narrow results panel, selection width, print neutrals,
 * headings in the v1 exception, minimum text size, Lucide defaults.
 *
 * The contrast checks read patterns.css and tokens.css (jsdom cannot resolve var() or composite gradients) and
 * composite each pill's stripe or dot colour over the HUD fill with the WCAG formula, so the darkest patterned
 * area is measured, not just the flat fill.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrast, ratio, toRgb, type Rgb } from "./wcag";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const read = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Value of a custom property declared in tokens.css (first declaration wins). */
function token(name: string): string {
  const m = new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*(#[0-9A-Fa-f]{6})\\b`).exec(read("tokens.css"));
  if (!m) throw new Error(`tokens.css has no ${name} hex value`);
  return m[1];
}

/** Body of the HUD-scoped `[data-mode="hud"] .status-<name>` rule in patterns.css (comments removed). */
function hudRuleBody(status: string): string {
  const css = stripComments(read("patterns.css"));
  const re = new RegExp(`(?:^|\\n)((?:[^{}]*\\[data-mode="hud"\\]\\s*\\.status-[a-z]+,\\s*)*[^{}]*\\[data-mode="hud"\\]\\s*\\.status-${status}\\b[^{}]*)\\{([^}]*)\\}`);
  const rule = re.exec(css);
  expect(rule, `[data-mode="hud"] .status-${status} rule in patterns.css`).not.toBeNull();
  return rule![2];
}

interface Layer {
  rgb: Rgb;
  alpha: number;
}

/** The stripe or dot colour of each gradient layer in a rule body (the first `rgba(r, g, b, a)` of each gradient). */
function patternLayers(body: string): Layer[] {
  const layers: Layer[] = [];
  for (const piece of body.split(/-gradient\(/).slice(1)) {
    const m = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/.exec(piece);
    if (m) layers.push({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) });
  }
  return layers;
}

/**
 * Worst case under the pill's pattern: the pattern colour composited over the fill 0..n times (n gradient layers
 * that cross, as in the cross-hatch; 0 = the stripe-free area). Dark stripes darken the fill under the ink; lighter
 * stripes leave the stripe-free fill as the darkest area. The lowest ink contrast over all coverages is returned.
 */
function patternedContrast(status: string, fill: string): number {
  const body = hudRuleBody(status);
  const ink = toRgb(token("--hud-pill-ink"));
  const layers = patternLayers(body);
  const gradients = (body.match(/-gradient\(/g) ?? []).length;
  expect(layers.length, `${status}: one rgba colour per gradient`).toBe(gradients);
  let worst = ratio(ink, toRgb(fill));
  let colour = toRgb(fill);
  for (const { rgb, alpha } of layers) {
    colour = colour.map((v, i) => v * (1 - alpha) + rgb[i] * alpha) as Rgb;
    worst = Math.min(worst, ratio(ink, colour));
  }
  return worst;
}

/** HUD status pills: pattern class, fill token (HUD mode in tokens.css), 04 §C.1 flat contrast with #000000 ink. */
const HUD_PILLS = [
  ["nominal", "--hud-nominal", 11.77],
  ["caution", "--hud-caution", 11.48],
  ["warning", "--hud-warning", 7.57],
  ["advisory", "--hud-advisory", 10.92],
  ["unknown", "--hud-text-2", 9.88],
] as const;

describe("patterns: HUD pill ink is #000000 (04 §C.1 HUD status pills)", () => {
  it("--hud-pill-ink is #000000", () => {
    expect(token("--hud-pill-ink").toUpperCase()).toBe("#000000");
  });

  it("the status fills are unchanged (a fill change would need 04 first)", () => {
    expect(token("--hud-nominal").toUpperCase()).toBe("#3DDC84");
    expect(token("--hud-caution").toUpperCase()).toBe("#FFB020");
    expect(token("--hud-warning").toUpperCase()).toBe("#FF6B6B");
    expect(token("--hud-advisory").toUpperCase()).toBe("#4CC9F0");
    expect(token("--hud-text-2").toUpperCase()).toBe("#A9B3BE");
  });

  for (const [status] of HUD_PILLS) {
    it(`every .status-${status} pill sets its HUD ink from --hud-pill-ink`, () => {
      expect(hudRuleBody(status)).toMatch(/color:\s*var\(--hud-pill-ink\)/);
    });
  }

  it("OPS and BRIEF pills keep --ink (the ink change is scoped to the HUD)", () => {
    expect(stripComments(read("patterns.css"))).toMatch(/\.status-caution\s*\{[^}]*color:\s*var\(--ink,/);
  });
});

describe("patterns: HUD pill ink/fill contrast", () => {
  for (const [status, fill, flat] of HUD_PILLS) {
    it(`flat ${status} pill: #000000 ink on ${fill} matches 04 §C.1 (${flat} : 1) and reaches 7 : 1`, () => {
      const value = contrast(token("--hud-pill-ink"), token(fill));
      expect(value).toBeGreaterThanOrEqual(7);
      expect(value).toBeCloseTo(flat, 1);
    });

    it(`patterned ${status} pill keeps 7 : 1 at its darkest patterned area (04 §C.1, §F)`, () => {
      expect(patternedContrast(status, token(fill))).toBeGreaterThanOrEqual(7);
    });

    it(`patterned ${status} pill keeps 4.5 : 1 (NFR-04 text floor)`, () => {
      expect(patternedContrast(status, token(fill))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the patterns are still drawn: every patterned HUD pill keeps a stripe or dot alpha of at least 0.1", () => {
    for (const [status] of HUD_PILLS) {
      if (status === "nominal") continue;
      const layers = patternLayers(hudRuleBody(status));
      expect(layers.length, `${status} layers`).toBeGreaterThan(0);
      for (const { alpha } of layers) expect(alpha, status).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("the HUD pill block in patterns.css cites 04 §C.1, records the measured ratios and names no open decision", () => {
    const css = read("patterns.css");
    expect(css).toMatch(/04 §C\.1[^*]*HUD status pills/s);
    for (const measured of ["11.77", "11.48", "7.57", "10.92", "9.88"]) expect(css).toContain(measured);
    expect(css).not.toMatch(/TODO\(decision\)[^*]*HUD/is);
  });
});

/** Text of the comment (and declarations between) directly before `needle`, back to the previous declaration. */
function leadIn(css: string, needle: string): string {
  const i = css.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  return css.slice(css.lastIndexOf(";\n", i - 1) + 1, i);
}

describe("tokens: values 04 now defines are cited, not flagged (spec-change #213, decided 2026-11-11)", () => {
  const css = read("tokens.css");

  it("--results-height-narrow is 180px and cites 04 §F without a TODO", () => {
    expect(css).toMatch(/--results-height-narrow:\s*180px;/);
    const lead = leadIn(css, "--results-height-narrow:");
    expect(lead).toMatch(/04 §F/);
    expect(lead).not.toMatch(/TODO/);
  });

  it("--selection-width is 2px, cites 04 §C.5 and no longer mentions a 3 px focus ring", () => {
    expect(css).toMatch(/--selection-width:\s*2px;/);
    const lead = leadIn(css, "--selection-width:");
    expect(lead).toMatch(/04 §C\.5/);
    expect(lead).not.toMatch(/TODO|3 px/);
  });

  it("both print blocks in tokens.css (the print mode and the @media print remap) cite 04 §C.1 for the neutrals, with no TODO", () => {
    const blocks = [...css.matchAll(/--surface-2:\s*#F3F4F6/g)];
    expect(blocks.length).toBe(2);
    for (const m of blocks) {
      const lead = css.slice(css.lastIndexOf(";\n", m.index! - 1) + 1, m.index);
      expect(lead).toMatch(/04 §C\.1/);
      expect(lead).not.toMatch(/TODO/);
    }
    expect([...css.matchAll(/--line:\s*#D1D5DB/g)].length).toBe(2);
    expect([...css.matchAll(/--fg-3:\s*#4B5563/g)].length).toBe(2);
    expect(css).not.toMatch(/TODO\(decision\)[^\n*]*print hex values/);
  });

  it("the print neutrals reach the 04 §C.1 ratios: #4B5563 7.56 : 1 on white, #111827 16.12 : 1 on #F3F4F6", () => {
    expect(contrast("#4B5563", "#FFFFFF")).toBeCloseTo(7.56, 1);
    expect(contrast("#4B5563", "#F3F4F6")).toBeCloseTo(6.87, 1);
    expect(contrast("#111827", "#F3F4F6")).toBeCloseTo(16.12, 1);
    expect(contrast("#D1D5DB", "#FFFFFF")).toBeCloseTo(1.47, 1);
  });
});
