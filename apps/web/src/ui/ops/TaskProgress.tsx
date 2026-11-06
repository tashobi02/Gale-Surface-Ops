/**
 * Per-crew task progress on the ops crew card (docs/specs/01 FR-50; SCR-11; mockup handoff
 * component inventory). Shows "STOP n done/total · TOTAL done/total" with a `simulated` chip and an
 * "+ TASK" button that opens the ADD_STOP_TASK popover (ops only). Counts are computed from the task
 * list in the product, not looked up as in the prototype (U-53). Implemented by TASK-25 / TASK-31.
 */
import type { ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";

export interface TaskProgressProps {
  crewId: CrewId;
  /** Current stop: its number in the plan and its counts. */
  stopCount: { stopNo: number; done: number; total: number };
  /** Whole EVA for this crew member. */
  total: { done: number; total: number };
  onAdd: (crewId: CrewId) => void;
}

/** FR-50 task progress row. TASK-25. */
export function TaskProgress(props: TaskProgressProps): ReactElement {
  throw new Error("TODO(TASK-25): not implemented");
}
