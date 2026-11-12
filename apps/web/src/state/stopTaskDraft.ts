/** FR-54 / T32.27: library application lives beside C11, using only its public actions (FD-089). */
import type { AddStopTaskArgs, StopTaskSeed, TaskLibraryEntry } from "@marswalk/protocol";
import { MAX_TASKS_PER_STOP, STOP_TASK_TEXT_MAX, type PlanStore, type StopTaskPatch } from "./planStore";

export const TASK_KINDS = ["observe", "image", "sample", "measure", "deploy", "other"] as const;
export const TASK_RULE_SOURCE = "spec:01-FR-54";
export const TASK_TEXT_ERROR = `Task text must contain 1–${STOP_TASK_TEXT_MAX} characters. Keeping the last valid text.`;
export const TASK_LIMIT_ERROR = `A stop can carry at most ${MAX_TASKS_PER_STOP} tasks. Delete a task before adding another.`;
export const TASK_MIN_ERROR = "Keep at least one task at this stop. Edit the remaining task instead.";

function validText(text: string): boolean {
  return text.trim().length > 0 && text.length <= STOP_TASK_TEXT_MAX;
}

/** A seed id derives from its stop and library entry, so repeated POIs have distinct tasks. */
function libraryTaskId(stopId: string, libraryId: string): string {
  return `${stopId}:${libraryId}`;
}

/** The library source until text is edited; newly authored or edited text cites the planner's input. */
export function stopTaskSource(task: StopTaskSeed, library: readonly TaskLibraryEntry[], field: "text" | "kind" = "text"): string {
  const entry = library.find(e => libraryTaskId(task.stop_id, e.library_task_id) === task.task_id && e[field] === task[field]);
  return entry ? entry.source_id ?? `scenario.task_library:${entry.library_task_id}` : `user:stop_task.${task.task_id}`;
}

/** Observe additions, including a loaded demo plan and late N-07 delivery, without changing C11 or routing inputs. */
export function createStopTaskDraft(store: PlanStore, initial: readonly TaskLibraryEntry[] = []): { setLibrary(library: readonly TaskLibraryEntry[]): void; destroy(): void } {
  let library = initial;
  let seen = new Set<string>();
  let previousWaypoints = store.get().waypoints;
  let syncing = false;
  let alive = true;
  const sync = (backfill = false): void => {
    if (!alive || syncing) return;
    syncing = true;
    try {
      const state = store.get();
      const routeChanged = state.waypoints !== previousWaypoints;
      previousWaypoints = state.waypoints;
      const stops = state.waypoints.filter(w => w.role === "stop");
      const added = stops.filter(w => backfill || routeChanged || !seen.has(w.id));
      seen = new Set(stops.map(w => w.id));
      for (const stop of added) {
        // A restored/exported or already authored task list wins over the library.
        if (!stop.poi_id || store.get().stop_tasks.some(task => task.stop_id === stop.id)) continue;
        for (const entry of library.filter(e => e.poi_id === stop.poi_id).slice(0, MAX_TASKS_PER_STOP)) {
          store.addStopTask({ task_id: libraryTaskId(stop.id, entry.library_task_id), stop_id: stop.id, crew_id: entry.crew_id, kind: entry.kind, text: entry.text });
        }
      }
    } finally { syncing = false; }
  };
  const unsubscribe = store.subscribe(() => sync());
  sync();
  return {
    setLibrary(next) { library = next; sync(true); },
    destroy() { alive = false; unsubscribe(); },
  };
}

/** FR-50 limits, shared by the editor's actions and non-DOM callers. No default text is invented. */
export function addDraft(store: PlanStore, stopId: string, input: Omit<AddStopTaskArgs, "stop_id">): string | null {
  const state = store.get();
  if (!state.waypoints.some(w => w.id === stopId && w.role === "stop")) return "Choose an existing stop first.";
  if (!validText(input.text)) return TASK_TEXT_ERROR;
  if (state.stop_tasks.filter(task => task.stop_id === stopId).length >= MAX_TASKS_PER_STOP) return TASK_LIMIT_ERROR;
  let sequence = 1;
  while (state.stop_tasks.some(task => task.task_id === `${stopId}:authored-${sequence}`)) sequence += 1;
  store.addStopTask({ task_id: `${stopId}:authored-${sequence}`, stop_id: stopId, crew_id: input.crew_id ?? null, kind: input.kind ?? "other", text: input.text });
  return null;
}

export function editDraft(store: PlanStore, taskId: string, patch: StopTaskPatch): string | null {
  if (!store.get().stop_tasks.some(task => task.task_id === taskId)) return "This task is no longer in the plan.";
  if (patch.text !== undefined && !validText(patch.text)) return TASK_TEXT_ERROR;
  store.updateStopTask(taskId, patch);
  return null;
}

export function removeDraft(store: PlanStore, taskId: string): string | null {
  const state = store.get();
  const task = state.stop_tasks.find(task => task.task_id === taskId);
  if (!task) return "This task is no longer in the plan.";
  if (state.stop_tasks.filter(t => t.stop_id === task.stop_id).length <= 1) return TASK_MIN_ERROR;
  store.deleteStopTask(taskId);
  return null;
}

function isLibraryEntry(value: unknown): value is TaskLibraryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as TaskLibraryEntry;
  return typeof e.library_task_id === "string" && e.library_task_id.length > 0 &&
    typeof e.poi_id === "string" && e.poi_id.length > 0 &&
    [null, "EV1", "EV2"].includes(e.crew_id) && TASK_KINDS.includes(e.kind) &&
    typeof e.text === "string" && validText(e.text) &&
    (e.source_id === undefined || (typeof e.source_id === "string" && e.source_id.length > 0)) &&
    (!/[0-9]/.test(e.text) || typeof e.source_id === "string");
}

/** N-07, FD-171: GET session's Snapshot.task_library, on the same Hab Core origin; failure stays unavailable. */
export async function fetchTaskLibrary(signal?: AbortSignal): Promise<TaskLibraryEntry[] | null> {
  try {
    const response = await fetch("api/session", { signal });
    if (!response.ok) return null;
    const snapshot: unknown = await response.json();
    const library = snapshot && typeof snapshot === "object" && "task_library" in snapshot ? snapshot.task_library : null;
    if (!Array.isArray(library) || !library.every(isLibraryEntry)) return null;
    if (new Set(library.map(e => e.library_task_id)).size !== library.length) return null;
    return library;
  } catch { return null; }
}
