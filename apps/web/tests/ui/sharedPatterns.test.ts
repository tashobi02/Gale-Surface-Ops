/**
 * T13.05 shared patterns (FD-150, FD-208, FD-215): one geometry source for the 04 §C.1 hatch, cross-hatch and dots.
 * CSS (patterns.css via tokens.css), SVG `<pattern>` defs and canvas patterns all take their spacing from
 * `PATTERN_GEOMETRY`; the warning icon is drawn as an octagon (04 §C.1 "octagon" wins over U+2B23, a hexagon).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OCTAGON_POINTS,
  PATTERN_GEOMETRY,
  canvasPattern,
  svgPatternDefs,
  type PatternKind,
} from "../../src/ui/components/patterns";
import { StatusIcon, renderStatusIcon } from "../../src/ui/components/statusIcon";
import { installDom, removeDom } from "./domHarness";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const read = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");
const KINDS: PatternKind[] = ["hatch", "crosshatch", "dots"];

/** px value of a custom property declared in tokens.css. */
function tokenPx(name: string): number {
  const m = new RegExp(`${name}:\\s*(\\d+)px`).exec(read("tokens.css"));
  if (!m) throw new Error(`tokens.css has no ${name} in px`);
  return Number(m[1]);
}

describe("shared patterns: one spacing for CSS, SVG and canvas (FD-150)", () => {
  const TOKEN: Record<PatternKind, string> = {
    hatch: "--pattern-hatch-period",
    crosshatch: "--pattern-cross-period",
    dots: "--pattern-dot-period",
  };

  it.each(KINDS)("%s: the tokens.css period equals PATTERN_GEOMETRY", (kind) => {
    expect(tokenPx(TOKEN[kind])).toBe(PATTERN_GEOMETRY[kind].period);
  });

  it("the stripe widths in tokens.css equal PATTERN_GEOMETRY", () => {
    expect(tokenPx("--pattern-hatch-stripe")).toBe(PATTERN_GEOMETRY.hatch.stripe);
    expect(tokenPx("--pattern-cross-stripe")).toBe(PATTERN_GEOMETRY.crosshatch.stripe);
  });

  it("patterns.css draws its gradients with those tokens, not with literal spacings", () => {
    // The @media print block keeps its own coarser strokes for black-and-white printers.
    const css = read("patterns.css").replace(/\/\*[\s\S]*?\*\//g, "").split("@media print")[0]!;
    for (const token of Object.values(TOKEN)) expect(css, token).toContain(`var(${token})`);
    expect(css).toContain("var(--pattern-hatch-stripe)");
    expect(css).toContain("var(--pattern-cross-stripe)");
    expect(css).not.toMatch(/\d+px,\s*transparent \d+px/);
    expect(css).not.toMatch(/background-size:\s*\d+px/);
  });

  it("the alphas in tokens.css equal PATTERN_GEOMETRY", () => {
    const alpha = (name: string): number => Number(new RegExp(`${name}:\\s*([0-9.]+);`).exec(read("tokens.css"))![1]);
    expect(alpha("--pattern-hatch-alpha")).toBe(PATTERN_GEOMETRY.hatch.alpha);
    expect(alpha("--pattern-cross-alpha")).toBe(PATTERN_GEOMETRY.crosshatch.alpha);
    expect(alpha("--pattern-dot-alpha")).toBe(PATTERN_GEOMETRY.dots.alpha);
  });

  it.each(KINDS)("%s: the SVG <pattern> tile has the shared period", (kind) => {
    const defs = svgPatternDefs();
    const m = new RegExp(`<pattern id="pattern-${kind}"[^>]*width="(\\d+)"[^>]*height="(\\d+)"`).exec(defs);
    expect(m, `<pattern id="pattern-${kind}">`).not.toBeNull();
    expect(Number(m![1])).toBe(PATTERN_GEOMETRY[kind].period);
    expect(Number(m![2])).toBe(PATTERN_GEOMETRY[kind].period);
  });

  it.each(KINDS)("%s: the canvas tile has the shared period and becomes a repeating pattern", (kind) => {
    const calls: string[] = [];
    const tiles: { width: number; height: number }[] = [];
    const tileCtx = new Proxy({} as Record<string, unknown>, {
      get: (_t, prop: string) => (...args: unknown[]) => void calls.push(`${prop}:${args.length}`),
      set: () => true,
    });
    const createTile = (width: number, height: number) => {
      const tile = { width, height, getContext: () => tileCtx };
      tiles.push(tile);
      return tile as unknown as HTMLCanvasElement;
    };
    const target = { createPattern: (_tile: unknown, repeat: string) => ({ repeat }) as unknown as CanvasPattern };
    const pattern = canvasPattern(target as unknown as CanvasRenderingContext2D, kind, "#000000", createTile);
    expect(pattern).not.toBeNull();
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.width).toBe(PATTERN_GEOMETRY[kind].period);
    expect(tiles[0]!.height).toBe(PATTERN_GEOMETRY[kind].period);
    expect((pattern as unknown as { repeat: string }).repeat).toBe("repeat");
  });

  it("an unavailable 2D context gives no pattern instead of throwing", () => {
    const createTile = (width: number, height: number) => ({ width, height, getContext: () => null }) as unknown as HTMLCanvasElement;
    const target = { createPattern: () => null };
    expect(canvasPattern(target as unknown as CanvasRenderingContext2D, "hatch", "#000", createTile)).toBeNull();
  });

  it("the octagon clip-path of the pattern swatch is OCTAGON_POINTS", () => {
    const m = /\.pattern-swatch\.status-blocked,\s*\.pattern-swatch\.status-warning\s*\{\s*clip-path:\s*polygon\(([^)]*)\)/.exec(read("patterns.css"));
    expect(m).not.toBeNull();
    const css = m![1]!.split(",").map((p) => p.trim());
    expect(css).toEqual(OCTAGON_POINTS.map(([x, y]) => `${x}% ${y}%`));
  });
});

