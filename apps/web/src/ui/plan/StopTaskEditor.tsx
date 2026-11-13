/**
 * SCR-04 FR-54 task drafts: native keyboard controls, assumed authored text and last-valid inline validation.
 *
 * Focus is never lost to the page body (package 25 review): a control that cannot act right now (the last task's Delete, Add with
 * a blank box or at the four-task limit) is `aria-disabled` and stays focusable instead of `disabled`, and deleting a task hands
 * focus to a neighbouring task, or to the new-task box. A POI stop whose library did not load says so, with Retry, instead of
 * claiming the stop has no tasks.
 */
import { useCallback, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import type { StopTaskKind, StopTaskSeed, TaskLibraryEntry } from "@marswalk/protocol";
import { MAX_TASKS_PER_STOP, STOP_TASK_TEXT_MAX, type PlanStore } from "../../state/planStore";
import {
  addDraft,
  editDraft,
  isStopTaskKind,
  removeDraft,
  stopTaskSource,
  taskTextError,
  TASK_KINDS,
  TASK_LIMIT_ERROR,
  TASK_MIN_ERROR,
  TASK_RULE_SOURCE,
  type TaskLibraryStatus,
} from "../../state/stopTaskDraft";
import { provAttrs } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import "./StopTaskEditor.css";

const rule = { prov: "assumed", src: TASK_RULE_SOURCE } as const;
const libraryMissing = { prov: "assumed", src: "unavailable:scenario.task_library", unavailable: true } as const;
const word = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1);
/** Where focus goes after a delete when no task is left to take it. */
const NEW_TASK_BOX = "new-task-box";

function ErrorLine({ id, message }: { id: string; message: string }): ReactElement {
  return <p id={id} role="alert" className="scr04-error">
    <StatusIcon status="warning" word="Invalid task" showWord={false} />
    <span {...provAttrs(rule)}>{message}</span>
  </p>;
}

interface TaskRowProps {
  task: StopTaskSeed;
  planStore: PlanStore;
  library: readonly TaskLibraryEntry[];
  last: boolean;
  /** Deletes the task and moves focus on; returns the reason it could not, or null. */
  onRemove: (taskId: string) => string | null;
}

function TaskRow({ task, planStore, library, last, onRemove }: TaskRowProps): ReactElement {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourced = { prov: "assumed", src: stopTaskSource(task, library) } as const;
  const edit = (text: string): void => {
    setTyped(text);
    setError(editDraft(planStore, task.task_id, { text }));
  };
  // The last task cannot go (FR-50 keeps at least one), but its button stays focusable: a disabled button drops focus to the body.
  const remove = (): void => {
    if (last) return;
    setError(onRemove(task.task_id));
  };
  return <li className="stop-task-row" data-task-id={task.task_id}>
    <div className="stop-task-fields">
      <label className="scr04-field" htmlFor={`${id}-kind`}><span className="scr04-label">Kind</span>
        <select id={`${id}-kind`} data-task-kind value={task.kind} onChange={e => { const kind = e.currentTarget.value; if (isStopTaskKind(kind)) setError(editDraft(planStore, task.task_id, { kind })); }} {...provAttrs({ prov: "assumed", src: stopTaskSource(task, library, "kind") })}>
          {TASK_KINDS.map(kind => <option key={kind} value={kind}>{word(kind)}</option>)}
        </select>
      </label>
      <button className="stops-btn" type="button" data-delete-task aria-label={`Delete task: ${task.text}`} aria-disabled={last ? true : undefined} aria-describedby={last ? `${id}-minimum` : undefined} onClick={remove}>Delete task</button>
    </div>
    <label className="scr04-field" htmlFor={`${id}-text`} data-invalid={error ? "true" : undefined}>
      <span className="scr04-label">Task text <span className="scr04-chip" aria-label="assumed">◇ Assumed</span></span>
      {/* On blur the box shows the last valid text again, so the error about the rejected text goes with it. */}
      <span className="scr04-input"><input id={`${id}-text`} data-task-text type="text" autoComplete="off" value={typed ?? task.text} onChange={e => edit(e.currentTarget.value)} onBlur={() => { setTyped(null); setError(null); }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...provAttrs(typed !== null && typed !== task.text ? { prov: "assumed", src: `user:stop_task.${task.task_id}` } : sourced)} /></span>
    </label>
    {error ? <ErrorLine id={`${id}-error`} message={error} /> : null}
    {last ? <p id={`${id}-minimum`} className="stop-task-help" {...provAttrs(rule)}>{TASK_MIN_ERROR}</p> : null}
  </li>;
}

export interface StopTaskEditorProps {
  planStore: PlanStore;
  stopId: string;
  library?: readonly TaskLibraryEntry[];
  /** N-07 fetch state. Omitted means loaded: only the screen that fetches the library knows it is loading or has failed. */
  libraryStatus?: TaskLibraryStatus;
  /** Fetches the library again; offered while it is unavailable. */
  onRetryLibrary?: () => void;
}

