/**
 * Client-side hold of stop task changes for the 5 s undo window (01 FR-50: "one tap and a 5-s undo").
 *
 * A tick or a skip is held on the client for STOP_TASK_UNDO_WINDOW_MS, shown at once (DONE or SKIPPED, with UNDO), and
 * sent as one UPDATE_STOP_TASK when the window ends. UNDO inside the window cancels it on the client: nothing was sent,
 * so nothing has to be taken back, and the client never sends state "TODO" (only TODO → DONE and TODO → SKIPPED exist).
 * One change is undoable at a time: starting another sends the first at once. Leaving the screen sends what is pending
 * rather than dropping it. A change the Hab Core rejects leaves the row at the server's state, marked "not synced".
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CommandResult, StopTask, StopTaskReason } from "@marswalk/protocol";

/** The undo window of 01 FR-50. */
export const STOP_TASK_UNDO_WINDOW_MS = 5000;

export interface StopTaskChange {
  state: "DONE" | "SKIPPED";
  reason?: StopTaskReason;
}

type Send = (command: { kind: "UPDATE_STOP_TASK"; args: Record<string, unknown> }) => Promise<CommandResult>;

interface Entry {
  change: StopTaskChange;
  /** "held" is inside the undo window; "sending" awaits the Hab Core's answer. */
  phase: "held" | "sending";
}

export interface StopTaskChanges {
  /** Starts a change: held for the undo window, then sent. */
  start(taskId: string, change: StopTaskChange): void;
  /** Cancels the change held for `taskId`; sends nothing. A change already sent cannot be undone here. */
  undo(taskId: string): void;
  /** The task whose change can still be undone, or null. */
  undoTaskId: string | null;
  /** `tasks` with held and sending changes shown as their new state. */
  overlay(tasks: StopTask[]): StopTask[];
  /** Tasks to mark "not synced": rejected changes, and (while unlinked) changes still waiting for an answer. */
  notSyncedTaskIds(linked: boolean | null): string[];
}

export function useStopTaskChanges(send: Send): StopTaskChanges {
  const entries = useRef(new Map<string, Entry>());
  const failed = useRef(new Set<string>());
  const timer = useRef<{ taskId: string; id: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(true);
  const latestSend = useRef(send);
  latestSend.current = send;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current.id);
    timer.current = null;
  }, []);

  const commit = useCallback(
    (taskId: string) => {
      const entry = entries.current.get(taskId);
      if (!entry || entry.phase !== "held") return;
      if (timer.current?.taskId === taskId) clearTimer();
      entries.current.set(taskId, { ...entry, phase: "sending" });
      const { state, reason } = entry.change;
      void latestSend
        .current({ kind: "UPDATE_STOP_TASK", args: { task_id: taskId, state, ...(reason === undefined ? {} : { reason }) } })
        .then((result) => {
          entries.current.delete(taskId);
          if (!result.ok) failed.current.add(taskId);
          if (mounted.current) rerender();
        });
      if (mounted.current) rerender();
    },
    [clearTimer],
  );

  const start = useCallback(
    (taskId: string, change: StopTaskChange) => {
      if (timer.current && timer.current.taskId !== taskId) commit(timer.current.taskId);
      clearTimer();
      failed.current.delete(taskId);
      entries.current.set(taskId, { change, phase: "held" });
      timer.current = { taskId, id: setTimeout(() => commit(taskId), STOP_TASK_UNDO_WINDOW_MS) };
      rerender();
    },
    [clearTimer, commit],
  );

  const undo = useCallback(
    (taskId: string) => {
      if (entries.current.get(taskId)?.phase !== "held") return;
      if (timer.current?.taskId === taskId) clearTimer();
      entries.current.delete(taskId);
      rerender();
    },
    [clearTimer],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) commit(timer.current.taskId);
    };
  }, [commit]);

  const held = timer.current?.taskId ?? null;
  return {
    start,
    undo,
    undoTaskId: held !== null && entries.current.get(held)?.phase === "held" ? held : null,
    overlay: (tasks) =>
      entries.current.size === 0
        ? tasks
        : tasks.map((t) => {
            const entry = entries.current.get(t.task_id);
            return entry ? { ...t, state: entry.change.state, reason: entry.change.reason ?? null } : t;
          }),
    notSyncedTaskIds: (linked) => [
      ...failed.current,
      ...(linked === false ? [...entries.current].filter(([, e]) => e.phase === "sending").map(([id]) => id) : []),
    ],
  };
}
