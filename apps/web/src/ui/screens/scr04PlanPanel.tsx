/**
 * SCR-04 — Plan panel (docs/specs/03 §B; layout in docs/specs/04 §B, §F; mockup `#scr-04-empty`, `-editing`, `-invalid-input`,
 * `-computing`). Purpose: mission inputs and the stops list. Requirements: FR-05, FR-06, FR-09, FR-15, FR-39 (haven rule).
 * Implemented by T08.04 (the form), T08.05 (the stops list, `ui/plan/stopsList.ts`) and T08.12 (haven rule, crew, vehicle).
 *
 * Inputs: one field per 05 MissionScenario input with its unit: start time in UTC with an LTST preview (FD-113: LTST is a preview,
 * never an entry), max EVA duration, dwell per stop, hard and caution slope, walkback limit, suited speed, solar phase, loop, the
 * haven rule `max_haven_min`, crew count and vehicle available. Every edit is checked by `validatePlanInput` of `@marswalk/compute`
 * (02 §E.3; the same function the worker and the Hab Core run): a valid value goes to the plan store, which sends COMPUTE_PLAN
 * 300 ms after the last edit (03 §C.3); an invalid value shows its range inline (`role="alert"`, `aria-invalid`), is never sent and
 * leaves the last valid value in effect. While the user types the field shows what was typed with the error; leaving the field
 * returns its text to the last valid value and the error stays until the next edit or Reset (FD-236).
 *
 * Start time (FD-042): no default is invented. With an empty start the panel asks the Hab Core (`fetchSessionSummary`, N-05: the scenario's
 * `eva_start_utc`; FD-239) and uses its answer when valid and the field is still empty; with no Hab Core the field stays empty and the
 * panel says "Invalid input — set a start time". Reset defaults restores every other input and keeps the start time.
 *
 * Provenance (FD-114, FR-15): every input value is `assumed` ("a parameter we chose", 01), source `scenario.<field>`; once the user
 * has edited it, `user:scenario.<field>`; the start time from the session is `session.eva_start_utc`. The LTST preview is
 * `modelled` (Mars24, `mars24-allison-mcewen-2000`) at the start waypoint's longitude, east-positive, from the working-projection
 * metres (02 §C.1); it reads "—" while the start is empty or invalid. The allowed ranges in an error are 02 §E.3's (`spec:02-E.3`).
 *
 * Layout (04 §B): the inputs are a "Constraints" accordion that collapses after the first edit, once focus has left it (so a
 * keyboard user is never moved mid-form); the badge "Defaults are assumptions — not flight rules.", Reset defaults and the stops
 * list stay visible. `data-plan-state` is `invalid | computing | empty | editing` (03 SCR-04 states, in that precedence).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import type { MissionScenario, TaskLibraryEntry } from "@marswalk/protocol";
import type { TaskLibraryStatus } from "../../state/stopTaskDraft";
import { localTrueSolarTime, validatePlanInput } from "@marswalk/compute";
import type { AppContext } from "../context";
import { Notice } from "../components/Notice";
import { PROVENANCE_GLYPHS, UNAVAILABLE, provAttrs, unavailableOf, type Sourced } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import { ensureMarsProjection, projectedToLatLonE } from "../map/projection";
import { LTST_SOURCE, RANGE_SOURCE, StopsList } from "../plan/stopsList";
import { StopTaskEditor } from "../plan/StopTaskEditor";
import "./scr04PlanPanel.css";

/** What the panel reads of `GET api/session` (N-05): only the scenario's EVA start. */
export interface SessionSummary {
  eva_start_utc?: string | null;
}

export interface PlanPanelProps {
  ctx: AppContext;
  taskLibrary?: readonly TaskLibraryEntry[];
  /** N-07 fetch state (default: loaded). A POI stop's editor says so when the library is loading or unavailable. */
  taskLibraryStatus?: TaskLibraryStatus;
  /** Fetches the task library again; the editor offers it while the library is unavailable. */
  onRetryTaskLibrary?: () => void;
  /** Reads the Hab Core's session summary; `null` when there is no Hab Core. Default: `GET api/session` on the page's own origin. */
  fetchSession?: () => Promise<SessionSummary | null>;
}

