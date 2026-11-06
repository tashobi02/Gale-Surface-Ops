/**
 * Stop task list on the EVA tablet (docs/specs/01 FR-50; layout 04 §E.5; mockup handoff component
 * inventory, G-30–G-34, G-40). Up to four rows of ≥ 56 px: neutral square check box, task text,
 * SKIP. Neutral chrome only — task progress is not a safety status, so no status colour. During an
 * alert the list collapses to its count; it never moves the alert slot, HAVEN, O₂ or the action row.
 * Implemented by TASK-24 (UI) and TASK-31.
 */
import type { ReactElement } from "react";
import type { CrewId, StopTask, StopTaskReason } from "@marswalk/protocol";

export interface StopTaskListProps {
  tasks: StopTask[];
  crewId: CrewId;
  stopId: string;
  /** Ops, HUD and post-acknowledgement views: no tick, skip or undo controls. */
  readOnly: boolean;
  /** The task inside its 5-s undo window (FR-50), if any. */
  undo: { taskId: string } | null;
  /** Not in the inventory: "collapsed to a count during an alert" needs it (U-59). */
  collapsed: boolean;
  /** Not in the inventory: tasks with a queued, unacknowledged command ("not synced", FR-50). */
  notSyncedTaskIds: string[];
  onTick: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onUndo: (taskId: string) => void;
  /** Skip reason capture (U-55). */
  onReason: (taskId: string, reason: StopTaskReason) => void;
}

export interface StopTaskRowProps {
  task: StopTask;
  readOnly: boolean;
  inUndoWindow: boolean;
  notSynced: boolean;
  onTick: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onUndo: (taskId: string) => void;
}

/** FR-50 task list for one crew member at one stop. TASK-24. */
export function StopTaskList(props: StopTaskListProps): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}

/** One task row: to do, done, skipped or dropped, with the word beside the glyph (04 §E.5). TASK-24. */
export function StopTaskRow(props: StopTaskRowProps): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}
