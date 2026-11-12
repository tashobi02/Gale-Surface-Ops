/**
 * Stop task changes on the EVA tablet and their 5 s UNDO (01 FR-50; spec-change written in parallel, Sadman 2026-11-11).
 *
 * A tick or a skip is SENT AT ONCE as UPDATE_STOP_TASK {task_id, state: "DONE" | "SKIPPED", reason?}. The row shows
 * the change straight away (optimistic) and keeps showing it until the snapshot shows the task in another state than
 * it had (the change landed, or something else such as DROPPED happened), or the Hab Core rejects it.
 *
 * UNDO is offered for STOP_TASK_UNDO_WINDOW_MS of client wall-clock time and is a reversal on the server:
 * UPDATE_STOP_TASK {task_id, state: "TODO", undo: true}. TODO without `undo: true` is never sent. The Hab Core
 * rejects a reversal with INVALID (a change happened since, or the stop was dropped) or FORBIDDEN_ROLE (the sender
 * was not the actor of the last change); the reason is shown on the row. Accepting reversals is T31.04.
 *
 * Link down (`linked === false`): the change waits on the client for the window instead of going into the queue, so
 * a tick followed by UNDO inside the window cancels the pair and neither command is sent. Otherwise it is sent when
 * the window ends, and a newer change sends an older waiting one first, so the queue keeps the order. These rows read
 * "not synced". Leaving the screen sends what is waiting rather than dropping it.
 *
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CommandResult, StopTask, StopTaskReason, StopTaskState, UpdateStopTaskArgs } from "@marswalk/protocol";

/** The undo window of 01 FR-50, in client wall-clock milliseconds. */
export const STOP_TASK_UNDO_WINDOW_MS = 5000;

export type StopTaskChange = { state: "DONE" } | { state: "SKIPPED"; reason: StopTaskReason };

/** The one place the command's args are built. Only a reversal carries `undo: true`. */
export function updateStopTaskArgs(taskId: string, target: StopTaskChange | "UNDO"): UpdateStopTaskArgs {
  if (target === "UNDO") return { task_id: taskId, state: "TODO", undo: true };
  if (target.state === "SKIPPED") return { task_id: taskId, state: "SKIPPED", reason: target.reason };
  return { task_id: taskId, state: "DONE" };
}

type Send = (command: { kind: "UPDATE_STOP_TASK"; args: Record<string, unknown> }) => Promise<CommandResult>;

interface Entry {
  /** The state the row shows meanwhile. */
  shown: StopTaskState;
  reason: StopTaskReason | null;
  /** The server's state when the change started: the entry ends once the snapshot differs from it. */
  from: StopTaskState;
  /** What goes to the Hab Core. */
  args: UpdateStopTaskArgs;
  /** "waiting" is held on the client (link down); "sent" has gone to the habClient. */
  phase: "waiting" | "sent";
}

export interface StopTaskChanges {
  /** Starts a tick or skip: sent at once (held while the link is down). */
  start(taskId: string, change: StopTaskChange): void;
  /** Reverses the change UNDO is offered for: cancels it if still waiting, else sends the reversal. */
  undo(taskId: string): void;
  /** Revises the reason of a skip inside the undo window (FD-028): sends the new reason at once. */
  changeReason(taskId: string, reason: StopTaskReason): void;
  /** The task UNDO is offered for (inside the window), or null. */
  undoTaskId: string | null;
  /** `tasks` with the changes in progress shown as their new state. */
  overlay(tasks: StopTask[]): StopTask[];
  /** Tasks to mark "not synced": changes waiting on the client or queued while the link is down. */
  notSyncedTaskIds(): string[];
  /** The Hab Core's reason for each change it rejected, by task id ("INVALID: …"). */
  rejections(): Record<string, string>;
}

