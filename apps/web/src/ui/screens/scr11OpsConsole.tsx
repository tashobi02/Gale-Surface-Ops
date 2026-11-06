/**
 * SCR-11 — Ops console (docs/specs/03 §B; layout in docs/specs/04 §E; mode OPS, 04 §B.2).
 * Purpose: One screen to run and watch the whole EVA: clock control, crew and vehicle cards, map, conditions, Earth link, options, event log.
 * Requirements: FR-30–FR-38, FR-40, FR-42–FR-46.
 * Implemented by TASK-25.
 */

import type { ReactElement } from "react";

/** SCR-11 view (React, ADR-012). The owning task adds its props. TASK-25. */
export function OpsConsole(): ReactElement {
  throw new Error("TODO(TASK-25): not implemented");
}
