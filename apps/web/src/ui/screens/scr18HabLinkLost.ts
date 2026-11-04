/**
 * SCR-18 — Hab link lost / connecting (overlay) (docs/specs/03 §B; layout in docs/specs/04 §E; mode OPS / HUD, 04 §B.2).
 * Purpose: Real LAN loss (no heartbeat 3 s): banner on live roles, cached plan with ages, auto-reconnect.
 * Requirements: FR-16, FR-32, NFR-13.
 * Implemented by TASK-20, TASK-24.
 */

/** Render SCR-18 into `root`. TASK-20. */
export function renderHabLinkLost(root: HTMLElement): void {
  throw new Error("TODO(TASK-20): not implemented");
}
