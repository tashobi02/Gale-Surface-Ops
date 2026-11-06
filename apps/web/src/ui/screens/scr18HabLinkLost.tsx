/**
 * SCR-18 — Hab link lost / connecting (overlay) (docs/specs/03 §B; layout in docs/specs/04 §E; mode OPS / HUD, 04 §B.2).
 * Purpose: Real LAN loss (no heartbeat 3 s): banner on live roles, cached plan with ages, auto-reconnect.
 * Requirements: FR-16, FR-32, NFR-13.
 * Implemented by TASK-20, TASK-24.
 */

import type { ReactElement } from "react";

/** SCR-18 view (React, ADR-012). The owning task adds its props. TASK-20. */
export function HabLinkLost(): ReactElement {
  throw new Error("TODO(TASK-20): not implemented");
}
