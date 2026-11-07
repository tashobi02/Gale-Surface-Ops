/**
 * Standard metric formatter with explicit data provenance attributes (FR-15, NFR-05).
 * Stub for T12.01.
 */
import type { ProvenanceKind } from "../context";

export interface MetricProps {
  value: number | string;
  unit?: string;
  provenance: ProvenanceKind;
  sourceId: string;
  label?: string;
}

export function formatMetric(props: MetricProps): HTMLElement {
  throw new Error("TODO(T12.01): formatMetric not implemented");
}
