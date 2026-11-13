/**
 * Number formats, the one `format.ts` of 04 §D.4 (FD-124): the precision of the only examples the specs give.
 *
 * | Unit | Format |
 * | --- | --- |
 * | km | 2 decimals |
 * | min | integer |
 * | ° | 1 decimal |
 * | mSv | 2 decimals |
 * | mGy | 1 decimal |
 * | m | integer |
 * | % | integer |
 *
 * Units attach with a thin space (04 §D.4: `12 min`, `0.42 km`, `3.1 mGy`). A value that is not a finite number is the
 * dash "—" (04 §D.1): this file never turns a missing value into a number. It only formats; the one conversion here,
 * metres to kilometres, is display unit conversion.
 */

/** Rendered for any value we do not have (04 §D.1). */
export const DASH = "—";

/** Between a number and its unit (04 §D.4). */
export const THIN_SPACE = " ";

export type FormatUnit = "km" | "min" | "°" | "mSv" | "mGy" | "m" | "%";

/** Decimals shown per unit. */
export const UNIT_DECIMALS: Readonly<Record<FormatUnit, number>> = {
  km: 2,
  min: 0,
  "°": 1,
  mSv: 2,
  mGy: 1,
  m: 0,
  "%": 0,
};

/** True when `unit` is one the table above formats. */
export function isFormatUnit(unit: unknown): unit is FormatUnit {
  return typeof unit === "string" && Object.prototype.hasOwnProperty.call(UNIT_DECIMALS, unit);
}

/** The number at the unit's precision, or the dash when `value` is not a finite number. No unit, no grouping. */
export function formatNumber(value: unknown, unit: FormatUnit): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  const text = value.toFixed(UNIT_DECIMALS[unit]);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text; // never "-0.00"
}

/** The number with its unit attached by a thin space, or the dash alone when there is no value. */
export function formatWithUnit(value: unknown, unit: FormatUnit): string {
  const text = formatNumber(value, unit);
  return text === DASH ? DASH : `${text}${THIN_SPACE}${unit}`;
}

/** Metres as kilometres for display, or null when `metres` is not a finite number. */
export function metresToKilometres(metres: unknown): number | null {
  return typeof metres === "number" && Number.isFinite(metres) ? metres / 1000 : null;
}
