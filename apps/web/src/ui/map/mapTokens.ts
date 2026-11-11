/**
 * Design tokens for canvas drawing (04 §C.1; tokens.css header: "JS/Canvas consumers: read colours with
 * getComputedStyle(), never hard-code hex"). OpenLayers styles need concrete colours, so the map layers read the
 * tokens here at run time and fail loudly, naming the token, when one is not defined: no hex fallback.
 * Shared by the map layer modules, which never import each other (T07 conflict notes).
 */

/** Reads a CSS custom property from the document root; empty string when it is not defined. */
export type TokenReader = (name: string) => string;

export const readCssToken: TokenReader = (name) => getComputedStyle(document.documentElement).getPropertyValue(name);

/** The trimmed value of a token; throws naming the token when it is empty. */
export function requireToken(read: TokenReader, name: string): string {
  const value = read(name).trim();
  if (value === "") throw new Error(`design token ${name} is not defined`);
  return value;
}

/** `#RRGGBB` or `#RGB` to channels; throws for anything else. */
export function parseHexColour(text: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!hex) throw new Error(`not a hex colour: ${JSON.stringify(text)}`);
  const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** A colour token as an `rgba()` string at the given opacity (0–1). */
export function colourToken(read: TokenReader, name: string, opacity = 1): string {
  const [r, g, b] = parseHexColour(requireToken(read, name));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** A token holding a CSS length in px (`12px`), as a number; throws when it is not one. */
export function pxToken(read: TokenReader, name: string): number {
  const value = requireToken(read, name);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) throw new Error(`design token ${name} is not a px length: ${value}`);
  return Number(match[1]);
}
