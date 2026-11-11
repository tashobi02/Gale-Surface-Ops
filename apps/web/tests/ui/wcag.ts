/** WCAG 2.x relative luminance and contrast ratio, shared by the stylesheet tests (04 §C.1, NFR-04). */
export type Rgb = [number, number, number];

export const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

export function luminance([r8, g8, b8]: Rgb): number {
  const [r, g, b] = [r8, g8, b8].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours. */
export function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast ratio between two `#RRGGBB` strings. */
export const contrast = (a: string, b: string): number => ratio(toRgb(a), toRgb(b));
