/**
 * SCR-10 — Join / role select (docs/specs/03 §B; layout in docs/specs/04 §E; mode BRIEF, 04 §B.2).
 * Purpose: Put each device in the right role in < 10 s; QR deep links #/join?role=….
 * Requirements: FR-30, FR-31.
 * Implemented by TASK-25.
 */

import type { ReactElement } from "react";

/** SCR-10 view (React, ADR-012). The owning task adds its props. TASK-25. */
export function Join(): ReactElement {
  throw new Error("TODO(TASK-25): not implemented");
}
