/** SCR-04 FR-54 task drafts: native keyboard controls, assumed authored text and last-valid inline validation. */
import { useCallback, useId, useState, useSyncExternalStore, type ReactElement } from "react";
import type { StopTaskKind, StopTaskSeed, TaskLibraryEntry } from "@marswalk/protocol";
import { MAX_TASKS_PER_STOP, STOP_TASK_TEXT_MAX, type PlanStore } from "../../state/planStore";
import { addDraft, editDraft, removeDraft, stopTaskSource, TASK_KINDS, TASK_LIMIT_ERROR, TASK_MIN_ERROR, TASK_RULE_SOURCE, TASK_TEXT_ERROR } from "../../state/stopTaskDraft";
import { provAttrs } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import "./StopTaskEditor.css";

const rule = { prov: "assumed", src: TASK_RULE_SOURCE } as const;
const word = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1);

function ErrorLine({ id, message }: { id: string; message: string }): ReactElement {
  return <p id={id} role="alert" className="scr04-error">
    <StatusIcon status="warning" word="Invalid task" showWord={false} />
    <span {...provAttrs(rule)}>{message}</span>
  </p>;
}

function TaskRow({ task, planStore, library, last }: { task: StopTaskSeed; planStore: PlanStore; library: readonly TaskLibraryEntry[]; last: boolean }): ReactElement {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourced = { prov: "assumed", src: stopTaskSource(task, library) } as const;
  const edit = (text: string): void => {
    setTyped(text);
    setError(editDraft(planStore, task.task_id, { text }));
  };
  return <li className="stop-task-row" data-task-id={task.task_id}>
    <div className="stop-task-fields">
      <label className="scr04-field" htmlFor={`${id}-kind`}><span className="scr04-label">Kind</span>
        <select id={`${id}-kind`} data-task-kind value={task.kind} onChange={e => setError(editDraft(planStore, task.task_id, { kind: e.currentTarget.value as StopTaskKind }))} {...provAttrs({ prov: "assumed", src: stopTaskSource(task, library, "kind") })}>
          {TASK_KINDS.map(kind => <option key={kind} value={kind}>{word(kind)}</option>)}
        </select>
      </label>
      <button className="stops-btn" type="button" data-delete-task aria-label={`Delete task: ${task.text}`} disabled={last} aria-describedby={last ? `${id}-minimum` : undefined} onClick={() => setError(removeDraft(planStore, task.task_id))}>Delete task</button>
    </div>
    <label className="scr04-field" htmlFor={`${id}-text`} data-invalid={error ? "true" : undefined}>
      <span className="scr04-label">Task text <span className="scr04-chip" aria-label="assumed">◇ Assumed</span></span>
      <span className="scr04-input"><input id={`${id}-text`} data-task-text type="text" autoComplete="off" value={typed ?? task.text} onChange={e => edit(e.currentTarget.value)} onBlur={() => setTyped(null)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...provAttrs(typed !== null && typed !== task.text ? { prov: "assumed", src: `user:stop_task.${task.task_id}` } : sourced)} /></span>
    </label>
    {error ? <ErrorLine id={`${id}-error`} message={error} /> : null}
    {last ? <p id={`${id}-minimum`} className="stop-task-help" {...provAttrs(rule)}>{TASK_MIN_ERROR}</p> : null}
  </li>;
}

export interface StopTaskEditorProps {
  planStore: PlanStore;
  stopId: string;
  library?: readonly TaskLibraryEntry[];
}

/** Lives inside each stop row; the start never renders an editor (03 SCR-04). */
export function StopTaskEditor({ planStore, stopId, library = [] }: StopTaskEditorProps): ReactElement {
  const subscribe = useCallback((notify: () => void) => planStore.subscribe(notify), [planStore]);
  const state = useSyncExternalStore(subscribe, planStore.get, planStore.get);
  const tasks = state.stop_tasks.filter(task => task.stop_id === stopId);
  const id = useId();
  const [kind, setKind] = useState<StopTaskKind>("other");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const atLimit = tasks.length >= MAX_TASKS_PER_STOP;
  const valid = text.trim().length > 0 && text.length <= STOP_TASK_TEXT_MAX;
  const authored = { prov: "assumed", src: `user:stop_task.${stopId}.new` } as const;
  return <details className="stop-task-editor" data-stop-task-editor open>
    <summary className="scr04-accordion" tabIndex={0}><svg className="stop-task-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>Stop tasks <span {...provAttrs({ prov: "derived", src: "plan.stop_tasks" })}>{tasks.length}</span></summary>
    <div className="stop-task-body">
      <p className="stop-task-help" {...provAttrs(rule)}>Authored tasks · 1–{MAX_TASKS_PER_STOP} per stop · {STOP_TASK_TEXT_MAX} characters per text.</p>
      {tasks.length ? <ul className="stop-task-rows">{tasks.map(task => <TaskRow key={task.task_id} task={task} planStore={planStore} library={library} last={tasks.length === 1} />)}</ul> : <p className="stop-task-help">No tasks. Add the first task for this stop.</p>}
      <div className="stop-task-new" role="group" aria-label="Add a stop task">
        <label className="scr04-field" htmlFor={`${id}-kind`}><span className="scr04-label">New task kind</span>
          <select id={`${id}-kind`} data-new-task-kind value={kind} onChange={e => setKind(e.currentTarget.value as StopTaskKind)} disabled={atLimit} {...provAttrs(authored)}>{TASK_KINDS.map(value => <option key={value} value={value}>{word(value)}</option>)}</select>
        </label>
        <label className="scr04-field" htmlFor={`${id}-text`} data-invalid={error ? "true" : undefined}>
          <span className="scr04-label">New task text <span className="scr04-chip">◇ Assumed</span></span>
          <span className="scr04-input"><input id={`${id}-text`} data-new-task-text type="text" autoComplete="off" value={text} disabled={atLimit} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : atLimit ? `${id}-limit` : undefined} onChange={e => { const value = e.currentTarget.value; setText(value); setError(value.trim().length > 0 && value.length <= STOP_TASK_TEXT_MAX ? null : TASK_TEXT_ERROR); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (valid && !atLimit) { const problem = addDraft(planStore, stopId, { kind, text }); setError(problem); if (!problem) setText(""); } } }} {...provAttrs(authored)} /></span>
        </label>
        <button className="scr04-btn" type="button" data-add-task disabled={!valid || atLimit} aria-describedby={atLimit ? `${id}-limit` : undefined} onClick={() => { const problem = addDraft(planStore, stopId, { kind, text }); setError(problem); if (!problem) setText(""); }}>Add task</button>
        {error ? <ErrorLine id={`${id}-error`} message={error} /> : null}
        {atLimit ? <p id={`${id}-limit`} className="stop-task-help" {...provAttrs(rule)}>{TASK_LIMIT_ERROR}</p> : null}
      </div>
    </div>
  </details>;
}
