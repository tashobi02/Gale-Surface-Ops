/**
 * SCR-00 — Boot error (docs/specs/03 §B; layout in docs/specs/04 §F).
 * Purpose: Explain why the app cannot start and what to do.
 * Requirements: FR-16, NFR-10.
 * Implemented by TASK-14.
 */

import type { ReactElement } from "react";

/** SCR-00 view (React, ADR-012). The owning task adds its props. TASK-14. */
export function BootError(): ReactElement {
  throw new Error("TODO(TASK-14): not implemented");
}
