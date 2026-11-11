/**
 * Colours for OpenLayers styles, read from the design tokens (04 §C.1; tokens.css "JS/Canvas consumers: read colours
 * with getComputedStyle"). A canvas cannot resolve `var(--x)` and layer code must not copy hex values, so a style reads
 * the token's computed value from the document when it draws. tokens.css stays the single place the hex values are
 * written. A missing value (tokens.css not loaded, or no document) throws: a silent default colour would hide a build
 * error on a safety display.
 */

/** Primitive tokens the map layers draw with. */
export type MapToken =
  | "void"
  | "panel"
  | "raised"
  | "edge"
  | "hairline"
  | "text-1"
  | "text-2"
  | "text-3"
  | "route"
  | "nominal"
  | "caution"
  | "warning"
  | "advisory"
  | "unknown"
  | "traverse";

/** The colour of a design token as a CSS colour string usable on a canvas. */
export function tokenColor(name: MapToken): string {
  if (typeof document === "undefined") throw new Error(`design token --${name} needs a document (tokens.css loaded)`);
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!value) throw new Error(`design token --${name} is not defined: is tokens.css loaded?`);
  return value;
}

/** `#RRGGBB` with an opacity (04 §C.1 gives overlay opacities, e.g. the comm shadow's 35 %). */
export function withAlpha(hex: string, opacity: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`withAlpha expects #RRGGBB, got "${hex}"`);
  if (!(opacity >= 0 && opacity <= 1)) throw new Error(`withAlpha opacity must be within 0..1, got ${opacity}`);
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
