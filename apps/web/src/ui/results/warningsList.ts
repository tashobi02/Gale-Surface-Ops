/**
 * Hazard and constraint warnings list (FR-10, SCR-05).
 * Stub for T09.04 (React component, C10 v2).
 */
import type { ReactElement } from "react";
import type { Warning } from "@marswalk/protocol";

export interface WarningsListProps {
  warnings: Warning[];
}

export function WarningsList(props: WarningsListProps): ReactElement {
  throw new Error("TODO(T09.04): WarningsList not implemented");
}
