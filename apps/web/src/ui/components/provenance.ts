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

/** The two things every displayed value carries. */
export interface Sourced {
  readonly prov: Provenance;
  readonly src: string;
}

/**
 * DOM attributes for a displayed value: provenance class and source id on the value element itself,
 * plus the source id as the tooltip. Spread onto the element that shows the value.
 */
export function provAttrs(p: Sourced): { "data-provenance": Provenance; "data-source": string; title: string } {
  return { "data-provenance": p.prov, "data-source": p.src, title: p.src };
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
