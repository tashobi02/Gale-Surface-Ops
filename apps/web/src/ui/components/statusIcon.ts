/**
 * Status icons strictly representing operational state (04 §A.3, SCR-05).
 * Stub for T13.05.
 */
export type OperationalStatus = "ok" | "caution" | "blocked" | "unknown";

export function renderStatusIcon(status: OperationalStatus): HTMLElement {
  throw new Error("TODO(T13.05): renderStatusIcon not implemented");
}