describe("warning icon is an octagon (FD-208)", () => {
  beforeAll(() => installDom());
  afterAll(() => removeDom());

  it("OCTAGON_POINTS has eight distinct vertices inside the 0..100 box", () => {
    expect(OCTAGON_POINTS).toHaveLength(8);
    expect(new Set(OCTAGON_POINTS.map((p) => p.join(","))).size).toBe(8);
    for (const [x, y] of OCTAGON_POINTS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it.each(["warning", "blocked"] as const)("the DOM %s glyph is an aria-hidden SVG polygon with eight points", (status) => {
    const glyph = renderStatusIcon(status).querySelector(".status-glyph")!;
    const polygon = glyph.querySelector("svg polygon");
    expect(polygon).not.toBeNull();
    expect(polygon!.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(8);
    expect(glyph.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.textContent).not.toContain("⬣");
  });

  it("the React glyph is the same octagon and the word stays", () => {
    const html = renderToStaticMarkup(StatusIcon({ status: "warning" }));
    expect(html).toMatch(/<polygon[^>]*points="[^"]+"/);
    expect(html).not.toContain("⬣");
    expect(html).toContain("WARNING");
  });

  it("the other statuses keep a text shape, so only warning and blocked use the SVG", () => {
    for (const status of ["ok", "caution", "unknown", "advisory"] as const) {
      expect(renderStatusIcon(status).querySelector(".status-glyph svg"), status).toBeNull();
    }
  });
});

describe("every status icon has a default size from tokens (FD-215)", () => {
  it("tokens.css defines the default icon size and the EVA size", () => {
    expect(tokenPx("--status-icon-size")).toBe(18);
    expect(tokenPx("--status-icon-size-eva")).toBe(22);
  });

  it("patterns.css sizes every glyph and its SVG from those tokens", () => {
    const css = read("patterns.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.status-indicator \.status-glyph\s*\{[^}]*width:\s*var\(--status-icon-size\)/);
    expect(css).toMatch(/\.status-indicator \.status-glyph\s*\{[^}]*height:\s*var\(--status-icon-size\)/);
    expect(css).toMatch(/\.status-glyph svg\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\[data-screen="SCR-13"\] \.status-indicator \.status-glyph[^{]*\{[^}]*var\(--status-icon-size-eva\)/);
  });
});