/**
 * The Hab Core's scenario start (N-05, FD-239), on the app's own origin (NFR-01: the Hab Core, never another host). The lobby summary
 * `api/session/summary` carries `eva_start_utc` only once the EVA has started; before that the scenario's start is the published plan's
 * (`plan.scenario.eva_start_utc` of `api/session`). Any failure, or a value that is not a string, is "no Hab Core".
 */
export async function fetchSessionSummary(): Promise<SessionSummary | null> {
  if (typeof fetch !== "function") return null;
  const read = async (url: string): Promise<unknown> => {
    try {
      const response = await fetch(url);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null);
  const fromSummary = record(await read("api/session/summary"))?.eva_start_utc;
  if (typeof fromSummary === "string") return { eva_start_utc: fromSummary };
  const fromPlan = record(record(record(await read("api/session"))?.plan)?.scenario)?.eva_start_utc;
  return typeof fromPlan === "string" ? { eva_start_utc: fromPlan } : null;
}

type NumberKey =
  | "max_eva_duration_h"
  | "dwell_min_per_stop"
  | "hard_slope_limit_deg"
  | "caution_slope_deg"
  | "walkback_limit_km"
  | "suited_flat_speed_kmh"
  | "max_haven_min";
type FieldKey = NumberKey | "eva_start_utc" | "solar_phase" | "loop" | "crew_count" | "vehicle_available";

const NUMBER_FIELDS: readonly { key: NumberKey; label: string; unit: string }[] = [
  { key: "max_eva_duration_h", label: "Max EVA duration", unit: "h" },
  { key: "dwell_min_per_stop", label: "Dwell per stop", unit: "min" },
  { key: "hard_slope_limit_deg", label: "Hard slope limit", unit: "°" },
  { key: "caution_slope_deg", label: "Caution slope", unit: "°" },
  { key: "walkback_limit_km", label: "Walkback limit", unit: "km" },
  { key: "suited_flat_speed_kmh", label: "Suited flat speed", unit: "km/h" },
  { key: "max_haven_min", label: "Haven rule: max time to haven", unit: "min" },
];

/** Field names as they read in `validatePlanInput` messages, replaced by the label the user sees. */
const LABELS: Record<string, string> = {
  eva_start_utc: "EVA start",
  ...Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, f.label])),
};

interface FieldError {
  /** The 02 §E.3 rule in words, with the field's label. */
  message: string;
}

function usePlanState(planStore: AppContext["planStore"]) {
  const subscribe = useCallback((onChange: () => void) => planStore.subscribe(() => onChange()), [planStore]);
  const read = useCallback(() => planStore.get(), [planStore]);
  return useSyncExternalStore(subscribe, read, read);
}

/** The first error `validatePlanInput` reports for `key` (or, for the caution slope, for its pair), in the user's words. */
function errorFor(scenario: MissionScenario, key: FieldKey, candidate: unknown): FieldError | null {
  const errors = validatePlanInput({ ...scenario, [key]: candidate });
  const related = key === "caution_slope_deg" ? new Set(["caution_slope_deg", "hard_slope_limit_deg"]) : new Set([key]);
  const found = errors.find((e) => related.has(e.field as FieldKey));
  if (!found) return null;
  let message = found.message;
  for (const [name, label] of Object.entries(LABELS)) message = message.split(name).join(label);
  return { message };
}

/** The provenance glyph chip beside a field (04 §C.1); the word is the accessible name. */
function Chip(props: { sourced: Sourced }): ReactElement | null {
  const { prov } = props.sourced;
  if (!prov) return null;
  return (
    <span className="scr04-chip" role="img" aria-label={prov.toUpperCase()} {...provAttrs(props.sourced)}>
      {PROVENANCE_GLYPHS[prov]}
    </span>
  );
}

function FieldErrorLine(props: { id: string; error: FieldError; keeping: ReactNode }): ReactElement {
  return (
    <p className="scr04-error" id={props.id} role="alert">
      <StatusIcon status="warning" showWord={false} word="Invalid input" />
      <span className="scr04-error-text">
        <span {...provAttrs({ prov: "assumed", src: RANGE_SOURCE })}>{props.error.message}</span>
        {props.keeping}
      </span>
    </p>
  );
}

