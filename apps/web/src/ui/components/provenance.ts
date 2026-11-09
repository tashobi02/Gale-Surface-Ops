/**
 * Shared helpers for provenance-labelled values (FR-15, NFR-05; docs/specs/04 §A.3 #8) and the
 * "—" no-data rule (04 §D.1, AGENTS rule 2): a value we do not have renders "—", never another number.
 */
import type { Provenance } from "@marswalk/protocol";

/** Rendered for any value the Hab Core has not supplied. */
export const UNAVAILABLE = "—";

/** Provenance glyphs (04 §C.1). */
export const PROVENANCE_GLYPHS: Record<Provenance, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

/**
 * What every displayed value carries. `prov` is the field's provenance class when it is known (05); `null`
 * only for a field whose class is not known while its value is missing. `unavailable` marks a missing value.
 *
 * Availability is separate from provenance (01 defines `assumed` as "a parameter we chose", so a missing value is
 * never labelled `assumed`): a missing value renders "—" with `data-unavailable="true"`, an
 * `unavailable:<field path>` source, and the field's own class on `data-provenance` when that class is known.
 */
export interface Sourced {
  readonly prov: Provenance | null;
  readonly src: string;
  readonly unavailable?: boolean;
}

type ProvAttrs = {
  "data-provenance"?: Provenance;
  "data-unavailable"?: "true";
  "data-source": string;
  title: string;
};

/**
 * DOM attributes for a displayed value: provenance class (when known) and source id on the value element
 * itself, the source id as the tooltip, and `data-unavailable="true"` for a missing value.
 * Spread onto the element that shows the value.
 */
export function provAttrs(p: Sourced): ProvAttrs {
  return {
    ...(p.prov ? { "data-provenance": p.prov } : {}),
    ...(p.unavailable ? { "data-unavailable": "true" as const } : {}),
    "data-source": p.src,
    title: p.src,
  };
}

/** A missing value of a field: its known class (or null) and an `unavailable:<path>` source. */
export function unavailableOf(prov: Provenance | null, path: string): Sourced & { unavailable: true } {
  return { prov, src: `unavailable:${path}`, unavailable: true };
}

/**
 * The provenance glyph that goes next to a value: the glyph of its own class, and none beside "—" or when the
 * class is not known (never a glyph that disagrees with `data-provenance`).
 */
export function glyphOf(p: Pick<Sourced, "prov" | "unavailable">): string {
  return p.unavailable || !p.prov ? "" : PROVENANCE_GLYPHS[p.prov];
}

/**
 * Whether a supplied value can be shown: not null or undefined, not an empty or blank string (or the "—" placeholder
 * itself), and not a non-finite number. Anything else is treated as unavailable (04 §D.1).
 */
export function isUsableValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0 && v.trim() !== UNAVAILABLE;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Rounded integer, or "—" when the value is missing or not a finite number. */
export function fmtInt(v: unknown): string {
  return isFiniteNumber(v) ? String(Math.round(v)) : UNAVAILABLE;
}

/** Fixed-decimal number, or "—". */
export function fmtFixed(v: unknown, digits: number): string {
  return isFiniteNumber(v) ? v.toFixed(digits) : UNAVAILABLE;
}

/** "H:MM" from minutes, or "—". */
export function fmtHourMinute(minutes: unknown): string {
  if (!isFiniteNumber(minutes) || minutes < 0) return UNAVAILABLE;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "H:MM:SS" or "M:SS" from seconds, or "—". */
export function fmtDuration(totalSeconds: unknown): string {
  if (!isFiniteNumber(totalSeconds) || totalSeconds < 0) return UNAVAILABLE;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Three-digit bearing with degree sign, or "—". */
export function fmtBearing(deg: unknown): string {
  return isFiniteNumber(deg) ? `${String(Math.round(deg)).padStart(3, "0")}°` : UNAVAILABLE;
}

/** Kilometres with two decimals from metres, or "—". */
export function fmtKilometres(metres: unknown): string {
  return isFiniteNumber(metres) ? (metres / 1000).toFixed(2) : UNAVAILABLE;
}