export function useStopTaskChanges(send: Send, serverTasks: StopTask[], linked: boolean | null): StopTaskChanges {
  const entries = useRef(new Map<string, Entry>());
  /** Rejection text and the server state it was rejected against; it clears when that state changes. */
  const rejected = useRef(new Map<string, { text: string; at: StopTaskState }>());
  const offer = useRef<{ taskId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ send, serverTasks, linked });
  latest.current = { send, serverTasks, linked };
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const serverState = (taskId: string): StopTaskState | undefined => latest.current.serverTasks.find((t) => t.task_id === taskId)?.state;

  // A change ends, and a rejection clears, once the server's state of the task is no longer the one they refer to.
  useEffect(() => {
    let changed = false;
    for (const [id, e] of entries.current) {
      const now = serverTasks.find((t) => t.task_id === id)?.state;
      if (now !== undefined && now !== e.from) {
        entries.current.delete(id);
        changed = true;
      }
    }
    for (const [id, r] of rejected.current) {
      const now = serverTasks.find((t) => t.task_id === id)?.state;
      if (now !== undefined && now !== r.at) {
        rejected.current.delete(id);
        changed = true;
      }
    }
    if (changed) rerender();
  }, [serverTasks]);

  /** Sends the entry's current args to the Hab Core and marks the entry as sent. */
  const sendEntry = useCallback((taskId: string, entry: Entry) => {
    entry.phase = "sent";
    void latest.current
      .send({ kind: "UPDATE_STOP_TASK", args: { ...entry.args } })
      .then((result) => {
        if (result.ok) return;
        // Only the entry that was sent may be undone by its own rejection: a newer one (the UNDO that replaced it) stays.
        if (entries.current.get(taskId) !== entry) return;
        // Rejected for good (INVALID, FORBIDDEN_ROLE, …): the row goes back to the server's state and says why.
        entries.current.delete(taskId);
        rejected.current.set(taskId, { text: `${result.code}: ${result.message}`, at: serverState(taskId) ?? "TODO" });
        if (mounted.current) rerender();
      });
  }, []);

  const dispatch = useCallback((taskId: string) => {
    const entry = entries.current.get(taskId);
    if (!entry || entry.phase === "sent") return;
    sendEntry(taskId, entry);
  }, [sendEntry]);

  const clearOffer = useCallback(() => {
    if (offer.current) clearTimeout(offer.current.timer);
    offer.current = null;
  }, []);

  const begin = useCallback(
    (taskId: string, entry: Entry) => {
      // Keep the queue in order: an older change still waiting goes out before this one.
      for (const [id, e] of entries.current) if (id !== taskId && e.phase === "waiting") dispatch(id);
      rejected.current.delete(taskId);
      entries.current.set(taskId, entry);
      if (latest.current.linked !== false) dispatch(taskId);
      rerender();
    },
    [dispatch],
  );

  const openWindow = useCallback(
    (taskId: string) => {
      clearOffer();
      const timer = setTimeout(() => {
        offer.current = null;
        dispatch(taskId); // a change still waiting on the client (link was down) goes out when its window ends
        if (mounted.current) rerender();
      }, STOP_TASK_UNDO_WINDOW_MS);
      offer.current = { taskId, timer };
    },
    [clearOffer, dispatch],
  );

  const start = useCallback(
    (taskId: string, change: StopTaskChange) => {
      begin(taskId, {
        shown: change.state,
        reason: change.state === "SKIPPED" ? change.reason : null,
        from: serverState(taskId) ?? "TODO",
        args: updateStopTaskArgs(taskId, change),
        phase: "waiting",
      });
      openWindow(taskId);
    },
    [begin, openWindow],
  );

  const undo = useCallback(
    (taskId: string) => {
      if (offer.current?.taskId !== taskId) return;
      const entry = entries.current.get(taskId);
      clearOffer();
      if (entry?.phase === "waiting") {
        // Never left the client: cancelling the pair sends nothing.
        entries.current.delete(taskId);
        rerender();
        return;
      }
      begin(taskId, {
        shown: "TODO",
        reason: null,
        from: entry?.shown ?? serverState(taskId) ?? "TODO",
        args: updateStopTaskArgs(taskId, "UNDO"),
        phase: "waiting",
      });
      dispatch(taskId); // the original change already went out (even if queued): its reversal follows it at once
    },
    [begin, clearOffer, dispatch],
  );

  // FD-028: the undo strip holds one REASON control that revises the reason of the skip just made. The revision is a
  // change of the same kind, so it goes out at once (FR-50: the tap is never held back on the tablet).
  const changeReason = useCallback(
    (taskId: string, reason: StopTaskReason) => {
      const entry = entries.current.get(taskId);
      if (!entry || entry.shown !== "SKIPPED") return;
      entry.reason = reason;
      entry.args = updateStopTaskArgs(taskId, { state: "SKIPPED", reason });
      sendEntry(taskId, entry);
      rerender();
    },
    [sendEntry],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearOffer();
      for (const id of [...entries.current.keys()]) dispatch(id); // nothing waiting is lost on leaving the screen
    };
  }, [clearOffer, dispatch]);

  return {
    start,
    undo,
    changeReason,
    undoTaskId: offer.current?.taskId ?? null,
    overlay: (tasks) =>
      entries.current.size === 0
        ? tasks
        : tasks.map((t) => {
            const e = entries.current.get(t.task_id);
            return e && t.state === e.from ? { ...t, state: e.shown, reason: e.reason } : t;
          }),
    notSyncedTaskIds: () => (linked === false ? [...entries.current.keys()] : [...entries.current].filter(([, e]) => e.phase === "waiting").map(([id]) => id)),
    rejections: () => Object.fromEntries([...rejected.current].map(([id, r]) => [id, r.text])),
  };
}
