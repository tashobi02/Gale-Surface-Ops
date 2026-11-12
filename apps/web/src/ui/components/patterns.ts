/**
 * Status pattern geometry for SVG and canvas (04 §C.1 hatch, cross-hatch, dotted; FD-150), and the warning octagon (FD-208).
 *
 * One source: `PATTERN_GEOMETRY` mirrors the `--pattern-*` tokens in `styles/tokens.css`, which patterns.css uses for the CSS
 * gradients; `tests/ui/sharedPatterns.test.ts` fails when the two differ. Map layers (T07.07 slope tiles, T09.01 hazard hatch)
 * and the elevation profile (T09.02) take their patterns from here, so CSS, SVG and canvas show the same spacing.
 * Display only: nothing here computes a quantity.
 */

export type PatternKind = "hatch" | "crosshatch" | "dots";

export interface PatternGeometry {
  /** Tile edge in px: the repeat distance of the pattern. */
  readonly period: number;
  /** Stripe width in px (hatch and cross-hatch). */
  readonly stripe?: number;
  /** Dot radius as a percentage of the tile's half edge (dots), as the radial-gradient stop in CSS. */
  readonly dotRadiusPct?: number;
  /** Opacity of the pattern colour on the fill. */
  readonly alpha: number;
  /** Stripes in both diagonal directions (cross-hatch). */
  readonly crossed?: boolean;
}

/** Values of the `--pattern-*` tokens in tokens.css. */
export const PATTERN_GEOMETRY: Readonly<Record<PatternKind, PatternGeometry>> = {
  hatch: { period: 8, stripe: 4, alpha: 0.22 },
  crosshatch: { period: 6, stripe: 3, alpha: 0.28, crossed: true },
  dots: { period: 8, dotRadiusPct: 22, alpha: 0.35 },
};

/** The pattern each status class draws (04 §C.1): caution hatch, warning cross-hatch, unknown and advisory dotted. */
export const STATUS_PATTERN: Readonly<Record<"caution" | "warning" | "unknown" | "advisory", PatternKind>> = {
  caution: "hatch",
  warning: "crosshatch",
  unknown: "dots",
  advisory: "dots",
};

/**
 * Octagon vertices in a 0..100 box, clockwise from the top edge. The same polygon is the `.pattern-swatch` clip-path in
 * patterns.css. 04 §C.1 says "octagon"; U+2B23 is a hexagon, so the warning icon is drawn (FD-208).
 */
export const OCTAGON_POINTS: readonly (readonly [number, number])[] = [
  [30, 0],
  [70, 0],
  [100, 30],
  [100, 70],
  [70, 100],
  [30, 100],
  [0, 70],
  [0, 30],
];

/** `points` attribute for an SVG polygon, scaled from the 0..100 box to `size` (default: the 100 viewBox). */
export function octagonPointsAttr(size = 100): string {
  const k = size / 100;
  return OCTAGON_POINTS.map(([x, y]) => `${x * k},${y * k}`).join(" ");
}

/**
 * `<defs>` markup with one `<pattern>` per kind (ids `pattern-hatch`, `pattern-crosshatch`, `pattern-dots`), filled with
 * `colour` at the kind's alpha. Insert it once into an `<svg>`; reference with `fill="url(#pattern-hatch)"`.
 * The tile edge is the period. Stripes are horizontal (and vertical, for the cross-hatch) bars in the tile and the pattern is
 * rotated 45 degrees, so the distance between stripes along their normal is exactly the period, as in the CSS gradients.
 */
export function svgPatternDefs(colour = "currentColor"): string {
  const parts: string[] = [];
  for (const kind of ["hatch", "crosshatch", "dots"] as const) {
    const g = PATTERN_GEOMETRY[kind];
    const size = `width="${g.period}" height="${g.period}"`;
    if (kind === "dots") {
      const r = ((g.dotRadiusPct ?? 0) / 100) * (g.period / 2);
      parts.push(
        `<pattern id="pattern-${kind}" patternUnits="userSpaceOnUse" ${size}><circle cx="${g.period / 2}" cy="${g.period / 2}" r="${r}" fill="${colour}" fill-opacity="${g.alpha}"/></pattern>`,
      );
      continue;
    }
    const stripe = g.stripe ?? 1;
    const bars = [`<rect x="0" y="0" width="${g.period}" height="${stripe}"/>`];
    if (g.crossed) bars.push(`<rect x="0" y="0" width="${stripe}" height="${g.period}"/>`);
    parts.push(
      `<pattern id="pattern-${kind}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)" ${size}><g fill="${colour}" fill-opacity="${g.alpha}">${bars.join("")}</g></pattern>`,
    );
  }
  return `<defs>${parts.join("")}</defs>`;
}

/** Creates a drawing surface of a given size; the default makes an HTMLCanvasElement. Tests pass their own. */
export type CreateTile = (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;

const defaultCreateTile: CreateTile = (width, height) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * A repeating canvas pattern for `kind` in `colour` at the kind's alpha, or null when no 2D context is available (the
 * caller then draws a flat fill). The tile is `PATTERN_GEOMETRY[kind].period` px square.
 */
export function canvasPattern(
  target: CanvasRenderingContext2D,
  kind: PatternKind,
  colour: string,
  createTile: CreateTile = defaultCreateTile,
): CanvasPattern | null {
  const g = PATTERN_GEOMETRY[kind];
  const tile = createTile(g.period, g.period);
  const ctx = tile.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.globalAlpha = g.alpha;
  ctx.fillStyle = colour;
  if (kind === "dots") {
    const r = ((g.dotRadiusPct ?? 0) / 100) * (g.period / 2);
    ctx.beginPath();
    ctx.arc(g.period / 2, g.period / 2, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const stripe = g.stripe ?? 1;
    ctx.fillRect(0, 0, g.period, stripe);
    if (g.crossed) ctx.fillRect(0, 0, stripe, g.period);
  }
  const pattern = target.createPattern(tile as CanvasImageSource, "repeat");
  // Stripes are rotated 45 degrees, as in the SVG defs; the dots are not.
  if (pattern && kind !== "dots" && typeof DOMMatrix !== "undefined" && typeof pattern.setTransform === "function") {
    pattern.setTransform(new DOMMatrix().rotate(45));
  }
  return pattern;
}