/** Lives inside each stop row; the start never renders an editor (03 SCR-04). */
export function StopTaskEditor({ planStore, stopId, library = [], libraryStatus = "ready", onRetryLibrary }: StopTaskEditorProps): ReactElement {
  const subscribe = useCallback((notify: () => void) => planStore.subscribe(notify), [planStore]);
  const state = useSyncExternalStore(subscribe, planStore.get, planStore.get);
  const tasks = state.stop_tasks.filter(task => task.stop_id === stopId);
  const isPoiStop = state.waypoints.some(w => w.id === stopId && Boolean(w.poi_id));
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const newTextBox = useRef<HTMLInputElement>(null);
  const focusAfterRender = useRef<string | null>(null);
  const retryPressed = useRef(false);
  const lastStatus = useRef(libraryStatus);
  const [retrying, setRetrying] = useState(false);
  const [kind, setKind] = useState<StopTaskKind>("other");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const atLimit = tasks.length >= MAX_TASKS_PER_STOP;
  const valid = taskTextError(text) === null;
  const authored = { prov: "assumed", src: `user:stop_task.${stopId}.new` } as const;
  const libraryBlocked = isPoiStop && libraryStatus !== "ready";
  const showRetry = libraryStatus === "unavailable" || (libraryStatus === "loading" && retrying);

  // Runs after every commit; acts only when a delete asked for it, or when Retry brought the library back.
  useLayoutEffect(() => {
    const target = focusAfterRender.current;
    if (target !== null) {
      focusAfterRender.current = null;
      if (target === NEW_TASK_BOX) newTextBox.current?.focus();
      else [...(details.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? [])].find(row => row.dataset.taskId === target)?.querySelector<HTMLElement>("[data-task-text]")?.focus();
    }
    const was = lastStatus.current;
    lastStatus.current = libraryStatus;
    if (was === "loading" && libraryStatus !== "loading" && retrying) setRetrying(false);
    if (libraryStatus === "ready" && retryPressed.current) {
      retryPressed.current = false;
      newTextBox.current?.focus();
    } else if (was === "loading" && libraryStatus === "unavailable") retryPressed.current = false;
  });

  const remove = (taskId: string): string | null => {
    const index = tasks.findIndex(task => task.task_id === taskId);
    focusAfterRender.current = tasks[index + 1]?.task_id ?? tasks[index - 1]?.task_id ?? NEW_TASK_BOX;
    const problem = removeDraft(planStore, taskId);
    if (problem) focusAfterRender.current = null;
    return problem;
  };
  const add = (): void => {
    if (atLimit) return;
    const problem = addDraft(planStore, stopId, { kind, text });
    setError(problem);
    if (problem) return;
    setText("");
    newTextBox.current?.focus();
  };
  const retry = (): void => {
    if (libraryStatus !== "unavailable") return;
    retryPressed.current = true;
    setRetrying(true);
    onRetryLibrary?.();
  };
  const describedBy = [error ? `${id}-error` : null, atLimit ? `${id}-limit` : null].filter(Boolean).join(" ") || undefined;

  return <details ref={details} className="stop-task-editor" data-stop-task-editor open>
    <summary className="scr04-accordion" tabIndex={0}><svg className="stop-task-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>Stop tasks <span {...provAttrs({ prov: "derived", src: "plan.stop_tasks" })}>{tasks.length}</span></summary>
    <div className="stop-task-body">
      <p className="stop-task-help" {...provAttrs(rule)}>Authored tasks · 1–{MAX_TASKS_PER_STOP} per stop · {STOP_TASK_TEXT_MAX} characters per text.</p>
      {libraryBlocked ? <div className="stop-task-library" data-task-library={libraryStatus}>
        {libraryStatus === "unavailable"
          ? <p className="stop-task-help" role="status" {...provAttrs(libraryMissing)}>Task library unavailable — suggested tasks not loaded</p>
          : <p className="stop-task-help" role="status">Loading suggested tasks…</p>}
        {showRetry ? <button className="scr04-btn" type="button" data-retry-task-library aria-disabled={libraryStatus === "loading" ? true : undefined} onClick={retry}>{libraryStatus === "loading" ? "Retrying…" : "Retry"}</button> : null}
      </div> : null}
      {tasks.length
        ? <ul className="stop-task-rows">{tasks.map(task => <TaskRow key={task.task_id} task={task} planStore={planStore} library={library} last={tasks.length === 1} onRemove={remove} />)}</ul>
        : libraryBlocked ? null : <p className="stop-task-help">No tasks. Add the first task for this stop.</p>}
      <div className="stop-task-new" role="group" aria-label="Add a stop task">
        <label className="scr04-field" htmlFor={`${id}-kind`}><span className="scr04-label">New task kind</span>
          <select id={`${id}-kind`} data-new-task-kind value={kind} aria-disabled={atLimit ? true : undefined} onChange={e => { const next = e.currentTarget.value; if (!atLimit && isStopTaskKind(next)) setKind(next); }} {...provAttrs(authored)}>{TASK_KINDS.map(value => <option key={value} value={value}>{word(value)}</option>)}</select>
        </label>
        <label className="scr04-field" htmlFor={`${id}-text`} data-invalid={error ? "true" : undefined}>
          <span className="scr04-label">New task text <span className="scr04-chip">◇ Assumed</span></span>
          <span className="scr04-input"><input ref={newTextBox} id={`${id}-text`} data-new-task-text type="text" autoComplete="off" value={text} readOnly={atLimit} aria-disabled={atLimit ? true : undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={e => { const value = e.currentTarget.value; setText(value); setError(taskTextError(value)); }} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} {...provAttrs(authored)} /></span>
        </label>
        <button className="scr04-btn" type="button" data-add-task aria-disabled={!valid || atLimit ? true : undefined} aria-describedby={atLimit ? `${id}-limit` : undefined} onClick={add}>Add task</button>
        {error ? <ErrorLine id={`${id}-error`} message={error} /> : null}
        {atLimit ? <p id={`${id}-limit`} className="stop-task-help" {...provAttrs(rule)}>{TASK_LIMIT_ERROR}</p> : null}
      </div>
    </div>
  </details>;
}
