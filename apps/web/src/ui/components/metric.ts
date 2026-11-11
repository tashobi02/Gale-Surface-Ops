/**
 * Standard metric display with the provenance label and source id on the value (FR-15, NFR-05).
 * Stub for T12.01 (React component, C10 v2). Build it on `provAttrs` / `glyphOf` from ./provenance, so the
 * value carries `data-provenance` and `data-source`, and a missing value renders "—" (04 §D.1).
 */
import type { ReactElement } from "react";
import type { Sourced } from "./provenance";

export interface MetricProps extends Sourced {
  /** `null` = no value: rendered "—" and flagged unavailable. */
  value: number | string | null;
  unit?: string;
  label?: string;
}

export function Metric(props: MetricProps): ReactElement {
  throw new Error("TODO(T12.01): Metric not implemented");
}