/** Radio buttons with a roving tab stop and the arrow keys (WAI-ARIA radio group). */
function RadioGroup<T extends string | number>(props: {
  labelledBy: string;
  options: readonly { value: T; text: string }[];
  selected: T;
  sourced: Sourced;
  onSelect: (value: T) => void;
}): ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, delta: number): void => {
    const to = (from + delta + props.options.length) % props.options.length;
    props.onSelect(props.options[to]!.value);
    refs.current[to]?.focus();
  };
  return (
    <div className="scr04-radios" role="radiogroup" aria-labelledby={props.labelledBy} {...provAttrs(props.sourced)}>
      {props.options.map((o, i) => {
        const on = o.value === props.selected;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="scr04-radio"
            onClick={() => props.onSelect(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

/** SCR-04 plan panel (React, ADR-012). */
export function PlanPanel({ ctx, taskLibrary, taskLibraryStatus, onRetryTaskLibrary, fetchSession = fetchSessionSummary }: PlanPanelProps): ReactElement {
  const { planStore, site } = ctx;
  const plan = usePlanState(planStore);
  const scenario = plan.scenario;
  const ids = useId();
  const [drafts, setDrafts] = useState<Partial<Record<FieldKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<FieldKey, FieldError>>>({});
  const [edited, setEdited] = useState<ReadonlySet<FieldKey>>(new Set());
  const [sessionStart, setSessionStart] = useState(false);
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSessionStart = useRef<string | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const fetchRef = useRef(fetchSession);
  fetchRef.current = fetchSession;

  /**
   * FD-042/FD-482: the Hab Core's answer is a default for an empty field, never an edit of a field the user is in. Applying it
   * while the field has focus put its text behind the caret, so what the user then typed was appended to it. It is held until
   * the user leaves the field, and dropped once they have set a start of their own.
   */
  const applySessionStart = (start: string): void => {
    if (planStore.get().scenario.eva_start_utc !== "") return;
    pendingSessionStart.current = null;
    setSessionStart(true);
    planStore.setScenario({ eva_start_utc: start });
  };
  const maybeApplyPendingStart = (draftCleared = false): void => {
    const pending = pendingSessionStart.current;
    if (pending === null) return;
    if (!draftCleared && draftsRef.current.eva_start_utc !== undefined) return;
    if (errorFor(planStore.get().scenario, "eva_start_utc", pending)) return;
    applySessionStart(pending);
  };

  // FD-042: the start time's only default is the Hab Core's scenario; ask once while the field is empty.
  useEffect(() => {
    if (planStore.get().scenario.eva_start_utc !== "") return undefined;
    let alive = true;
    fetchRef.current().then(
      (summary) => {
        const start = summary?.eva_start_utc;
        if (!alive || typeof start !== "string") return;
        if (planStore.get().scenario.eva_start_utc !== "" || errorFor(planStore.get().scenario, "eva_start_utc", start)) return;
        const inField = startInputRef.current !== null && document.activeElement === startInputRef.current;
        if (inField || draftsRef.current.eva_start_utc !== undefined) {
          pendingSessionStart.current = start;
          return;
        }
        applySessionStart(start);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [planStore]);

  const sourceOf = (key: FieldKey): Sourced =>
    edited.has(key)
      ? { prov: "assumed", src: `user:scenario.${key}` }
      : key === "eva_start_utc" && sessionStart
        ? { prov: "assumed", src: "session.eva_start_utc" }
        : { prov: "assumed", src: `scenario.${key}` };

  const shownText = (key: NumberKey | "eva_start_utc"): string => drafts[key] ?? String(scenario[key]);

  const commit = (key: FieldKey, value: unknown): void => {
    if (key === "eva_start_utc") pendingSessionStart.current = null;
    setEdited((current) => new Set(current).add(key));
    setNotice(null);
    planStore.setScenario({ [key]: value } as Partial<MissionScenario>);
  };

  /** A typed value: shown as typed, checked, and sent only when valid (03 §C.3 "invalid value never sent"). */
  const edit = (key: NumberKey | "eva_start_utc", text: string): void => {
    setDrafts((d) => ({ ...d, [key]: text }));
    const candidate = key === "eva_start_utc" ? text : text.trim() === "" ? Number.NaN : Number(text);
    const error = errorFor(scenario, key, candidate);
    setErrors((e) => {
      const next = { ...e };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
    if (!error) commit(key, candidate);
  };

  /** Leaving a field returns its text to the last valid value; an error stays until the next edit (FD-236). */
  const leave = (key: NumberKey | "eva_start_utc"): void => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    if (key !== "eva_start_utc") return;
    // The draft is being cleared here, so a start the Hab Core answered while the user was in the field may now apply.
    maybeApplyPendingStart(true);
  };

  const pick = <K extends "solar_phase" | "crew_count" | "loop" | "vehicle_available">(key: K, value: MissionScenario[K]): void => {
    if (scenario[key] === value) return;
    commit(key, value);
  };

  const reset = (): void => {
    const start = planStore.get().scenario.eva_start_utc;
    planStore.resetDefaults();
    if (start !== "" && planStore.get().scenario.eva_start_utc !== start) planStore.setScenario({ eva_start_utc: start });
    setDrafts({});
    setErrors({});
    setEdited(new Set());
    setNotice(start === "" ? "Defaults restored." : "Defaults restored. The start time is kept.");
  };

  // LTST at the start waypoint for the start time (FD-113): a preview, "—" until the start is valid.
  const startWaypoint = plan.waypoints.find((w) => w.role === "start");
  const ltst = useMemo<string | null>(() => {
    const utc = scenario.eva_start_utc;
    if (!startWaypoint || utc === "" || validatePlanInput({ eva_start_utc: utc }).length > 0) return null;
    try {
      ensureMarsProjection(site.site);
      const { lon_e } = projectedToLatLonE(site.site, startWaypoint.x_m, startWaypoint.y_m);
      return localTrueSolarTime(new Date(utc), lon_e);
    } catch {
      return null;
    }
  }, [scenario.eva_start_utc, startWaypoint, site.site]);

  const startMissing = scenario.eva_start_utc === "";
  const invalid = startMissing || Object.keys(errors).length > 0;
  const stops = plan.waypoints.filter((w) => w.role === "stop").length;
  const state = invalid ? "invalid" : plan.status === "Computing" ? "computing" : stops === 0 ? "empty" : "editing";

  const keeping = (key: FieldKey, unit: string): ReactNode => {
    if (key === "eva_start_utc" && startMissing) return null;
    const last = String(scenario[key as keyof MissionScenario]);
    return (
      <>
        {" Keeping "}
        <span {...provAttrs(sourceOf(key))}>{last}</span>
        {unit ? ` ${unit}` : ""}
        {"."}
      </>
    );
  };

  const numberField = (f: (typeof NUMBER_FIELDS)[number]): ReactElement => {
    const id = `${ids}-${f.key}`;
    const error = errors[f.key];
    const sourced = sourceOf(f.key);
    return (
      <div className="scr04-field" data-field={f.key} key={f.key} data-invalid={error ? "true" : undefined}>
        <label className="scr04-label" htmlFor={id}>
          {f.label}
        </label>
        <div className="scr04-input">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={shownText(f.key)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => edit(f.key, e.currentTarget.value)}
            onBlur={() => leave(f.key)}
            {...provAttrs(sourced)}
          />
          <span className="scr04-unit">{f.unit}</span>
          <Chip sourced={sourced} />
        </div>
        {error && <FieldErrorLine id={`${id}-error`} error={error} keeping={keeping(f.key, f.unit)} />}
      </div>
    );
  };

  const switchField = (key: "loop" | "vehicle_available", label: string): ReactElement => {
    const on = scenario[key];
    const sourced = sourceOf(key);
    const labelId = `${ids}-${key}-label`;
    return (
      <div className="scr04-field scr04-inline" data-field={key} key={key}>
        <span className="scr04-label" id={labelId}>
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          className="scr04-switch"
          onClick={() => pick(key, !on)}
          {...provAttrs(sourced)}
        >
          {on ? "ON" : "OFF"}
        </button>
        <Chip sourced={sourced} />
      </div>
    );
  };

  const startId = `${ids}-eva_start_utc`;
  const startError = errors.eva_start_utc;
  const startSourced = sourceOf("eva_start_utc");
  const ltstSourced: Sourced = ltst === null ? unavailableOf("modelled", LTST_SOURCE) : { prov: "modelled", src: LTST_SOURCE };
  const phaseLabel = `${ids}-phase-label`;
  const crewLabel = `${ids}-crew-label`;

  return (
    <section className="scr04" data-slot="plan-panel" data-plan-state={state} aria-label="Plan">
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="scr04-head">
        <span className="scr04-badge" data-slot="defaults-badge">
          Defaults are assumptions — not flight rules.
        </span>
        <button type="button" className="scr04-btn" data-action="reset-defaults" onClick={reset}>
          Reset defaults
        </button>
      </div>

      <section
        className="scr04-constraints"
        ref={sectionRef}
        onBlur={(e) => {
          if (edited.size > 0 && !sectionRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <button
          type="button"
          className="scr04-accordion"
          data-action="toggle-constraints"
          aria-expanded={open}
          aria-controls={`${ids}-body`}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> Constraints
        </button>
        {open && (
          <div className="scr04-body" id={`${ids}-body`} data-slot="constraints-body">
            <div className="scr04-field" data-field="eva_start_utc" data-invalid={startError ? "true" : undefined}>
              <label className="scr04-label" htmlFor={startId}>
                EVA start (UTC)
              </label>
              <div className="scr04-input">
                <input
                  id={startId}
                  ref={startInputRef}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  value={shownText("eva_start_utc")}
                  aria-invalid={startError ? true : undefined}
                  aria-describedby={startError ? `${startId}-error` : startMissing ? `${startId}-required` : undefined}
                  onChange={(e) => edit("eva_start_utc", e.currentTarget.value)}
                  onBlur={() => leave("eva_start_utc")}
                  {...provAttrs(startSourced)}
                />
                <Chip sourced={startSourced} />
              </div>
              <div className="scr04-ltst">
                <span className="scr04-label">LTST at start</span>
                <span data-slot="start-ltst" {...provAttrs(ltstSourced)}>
                  {ltst ?? UNAVAILABLE}
                </span>
                {ltst !== null && <Chip sourced={ltstSourced} />}
              </div>
              {startError && <FieldErrorLine id={`${startId}-error`} error={startError} keeping={keeping("eva_start_utc", "")} />}
              {startMissing && !startError && (
                <p className="scr04-error" id={`${startId}-required`} role="alert">
                  <StatusIcon status="warning" showWord={false} word="Invalid input" />
                  <span className="scr04-error-text" data-slot="start-required">
                    Invalid input — set a start time
                  </span>
                </p>
              )}
            </div>

            <div className="scr04-grid">{NUMBER_FIELDS.slice(0, 6).map(numberField)}</div>

            <div className="scr04-field scr04-inline" data-field="solar_phase">
              <span className="scr04-label" id={phaseLabel}>
                Solar phase
              </span>
              <RadioGroup
                labelledBy={phaseLabel}
                options={[
                  { value: "max", text: "MAX" },
                  { value: "min", text: "MIN" },
                ]}
                selected={scenario.solar_phase}
                sourced={sourceOf("solar_phase")}
                onSelect={(v) => pick("solar_phase", v)}
              />
              <Chip sourced={sourceOf("solar_phase")} />
            </div>
            {switchField("loop", "Loop (return to hab)")}

            <div className="scr04-subhead">Haven rule, crew and vehicle</div>
            {numberField(NUMBER_FIELDS[6]!)}
            <div className="scr04-field scr04-inline" data-field="crew_count">
              <span className="scr04-label" id={crewLabel}>
                Crew
              </span>
              <RadioGroup
                labelledBy={crewLabel}
                options={[
                  { value: 1, text: "1" },
                  { value: 2, text: "2" },
                ]}
                selected={scenario.crew_count}
                sourced={sourceOf("crew_count")}
                onSelect={(v) => pick("crew_count", v)}
              />
              <Chip sourced={sourceOf("crew_count")} />
            </div>
            {switchField("vehicle_available", "Vehicle available")}
          </div>
        )}
      </section>

      <StopsList planStore={planStore} site={site} renderStopTasks={stopId => <StopTaskEditor planStore={planStore} stopId={stopId} library={taskLibrary} libraryStatus={taskLibraryStatus} onRetryLibrary={onRetryTaskLibrary} />} />
    </section>
  );
}
