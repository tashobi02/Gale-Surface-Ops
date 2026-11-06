/**
 * SCR-13 — HUD (docs/specs/03 §B; layout in docs/specs/04 §E; mode HUD, 04 §B.2).
 * Purpose: Visor glance view: at most five values, black background, ≥ 7 : 1 contrast, read-only.
 * Requirements: FR-33.
 * Implemented by TASK-24.
 */

import type { ReactElement } from "react";

/** SCR-13 view (React, ADR-012). The owning task adds its props. TASK-24. */
export function Hud(): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}
