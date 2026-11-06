/**
 * SCR-12 — EVA tablet (docs/specs/03 §B; layout in docs/specs/04 §E; mode OPS, 04 §B.2).
 * Purpose: Haven and O₂ first, next stop, mini-map, Summon / Abort with hold-to-confirm (04 §D.3), cached plan when unlinked.
 * Requirements: FR-32, FR-35, FR-39, FR-40, FR-44.
 * Implemented by TASK-24.
 */

import type { ReactElement } from "react";

/** SCR-12 view (React, ADR-012). The owning task adds its props. TASK-24. */
export function EvaTablet(): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}
